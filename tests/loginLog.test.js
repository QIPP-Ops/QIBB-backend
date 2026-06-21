jest.mock('../models/LoginLog', () => ({
  create: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { buildJwtPayload } = require('../utils/jwtAuth');
const LoginLog = require('../models/LoginLog');
const app = require('../app');
const { logLoginAttempt } = require('../services/loginLogService');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

function tokenFor(email) {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email,
      name: 'Login Log Tester',
      accessRole: 'admin',
      crew: 'A',
      empId: '100001',
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('loginLogService.logLoginAttempt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a login record for successful attempt', async () => {
    LoginLog.create.mockResolvedValueOnce({ _id: '1' });
    await logLoginAttempt({
      email: 'user@acwapower.com',
      user: {
        _id: '507f1f77bcf86cd799439012',
        email: 'user@acwapower.com',
        name: 'Test User',
        accessRole: 'admin',
        crew: 'B',
      },
      success: true,
      req: { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } },
    });
    expect(LoginLog.create).toHaveBeenCalledTimes(1);
    const payload = LoginLog.create.mock.calls[0][0];
    expect(payload.email).toBe('user@acwapower.com');
    expect(payload.success).toBe(true);
    expect(payload.failureCode).toBe('');
    expect(payload.crew).toBe('B');
  });

  test('creates a failed login record with failure code', async () => {
    LoginLog.create.mockResolvedValueOnce({ _id: '2' });
    await logLoginAttempt({
      email: 'unknown@acwapower.com',
      success: false,
      failureCode: 'INVALID_CREDENTIALS',
      req: { ip: '10.0.0.1', headers: { 'user-agent': 'curl' } },
    });
    const payload = LoginLog.create.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.failureCode).toBe('INVALID_CREDENTIALS');
    expect(payload.userId).toBe('');
  });

  test('swallows DB write failures', async () => {
    LoginLog.create.mockRejectedValueOnce(new Error('save failed'));
    await expect(
      logLoginAttempt({
        email: 'user@acwapower.com',
        success: true,
        req: { ip: '127.0.0.1', headers: {} },
      })
    ).resolves.toBeUndefined();
  });
});

describe('GET /api/admin/login-logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated login logs for super admin', async () => {
    const lean = jest.fn().mockResolvedValue([{ email: 'user@acwapower.com', success: true }]);
    const limit = jest.fn(() => ({ lean }));
    const skip = jest.fn(() => ({ limit }));
    const sort = jest.fn(() => ({ skip }));
    LoginLog.find.mockReturnValue({ sort });
    LoginLog.countDocuments.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/admin/login-logs?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  test('returns 403 for non-super-admin', async () => {
    const res = await request(app)
      .get('/api/admin/login-logs')
      .set('Authorization', `Bearer ${tokenFor('regular.admin@acwapower.com')}`);

    expect(res.status).toBe(403);
  });
});
