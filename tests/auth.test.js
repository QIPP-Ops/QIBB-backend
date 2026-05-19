jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(() => ({
    select: jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: 'test@acwapower.com',
      accessRole: 'viewer',
      role: 'Shift Supervisor',
      name: 'Test User',
      empId: '100001',
      crew: 'A',
      color: 'Crew A',
    }),
  })),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const { protect, admin } = require('../middleware/auth');
const app = require('../app');

describe('auth middleware', () => {
  test('protect rejects requests without Authorization header', async () => {
    const res = await request(app).get('/api/kpis');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token/i);
  });

  test('protect rejects invalid tokens', async () => {
    const res = await request(app)
      .get('/api/kpis')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  test('protect accepts valid JWT', async () => {
    const token = jwt.sign(
      { id: '507f1f77bcf86cd799439011', email: 'test@acwapower.com', role: 'viewer' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .get('/api/auth/verify')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /api/auth/register-options is public', async () => {
    const res = await request(app).get('/api/auth/register-options');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.availableCrews)).toBe(true);
    expect(Array.isArray(res.body.availableRoles)).toBe(true);
  });

  test('admin middleware blocks non-admin roles', () => {
    const req = { user: { role: 'viewer' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    admin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('admin middleware allows admin role', () => {
    const req = { user: { role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    admin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('protect passes decoded user to request', () => {
    const token = jwt.sign({ id: 'abc', role: 'admin' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    protect(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.role).toBe('admin');
  });
});

describe('protected routes', () => {
  test('GET /health is public', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /ready returns 503 when database is not connected', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  test('GET /api/roster requires authentication', async () => {
    const res = await request(app).get('/api/roster');
    expect(res.status).toBe(401);
  });
});
