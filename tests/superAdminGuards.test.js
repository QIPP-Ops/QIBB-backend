const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app');
const { buildJwtPayload } = require('../utils/jwtAuth');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';

function tokenFor(email) {
  const isMember = email === 'member@acwaops.com';
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email,
      name: 'Test User',
      accessRole: isMember ? 'viewer' : 'admin',
      crew: 'A',
      empId: '100001',
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('super-admin write guards', () => {
  test('PATCH /api/ptw/authorizations/:personId blocks non super admin', async () => {
    const res = await request(app)
      .patch('/api/ptw/authorizations/507f1f77bcf86cd799439012')
      .set('Authorization', `Bearer ${tokenFor('ops-admin@acwaops.com')}`)
      .send({ name: 'Changed' });
    expect(res.status).toBe(403);
  });

  test('PATCH /api/personnel/:empId blocks non-admin users', async () => {
    const res = await request(app)
      .patch('/api/personnel/100001')
      .set('Authorization', `Bearer ${tokenFor('member@acwaops.com')}`)
      .send({ name: 'Changed' });
    expect(res.status).toBe(403);
  });

  test('PATCH /api/admin/crews/:crewId blocks non super admin', async () => {
    const res = await request(app)
      .patch('/api/admin/crews/A')
      .set('Authorization', `Bearer ${tokenFor('ops-admin@acwapower.com')}`)
      .send({ name: 'Alpha' });
    expect(res.status).toBe(403);
  });

  test('PUT /api/admin/group-presets blocks non super admin', async () => {
    const res = await request(app)
      .put('/api/admin/group-presets')
      .set('Authorization', `Bearer ${tokenFor('ops-admin@acwapower.com')}`)
      .send({ presets: ['BOP'] });
    expect(res.status).toBe(403);
  });
});
