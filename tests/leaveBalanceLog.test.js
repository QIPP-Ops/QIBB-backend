const { logBalanceChange, getBalanceLogForEmployee } = require('../services/leaveBalanceLogService');

jest.mock('../models/LeaveBalanceLog', () => ({
  create: jest.fn(),
  find: jest.fn(),
}));

describe('leave balance log service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('logBalanceChange creates audit entry', async () => {
    const LeaveBalanceLog = require('../models/LeaveBalanceLog');
    LeaveBalanceLog.create.mockResolvedValue({ _id: 'log1' });

    const doc = await logBalanceChange({
      empId: 'E100',
      changeType: 'deduct',
      balanceField: 'annualLeaveBalance',
      delta: -2,
      balanceBefore: 10,
      balanceAfter: 8,
      leaveId: 'leave1',
      performedBy: 'ADMIN',
      reason: 'Leave approved',
    });

    expect(LeaveBalanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        empId: 'E100',
        changeType: 'deduct',
        delta: -2,
        balanceBefore: 10,
        balanceAfter: 8,
      })
    );
    expect(doc._id).toBe('log1');
  });

  test('getBalanceLogForEmployee filters by date range', async () => {
    const LeaveBalanceLog = require('../models/LeaveBalanceLog');
    LeaveBalanceLog.find.mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () => Promise.resolve([{ empId: 'E100', changeType: 'accrual' }]),
        }),
      }),
    });

    const rows = await getBalanceLogForEmployee('E100', { from: '2026-01-01', to: '2026-06-30' });
    expect(rows).toHaveLength(1);
    expect(LeaveBalanceLog.find).toHaveBeenCalledWith(
      expect.objectContaining({ empId: 'E100' })
    );
  });
});

describe('leave balance log API', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  });

  test('GET /api/roster/:empId/balance-log requires admin/management/SIC', async () => {
    jest.doMock('../models/AdminUser', () => ({
      findOne: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ empId: 'E100', name: 'Alice', crew: 'A' }),
        }),
      }),
    }));
    jest.doMock('../models/LeaveBalanceLog', () => ({
      find: jest.fn().mockReturnValue({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve([]),
          }),
        }),
      }),
    }));

    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const app = require('../app');

    const viewerToken = jwt.sign(
      { id: 'u1', email: 'v@test.com', role: 'CCR Operator', accessRole: 'viewer', empId: 'E200', name: 'Viewer' },
      process.env.JWT_SECRET
    );
    const denied = await request(app)
      .get('/api/roster/E100/balance-log')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(denied.status).toBe(403);

    const adminToken = jwt.sign(
      { id: 'a1', email: 'a@test.com', role: 'admin', accessRole: 'admin', empId: 'ADMIN', name: 'Admin', crew: 'A' },
      process.env.JWT_SECRET
    );
    const ok = await request(app)
      .get('/api/roster/E100/balance-log')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.entries).toEqual([]);
  });
});
