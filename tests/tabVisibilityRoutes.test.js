jest.mock('../models/AdminUser', () => ({
  findById: jest.fn(),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
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
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockActor(user = {}) {
  AdminUser.findById.mockImplementation((id) => {
    if (String(id) === '507f1f77bcf86cd799439011') {
      return buildTargetQuery(global.__tabVisibilityTarget);
    }
    return {
      select: jest.fn().mockResolvedValue({
        _id: user.id || '507f1f77bcf86cd799439012',
        email: user.email || 'admin@acwaops.com',
        name: user.name || 'Super Admin',
        isActive: true,
        accessRole: user.accessRole || 'admin',
      }),
    };
  });
}

function buildTargetQuery(target) {
  const query = {
    select: jest.fn().mockImplementation((fields) => {
      if (fields) {
        return {
          lean: jest.fn().mockResolvedValue({
            _id: target._id,
            name: target.name,
            email: target.email,
            tabVisibility: target.tabVisibility,
          }),
        };
      }
      return query;
    }),
  };
  query.then = (resolve, reject) => Promise.resolve(target).then(resolve, reject);
  return query;
}

function mockTarget(overrides = {}) {
  const target = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Portal User',
    email: 'user@acwapower.com',
    tabVisibility: {},
    save: jest.fn().mockImplementation(function save() {
      return Promise.resolve(this);
    }),
    ...overrides,
  };
  global.__tabVisibilityTarget = target;
  mockActor({ email: 'admin@acwaops.com', accessRole: 'admin', role: 'admin' });
  return target;
}

describe('admin tab visibility routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__tabVisibilityTarget = null;
  });

  test('GET requires super admin', async () => {
    mockTarget();
    const token = tokenFor({ email: 'admin@acwapower.com', accessRole: 'admin', role: 'admin' });
    const res = await request(app)
      .get('/api/admin/users/507f1f77bcf86cd799439011/tab-visibility')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET returns resolved visibility', async () => {
    mockTarget({ tabVisibility: { home: false } });
    const token = tokenFor({ email: 'admin@acwaops.com', accessRole: 'admin', role: 'admin' });
    const res = await request(app)
      .get('/api/admin/users/507f1f77bcf86cd799439011/tab-visibility')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tabVisibility.home).toBe(false);
    expect(res.body.tabVisibility.leave).toBe(true);
    expect(Array.isArray(res.body.tabKeys)).toBe(true);
  });

  test('PATCH updates visibility and audits', async () => {
    const target = mockTarget();
    const token = tokenFor({ email: 'admin@acwaops.com', accessRole: 'admin', role: 'admin' });
    const res = await request(app)
      .patch('/api/admin/users/507f1f77bcf86cd799439011/tab-visibility')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabVisibility: { trendStudio: false, historicalTrends: false } });
    expect(res.status).toBe(200);
    expect(res.body.tabVisibility.trendStudio).toBe(false);
    expect(res.body.tabVisibility.historicalTrends).toBe(false);
    expect(target.save).toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.TAB_VISIBILITY_CHANGED })
    );
  });

  test('PATCH rejects super-admin target', async () => {
    mockTarget({ email: 'admin@acwaops.com' });
    const token = tokenFor({ email: 'admin@acwaops.com', accessRole: 'admin', role: 'admin' });
    const res = await request(app)
      .patch('/api/admin/users/507f1f77bcf86cd799439011/tab-visibility')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabVisibility: { home: false } });
    expect(res.status).toBe(403);
  });
});
