jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildJwtPayload } = require('../utils/jwtAuth');
const AuditLog = require('../models/AuditLog');
const app = require('../app');
const { logAction } = require('../services/auditLogService');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';

function tokenFor(email) {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email,
      name: 'Audit Tester',
      accessRole: 'admin',
      crew: 'A',
      empId: '100001',
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('auditLogService.logAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates an audit record', async () => {
    AuditLog.create.mockResolvedValueOnce({ _id: '1' });
    await logAction({
      actor: { email: 'admin@acwaops.com', name: 'Admin' },
      action: 'EMPLOYEE_CREATED',
      targetType: 'employee',
      targetId: 'E-1',
      targetName: 'Member',
      before: null,
      after: { name: 'Member' },
      req: { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } },
    });
    expect(AuditLog.create).toHaveBeenCalledTimes(1);
  });

  test('redacts sensitive fields', async () => {
    AuditLog.create.mockResolvedValueOnce({ _id: '1' });
    await logAction({
      actor: { email: 'admin@acwaops.com' },
      action: 'PASSWORD_RESET',
      targetType: 'employee',
      targetId: 'E-1',
      before: { password: 'secret', resetToken: 'abc' },
      after: { token: 'xyz', nested: { passwordHash: 'hash' } },
      req: { ip: '127.0.0.1', headers: {} },
    });
    const payload = AuditLog.create.mock.calls[0][0];
    expect(payload.before.password).toBe('[REDACTED]');
    expect(payload.before.resetToken).toBe('[REDACTED]');
    expect(payload.after.token).toBe('[REDACTED]');
    expect(payload.after.nested.passwordHash).toBe('[REDACTED]');
  });

  test('swallows DB write failures', async () => {
    AuditLog.create.mockRejectedValueOnce(new Error('save failed'));
    await expect(
      logAction({
        actor: { email: 'admin@acwaops.com' },
        action: 'EMPLOYEE_UPDATED',
        targetType: 'employee',
        req: { ip: '127.0.0.1', headers: {} },
      })
    ).resolves.toBeUndefined();
  });
});

describe('GET /api/admin/audit-log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated audit log for super admin', async () => {
    const lean = jest.fn().mockResolvedValue([{ action: 'EMPLOYEE_CREATED' }]);
    const limit = jest.fn(() => ({ lean }));
    const skip = jest.fn(() => ({ limit }));
    const sort = jest.fn(() => ({ skip }));
    AuditLog.find.mockReturnValue({ sort });
    AuditLog.countDocuments.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/admin/audit-log?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  test('returns 403 for non-super-admin', async () => {
    const res = await request(app)
      .get('/api/admin/audit-log')
      .set('Authorization', `Bearer ${tokenFor('regular.admin@acwapower.com')}`);
    expect(res.status).toBe(403);
  });
});
