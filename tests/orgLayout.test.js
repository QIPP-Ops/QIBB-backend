jest.mock('../models/OrgLayout', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
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

function mockTarget(overrides = {}) {
  const target = {
    empId: '100001',
    name: 'Crew Member',
    crew: 'A',
    toObject: () => ({ empId: '100001', name: 'Crew Member', crew: 'A', ...overrides }),
    ...overrides,
  };
  AdminUser.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(target),
  });
  AdminUser.findOneAndUpdate.mockReturnValue({
    select: jest.fn().mockResolvedValue({ ...target, name: overrides.name || target.name }),
  });
  return target;
}

describe('org layout API', () => {
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
      .send({ nodes: [{ empId: '1', parentEmpId: '' }] });
    expect(res.status).toBe(403);
  });

  test('super admin can save and fetch org layout', async () => {
    OrgLayout.findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        crewId: 'A',
        manual: true,
        nodes: [
          { empId: '10', parentEmpId: '', x: 10, y: 10, order: 0 },
          { empId: '20', parentEmpId: '10', x: 40, y: 120, order: 1 },
        ],
        updatedByEmail: SUPER_ADMIN_EMAIL,
        updatedByName: 'Super Admin',
      }),
    });
    OrgLayout.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        crewId: 'A',
        manual: true,
        nodes: [
          { empId: '10', parentEmpId: '', x: 10, y: 10, order: 0 },
          { empId: '20', parentEmpId: '10', x: 40, y: 120, order: 1 },
        ],
      }),
    });

    const patch = await request(app)
      .patch('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({
        manual: true,
        nodes: [
          { empId: '10', parentEmpId: '', x: 10, y: 10, order: 0 },
          { empId: '20', parentEmpId: '10', x: 40, y: 120, order: 1 },
        ],
      });
    expect(patch.status).toBe(200);
    expect(patch.body.nodes).toHaveLength(2);

    const get = await request(app)
      .get('/api/admin/org-layout/A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`);
    expect(get.status).toBe(200);
    expect(get.body.manual).toBe(true);
    expect(get.body.nodes[1].parentEmpId).toBe('10');
  });
});

describe('personnel inline patch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActor({ email: 'ops-admin@acwaops.com', crew: 'A' });
  });

  test('crew admin can patch name for same crew', async () => {
    mockTarget();
    AdminUser.findOneAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        empId: '100001',
        name: 'Updated Name',
        crew: 'A',
        toObject: () => ({ empId: '100001', name: 'Updated Name', crew: 'A' }),
      }),
    });

    const res = await request(app)
      .patch('/api/personnel/100001')
      .set('Authorization', `Bearer ${tokenFor({ email: 'ops-admin@acwaops.com', crew: 'A' })}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
  });

  test('crew admin cannot patch role', async () => {
    mockTarget();
    const res = await request(app)
      .patch('/api/personnel/100001')
      .set('Authorization', `Bearer ${tokenFor({ email: 'ops-admin@acwaops.com', crew: 'A' })}`)
      .send({ role: 'Management' });
    expect(res.status).toBe(400);
  });
});
