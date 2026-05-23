jest.mock('../models/PtwAuditLog', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      })),
    })),
  })),
}));

jest.mock('../models/ShiftReport', () => ({
  findById: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue({ _id: 'report1', empId: 'EMP-100' }),
  })),
}));

jest.mock('../models/ShiftReportAuditLog', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      })),
    })),
  })),
}));

jest.mock('../models/RosterAuditLog', () => ({
  find: jest.fn(() => ({
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      })),
    })),
  })),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { isSuperAdmin, requireSuperAdmin } = require('../middleware/superAdmin');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

function tokenFor(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('superAdmin middleware', () => {
  test('isSuperAdmin matches admin@acwaops.com case-insensitively', () => {
    expect(isSuperAdmin({ user: { email: 'Admin@AcwaOps.com' } })).toBe(true);
    expect(isSuperAdmin({ user: { email: 'other@acwaops.com' } })).toBe(false);
  });

  test('requireSuperAdmin returns 403 for regular admin', () => {
    const req = { user: { email: 'admin@acwapower.com', role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    requireSuperAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('audit routes — super admin only', () => {
  test('GET /api/admin/ptw-audit returns 403 for regular admin', async () => {
    const token = tokenFor({
      id: '507f1f77bcf86cd799439011',
      email: 'regular.admin@acwapower.com',
      role: 'admin',
    });
    const res = await request(app)
      .get('/api/admin/ptw-audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/ptw-audit allows super admin', async () => {
    const token = tokenFor({
      id: '507f1f77bcf86cd799439011',
      email: 'admin@acwaops.com',
      role: 'admin',
    });
    const res = await request(app)
      .get('/api/admin/ptw-audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/roster-ops/audit returns 403 for ops lead non-super-admin', async () => {
    const token = tokenFor({
      id: '507f1f77bcf86cd799439011',
      email: 'ops.lead@acwapower.com',
      role: 'viewer',
      canOpsLead: true,
    });
    const res = await request(app)
      .get('/api/roster-ops/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/personnel/shift-reports/:id/audit returns 403 for regular admin', async () => {
    const token = tokenFor({
      id: '507f1f77bcf86cd799439011',
      email: 'regular.admin@acwapower.com',
      role: 'admin',
    });
    const res = await request(app)
      .get('/api/personnel/shift-reports/report1/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/personnel/shift-reports/:id/audit allows super admin', async () => {
    const token = tokenFor({
      id: '507f1f77bcf86cd799439011',
      email: 'admin@acwaops.com',
      role: 'admin',
    });
    const res = await request(app)
      .get('/api/personnel/shift-reports/report1/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/roster-ops/audit allows super admin', async () => {
    const token = tokenFor({
      id: '507f1f77bcf86cd799439011',
      email: 'admin@acwaops.com',
      role: 'admin',
    });
    const res = await request(app)
      .get('/api/roster-ops/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
