jest.mock('../models/OrgLayout', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../services/rosterAuditService', () => ({
  logRosterEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const OrgLayout = require('../models/OrgLayout');
const AdminUser = require('../models/AdminUser');
const app = require('../app');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id || '507f1f77bcf86cd799439011',
      email: user.email || 'ops-admin@acwaops.com',
      role: user.role || 'admin',
      accessRole: user.accessRole || user.role || 'admin',
      empId: user.empId || '100001',
      crew: user.crew || 'A',
      name: user.name || 'Test User',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockActor(user = {}) {
  AdminUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: user.email || SUPER_ADMIN_EMAIL,
      name: user.name || 'Super Admin',
      empId: user.empId || 'SA-1',
      crew: user.crew || 'A',
      ...user,
    }),
  });
}

describe('org layout API — slot assignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActor({ email: SUPER_ADMIN_EMAIL });
  });

  test('GET /api/admin/org-layout/:crewId requires admin', async () => {
    const res = await request(app).get('/api/admin/org-layout/A');
    expect(res.status).toBe(401);
  });

  test('PATCH /api/admin/org-layout/:crewId requires super admin', async () => {
    mockActor({ email: 'ops-admin@acwaops.com' });
    const res = await request(app)
      .patch('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: 'ops-admin@acwaops.com' })}`)
      .send({ slots: { sic: '10' } });
    expect(res.status).toBe(403);
  });

  test('super admin can save and fetch slot assignments', async () => {
    const savedSlots = {
      sic: '10',
      supervisor: '11',
      'ccr-1-2': '20',
      'ccr-1-2-local': '21',
    };

    OrgLayout.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        crewId: 'A',
        slots: savedSlots,
        updatedByEmail: SUPER_ADMIN_EMAIL,
        updatedByName: 'Super Admin',
      }),
    });
    OrgLayout.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        crewId: 'A',
        slots: savedSlots,
      }),
    });

    const patch = await request(app)
      .patch('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({ slots: savedSlots });
    expect(patch.status).toBe(200);
    expect(patch.body.slots.sic).toBe('10');
    expect(patch.body.slots['ccr-1-2-local']).toBe('21');

    const get = await request(app)
      .get('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`);
    expect(get.status).toBe(200);
    expect(get.body.slots.supervisor).toBe('11');
  });

  test('super admin can save dynamic slot metadata', async () => {
    const savedSlots = {
      sic: '10',
      'ccr-1-2-extra-1': {
        empId: '25',
        role: 'Field Operator',
        groupLabel: 'GR #1-2',
      },
    };

    OrgLayout.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        crewId: 'A',
        slots: savedSlots,
        updatedByEmail: SUPER_ADMIN_EMAIL,
        updatedByName: 'Super Admin',
      }),
    });
    OrgLayout.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        crewId: 'A',
        slots: savedSlots,
      }),
    });

    const patch = await request(app)
      .patch('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({ slots: savedSlots });
    expect(patch.status).toBe(200);
    expect(patch.body.slots['ccr-1-2-extra-1']).toEqual({
      empId: '25',
      role: 'Field Operator',
      groupLabel: 'GR #1-2',
    });
  });

  test('reset clears slot assignments', async () => {
    OrgLayout.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await request(app)
      .delete('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual({});
  });

  test('GET returns empty slots when no layout saved', async () => {
    OrgLayout.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .get('/api/admin/org-layout/B')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual({});
  });
});
