const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../services/rosterAuditService', () => ({
  logRosterEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const AdminUser = require('../models/AdminUser');
const { buildJwtPayload } = require('../utils/jwtAuth');
const app = require('../app');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

function tokenFor(user) {
  return jwt.sign(
    buildJwtPayload({
      _id: user.id || '507f1f77bcf86cd799439011',
      email: user.email,
      name: user.name || 'Test User',
      accessRole: user.accessRole || 'viewer',
      crew: user.crew || 'A',
      empId: user.empId || '100001',
      superAdmin: Boolean(user.superAdmin),
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('super admin access management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/admin/users/super-admin-access blocks non-managers', async () => {
    const res = await request(app)
      .get('/api/admin/users/super-admin-access')
      .set('Authorization', `Bearer ${tokenFor({ email: 'b.aldogaish@nomac.com', superAdmin: true })}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/users/super-admin-access lists users for Mohammad Algarni', async () => {
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: '507f1f77bcf86cd799439012',
              name: 'Bander Khalid AlDogaish',
              email: 'b.aldogaish@nomac.com',
              empId: '3167',
              crew: 'S',
              accessRole: 'viewer',
              superAdmin: true,
            },
          ]),
        }),
      }),
    });

    const res = await request(app)
      .get('/api/admin/users/super-admin-access')
      .set('Authorization', `Bearer ${tokenFor({ email: 'm.algarni@nomac.com', name: 'Mohammad Algarni' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe('b.aldogaish@nomac.com');
    expect(res.body[0].superAdmin).toBe(true);
  });

  test('PATCH /api/admin/users/:id/super-admin enables delegated access', async () => {
    const target = {
      _id: '507f1f77bcf86cd799439012',
      name: 'Bander Khalid AlDogaish',
      email: 'b.aldogaish@nomac.com',
      empId: '3167',
      crew: 'S',
      accessRole: 'viewer',
      superAdmin: false,
      save: jest.fn().mockResolvedValue(true),
    };
    AdminUser.findById
      .mockResolvedValueOnce(target)
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          email: 'm.algarni@nomac.com',
          name: 'Mohammad Algarni',
        }),
      });

    const res = await request(app)
      .patch(`/api/admin/users/${target._id}/super-admin`)
      .set('Authorization', `Bearer ${tokenFor({ email: 'admin@acwaops.com', name: 'Mohammad Algarni' })}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(target.superAdmin).toBe(true);
    expect(target.save).toHaveBeenCalled();
  });

  test('PATCH /api/admin/users/:id/super-admin blocks delegated admins', async () => {
    const res = await request(app)
      .patch('/api/admin/users/507f1f77bcf86cd799439012/super-admin')
      .set('Authorization', `Bearer ${tokenFor({ email: 'b.aldogaish@nomac.com', superAdmin: true })}`)
      .send({ enabled: false });

    expect(res.status).toBe(403);
  });

  test('PATCH /api/admin/users/:id/super-admin protects primary account', async () => {
    AdminUser.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      email: 'admin@acwaops.com',
      name: 'System Super Admin',
      superAdmin: false,
    });

    const res = await request(app)
      .patch('/api/admin/users/507f1f77bcf86cd799439099/super-admin')
      .set('Authorization', `Bearer ${tokenFor({ email: 'm.algarni@nomac.com', name: 'Mohammad Algarni' })}`)
      .send({ enabled: false });

    expect(res.status).toBe(400);
  });
});

describe('delegated super admin middleware', () => {
  const { isSuperAdmin, isMohammadAlgarniUser } = require('../middleware/superAdmin');

  test('grants super admin via delegated flag', () => {
    expect(
      isSuperAdmin({
        user: { email: 'b.aldogaish@nomac.com', superAdmin: true },
      })
    ).toBe(true);
  });

  test('identifies Mohammad Algarni by email and name', () => {
    expect(isMohammadAlgarniUser({ email: 'm.algarni@nomac.com' })).toBe(true);
    expect(isMohammadAlgarniUser({ email: 'admin@acwaops.com' })).toBe(true);
    expect(isMohammadAlgarniUser({ name: 'Mohammad Abdullah AlGarni' })).toBe(true);
    expect(isMohammadAlgarniUser({ email: 'b.aldogaish@nomac.com' })).toBe(false);
  });
});
