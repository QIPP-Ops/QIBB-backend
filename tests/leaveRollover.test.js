jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
}));

jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../services/leaveBalanceLogService', () => ({
  logBalanceChange: jest.fn(),
}));

const { runYearEndRollover } = require('../services/leaveRolloverService');

describe('leaveRolloverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('runYearEndRollover caps annual balance at carryForwardCap', async () => {
    const AdminConfig = require('../models/AdminConfig');
    const AdminUser = require('../models/AdminUser');
    const { logBalanceChange } = require('../services/leaveBalanceLogService');

    AdminConfig.findOne.mockResolvedValue({ carryForwardCap: 30 });
    const save = jest.fn().mockResolvedValue(true);
    AdminUser.find.mockResolvedValue([
      { empId: 'E1', name: 'Alice', annualLeaveBalance: 45, save },
      { empId: 'E2', name: 'Bob', annualLeaveBalance: 20, save },
    ]);

    const result = await runYearEndRollover(2025, { dryRun: false, performedBy: 'SA' });

    expect(result.cap).toBe(30);
    expect(result.adjusted).toBe(1);
    expect(result.employees.find((e) => e.empId === 'E1')?.balanceAfter).toBe(30);
    expect(result.employees.find((e) => e.empId === 'E2')?.balanceAfter).toBe(20);
    expect(save).toHaveBeenCalledTimes(1);
    expect(logBalanceChange).toHaveBeenCalledWith(
      expect.objectContaining({
        empId: 'E1',
        balanceBefore: 45,
        balanceAfter: 30,
        changeType: 'manual_adjust',
      })
    );
  });

  test('dryRun preview does not persist changes', async () => {
    const AdminConfig = require('../models/AdminConfig');
    const AdminUser = require('../models/AdminUser');
    const { logBalanceChange } = require('../services/leaveBalanceLogService');

    AdminConfig.findOne.mockResolvedValue({ carryForwardCap: 30 });
    AdminUser.find.mockResolvedValue([
      { empId: 'E1', name: 'Alice', annualLeaveBalance: 50, save: jest.fn() },
    ]);

    const result = await runYearEndRollover(2025, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.employees[0].balanceAfter).toBe(30);
    expect(logBalanceChange).not.toHaveBeenCalled();
  });
});

describe('leave rollover API', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  });

  test('POST /api/admin/leave-rollover requires confirmation header', async () => {
    jest.doMock('../services/leaveRolloverService', () => ({
      runYearEndRollover: jest.fn(),
    }));

    const jwt = require('jsonwebtoken');
    const request = require('supertest');
    const app = require('../app');

    const token = jwt.sign(
      { id: 'sa1', email: 'admin@acwaops.com', role: 'admin', accessRole: 'admin', empId: 'SA', name: 'Super' },
      process.env.JWT_SECRET
    );

    const res = await request(app)
      .post('/api/admin/leave-rollover')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/X-Confirm-Rollover/i);
  });
});
