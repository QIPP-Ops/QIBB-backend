jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../services/rosterAuditService', () => ({
  logRosterEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const { logRosterEvent } = require('../services/rosterAuditService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const app = require('../app');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id || '507f1f77bcf86cd799439012',
      email: user.email || 'user@acwapower.com',
      role: user.role || 'viewer',
      accessRole: user.accessRole || user.role || 'viewer',
      empId: user.empId || 'EMP-100',
      crew: user.crew || 'A',
      name: user.name || 'Test',
      canOpsLead: Boolean(user.canOpsLead),
      superAdmin: Boolean(user.superAdmin),
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockTarget(overrides = {}) {
  const target = {
    _id: '507f1f77bcf86cd799439011',
    empId: 'EMP-200',
    name: 'Crew Member',
    crew: 'A',
    compensateDayBalance: 2,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
  AdminUser.findOne.mockResolvedValue(target);
  return target;
}

function mockActor(user = {}) {
  AdminUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      email: user.email || 'admin@acwapower.com',
      name: user.name || 'Admin',
      ...user,
    }),
  });
}

describe('PATCH /api/roster/:empId/compensate-balance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth', async () => {
    const res = await request(app).patch('/api/roster/EMP-200/compensate-balance').send({ balance: 5 });
    expect(res.status).toBe(401);
  });

  test('rejects missing balance', async () => {
    mockTarget();
    const token = tokenFor({ role: 'admin', accessRole: 'admin', crew: 'A' });
    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 when employee not found', async () => {
    AdminUser.findOne.mockResolvedValue(null);
    const token = tokenFor({ role: 'admin', accessRole: 'admin', crew: 'A' });
    const res = await request(app)
      .patch('/api/roster/EMP-404/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 3 });
    expect(res.status).toBe(404);
  });

  test('allows admin editing same crew with mixed crew labels', async () => {
    const target = mockTarget({ crew: 'A', compensateDayBalance: 2 });
    mockActor({ email: 'crew.admin@acwapower.com', name: 'Crew Admin', crew: 'Crew A' });
    const token = tokenFor({
      role: 'admin',
      accessRole: 'admin',
      crew: 'Crew A',
      email: 'crew.admin@acwapower.com',
    });

    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 6 });

    expect(res.status).toBe(200);
    expect(target.compensateDayBalance).toBe(6);
  });

  test('rejects admin editing other crew', async () => {
    mockTarget({ crew: 'B' });
    const token = tokenFor({
      role: 'admin',
      accessRole: 'admin',
      crew: 'A',
      email: 'crew.admin@acwapower.com',
    });
    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 5 });
    expect(res.status).toBe(403);
  });

  test('allows admin editing same crew and audits change', async () => {
    const target = mockTarget({ crew: 'A', compensateDayBalance: 2 });
    mockActor({ email: 'crew.admin@acwapower.com', name: 'Crew Admin' });
    const token = tokenFor({
      role: 'admin',
      accessRole: 'admin',
      crew: 'A',
      email: 'crew.admin@acwapower.com',
    });

    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 7 });

    expect(res.status).toBe(200);
    expect(target.compensateDayBalance).toBe(7);
    expect(target.save).toHaveBeenCalled();

    expect(logRosterEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPENSATE_BALANCE_SET',
        summary: expect.stringContaining('2 → 7'),
        metadata: { previous: 2, next: 7 },
      })
    );

    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.LEAVE_BALANCE_EDITED,
        targetType: 'employee',
        targetId: 'EMP-200',
        targetName: 'Crew Member',
        before: { compensateDayBalance: 2 },
        after: { compensateDayBalance: 7 },
      })
    );
  });

  test('allows super admin editing any crew', async () => {
    const target = mockTarget({ crew: 'Z', compensateDayBalance: 0 });
    mockActor({ email: 'admin@acwaops.com', name: 'Super Admin' });
    const token = tokenFor({
      role: 'admin',
      accessRole: 'admin',
      crew: 'A',
      email: 'admin@acwaops.com',
    });

    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 4 });

    expect(res.status).toBe(200);
    expect(target.compensateDayBalance).toBe(4);
  });

  test('allows delegated super admin editing any crew', async () => {
    const target = mockTarget({ crew: 'Z', compensateDayBalance: 0 });
    mockActor({ email: 'b.aldogaish@nomac.com', name: 'Bander Khalid AlDogaish' });
    const token = tokenFor({
      role: 'admin',
      accessRole: 'viewer',
      crew: 'S',
      email: 'b.aldogaish@nomac.com',
      superAdmin: true,
    });

    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 4 });

    expect(res.status).toBe(200);
    expect(target.compensateDayBalance).toBe(4);
  });

  test('allows management editing same crew', async () => {
    const target = mockTarget({ crew: 'A' });
    mockActor();
    const token = tokenFor({
      role: 'management',
      accessRole: 'management',
      crew: 'A',
    });

    const res = await request(app)
      .patch('/api/roster/EMP-200/compensate-balance')
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 1 });

    expect(res.status).toBe(200);
    expect(target.compensateDayBalance).toBe(1);
  });
});
