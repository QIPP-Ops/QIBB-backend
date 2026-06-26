jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildJwtPayload } = require('../utils/jwtAuth');
const AuditLog = require('../models/AuditLog');
const AdminUser = require('../models/AdminUser');
const app = require('../app');
const { logAction } = require('../services/auditLogService');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

function tokenFor(overrides = {}) {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email: 'admin@acwaops.com',
      name: 'Audit Tester',
      accessRole: 'admin',
      crew: 'A',
      empId: '100001',
      ...overrides,
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockAuditQuery(rows = [{ action: 'EMPLOYEE_CREATED' }], total = 1) {
  const lean = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn(() => ({ lean }));
  const skip = jest.fn(() => ({ limit }));
  const sort = jest.fn(() => ({ skip }));
  AuditLog.find.mockReturnValue({ sort });
  AuditLog.countDocuments.mockResolvedValue(total);
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

  test('stores actor and target crew when available', async () => {
    AuditLog.create.mockResolvedValueOnce({ _id: '1' });
    await logAction({
      actor: { email: 'crew.admin@acwapower.com', crew: 'A', name: 'Crew Admin' },
      action: 'EMPLOYEE_UPDATED',
      targetType: 'employee',
      targetId: 'E-1',
      before: { crew: 'A' },
      after: { crew: 'A', name: 'Member' },
      req: { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } },
    });
    const payload = AuditLog.create.mock.calls[0][0];
    expect(payload.actorCrew).toBe('A');
    expect(payload.targetCrew).toBe('A');
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
    AdminUser.find.mockReturnValue({
      select: () => ({
        lean: async () => [
          { email: 'crew.admin@acwapower.com', crew: 'A' },
          { email: 'member@acwapower.com', crew: 'A' },
        ],
      }),
    });
  });

  test('returns paginated audit log for super admin', async () => {
    mockAuditQuery();

    const res = await request(app)
      .get('/api/admin/audit-log?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFor({ email: 'admin@acwaops.com' })}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(AuditLog.find).toHaveBeenCalledWith({});
  });

  test('returns crew-scoped audit log for crew admin', async () => {
    mockAuditQuery([{ action: 'EMPLOYEE_UPDATED', actorCrew: 'A' }]);

    const res = await request(app)
      .get('/api/admin/audit-log?page=1&limit=10')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'crew.admin@acwapower.com', crew: 'A' })}`
      );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const filter = AuditLog.find.mock.calls[0][0];
    const clauses = filter.$and || [filter];
    const crewScope = clauses.find((clause) => Array.isArray(clause.$or));
    expect(crewScope.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorCrew: 'A' }),
        expect.objectContaining({ targetCrew: 'A' }),
      ])
    );
    const nonChatScope = clauses.find((clause) => clause.action?.$nin);
    expect(nonChatScope).toBeDefined();
  });

  test('returns 403 for regular user', async () => {
    const res = await request(app)
      .get('/api/admin/audit-log')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'user@acwapower.com', accessRole: 'viewer', crew: 'A' })}`
      );
    expect(res.status).toBe(403);
  });

  test('returns 403 for admin without crew', async () => {
    const res = await request(app)
      .get('/api/admin/audit-log')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'admin@acwapower.com', crew: '' })}`
      );
    expect(res.status).toBe(403);
  });
});
