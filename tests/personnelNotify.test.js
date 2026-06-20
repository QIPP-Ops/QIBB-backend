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

jest.mock('../services/personnelNotifyService', () => ({
  notifyPersonnelChanges: jest.fn().mockResolvedValue({ sent: true }),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const { notifyPersonnelChanges } = require('../services/personnelNotifyService');
const app = require('../app');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id || '507f1f77bcf86cd799439011',
      email: user.email || SUPER_ADMIN_EMAIL,
      role: user.role || 'admin',
      accessRole: user.accessRole || 'admin',
      empId: user.empId || '100001',
      crew: user.crew || 'A',
      name: user.name || 'Test User',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockActor() {
  AdminUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: SUPER_ADMIN_EMAIL,
      name: 'Super Admin',
      empId: 'SA-1',
      crew: 'A',
    }),
  });
}

describe('personnel notify on change', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActor();
  });

  test('PATCH /api/personnel/:empId does not notify by default', async () => {
    const existing = {
      empId: '100001',
      name: 'Worker',
      crew: 'A',
      role: 'CCR Operator',
      toObject: () => ({ empId: '100001', name: 'Worker', crew: 'A', role: 'CCR Operator' }),
    };
    AdminUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(existing),
    });
    AdminUser.findOneAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        ...existing,
        crew: 'B',
        role: 'Supervisor',
      }),
    });

    const res = await request(app)
      .patch('/api/personnel/100001')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({ crew: 'B', role: 'Supervisor' });

    expect(res.status).toBe(200);
    expect(notifyPersonnelChanges).not.toHaveBeenCalled();
  });

  test('PATCH /api/personnel/:empId notifies when notifyUser true (super admin only)', async () => {
    const existing = {
      empId: '100001',
      name: 'Worker',
      crew: 'A',
      role: 'CCR Operator',
      toObject: () => ({ empId: '100001', name: 'Worker', crew: 'A', role: 'CCR Operator' }),
    };
    AdminUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(existing),
    });
    AdminUser.findOneAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        ...existing,
        crew: 'B',
        role: 'Supervisor',
      }),
    });

    const res = await request(app)
      .patch('/api/personnel/100001')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({ crew: 'B', role: 'Supervisor', notifyUser: true });

    expect(res.status).toBe(200);
    expect(notifyPersonnelChanges).toHaveBeenCalled();
  });

  test('crew admin cannot trigger notifyUser', async () => {
    mockActor();
    AdminUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        email: 'crew-admin@test.com',
        name: 'Crew Admin',
        empId: 'CA-1',
        crew: 'A',
      }),
    });
    const existing = {
      empId: '100001',
      name: 'Worker',
      crew: 'A',
      role: 'CCR Operator',
      toObject: () => ({ empId: '100001', name: 'Worker', crew: 'A', role: 'CCR Operator' }),
    };
    AdminUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(existing),
    });
    AdminUser.findOneAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...existing, name: 'Worker Updated' }),
    });

    const res = await request(app)
      .patch('/api/personnel/100001')
      .set('Authorization', `Bearer ${tokenFor({ email: 'crew-admin@test.com', crew: 'A' })}`)
      .send({ name: 'Worker Updated', notifyUser: true });

    expect(res.status).toBe(403);
    expect(notifyPersonnelChanges).not.toHaveBeenCalled();
  });
});
