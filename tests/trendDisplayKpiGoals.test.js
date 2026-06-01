const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const { buildJwtPayload } = require('../utils/jwtAuth');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';

function tokenFor(email, accessRole = 'admin') {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email,
      name: 'Test User',
      accessRole,
      crew: 'A',
      empId: '100001',
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('trend display config', () => {
  test('GET /api/admin/trend-display allows authenticated users', async () => {
    const res = await request(app)
      .get('/api/admin/trend-display')
      .set('Authorization', `Bearer ${tokenFor('viewer@acwaops.com', 'viewer')}`);
    expect([200, 503]).toContain(res.status);
  });

  test('PATCH /api/admin/trend-display blocks non super admin', async () => {
    const res = await request(app)
      .patch('/api/admin/trend-display')
      .set('Authorization', `Bearer ${tokenFor('ops-admin@acwaops.com')}`)
      .send({ panel: { panelId: 'plant_load', displayName: 'Load', metricKeys: [] } });
    expect(res.status).toBe(403);
  });
});

describe('kpi goals routes auth', () => {
  test('GET /api/kpi-goals/submissions blocks non super admin', async () => {
    const res = await request(app)
      .get('/api/kpi-goals/submissions')
      .set('Authorization', `Bearer ${tokenFor('ops-admin@acwaops.com')}`);
    expect(res.status).toBe(403);
  });

  test('POST /api/admin/users/:id/reset-password blocks non super admin', async () => {
    const res = await request(app)
      .post('/api/admin/users/507f1f77bcf86cd799439011/reset-password')
      .set('Authorization', `Bearer ${tokenFor('ops-admin@acwaops.com')}`);
    expect(res.status).toBe(403);
  });
});

describe('change password route', () => {
  test('POST /api/auth/change-password requires auth', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old', newPassword: 'newpass' });
    expect(res.status).toBe(401);
  });
});
