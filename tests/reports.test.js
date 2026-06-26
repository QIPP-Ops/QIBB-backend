jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/AttendanceRecord', () => ({
  find: jest.fn(),
}));

jest.mock('../models/LeaveBalanceLog', () => ({
  find: jest.fn(),
}));

jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/ShiftOverride', () => ({
  find: jest.fn(),
}));

jest.mock('../models/ActingAssignment', () => ({
  find: jest.fn(),
}));

jest.mock('../services/kpiService', () => ({
  getAllCrewKpis: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const AttendanceRecord = require('../models/AttendanceRecord');
const LeaveBalanceLog = require('../models/LeaveBalanceLog');
const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const ActingAssignment = require('../models/ActingAssignment');
const { getAllCrewKpis } = require('../services/kpiService');
const { buildJwtPayload } = require('../utils/jwtAuth');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

const app = require('../app');

const ENDPOINTS_SUPER_ADMIN_ONLY = [
  '/api/reports/leave-summary',
  '/api/reports/attendance',
  '/api/reports/balance-snapshot',
  '/api/reports/kpi-scores',
  '/api/reports/balance-history',
];

function tokenFor(emailOrOverrides) {
  const overrides =
    typeof emailOrOverrides === 'string' ? { email: emailOrOverrides } : emailOrOverrides || {};
  const email = overrides.email || 'admin@acwaops.com';
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email,
      name: 'Test User',
      accessRole:
        overrides.accessRole || (email === 'admin@acwaops.com' ? 'admin' : 'viewer'),
      crew: overrides.crew || 'A',
      empId: overrides.empId || '100001',
      role: overrides.role || 'CCR Operator',
    }),
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockFindChain(rows = []) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
}

describe('reports API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminUser.find.mockImplementation(() => mockFindChain([]));
    AdminUser.findOne.mockResolvedValue(null);
    AttendanceRecord.find.mockImplementation(() => mockFindChain([]));
    LeaveBalanceLog.find.mockImplementation(() => mockFindChain([]));
    AdminConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ shiftCycleBaseDate: '2026-01-01' }),
    });
    ShiftOverride.find.mockImplementation(() => mockFindChain([]));
    ActingAssignment.find.mockImplementation(() => mockFindChain([]));
    getAllCrewKpis.mockResolvedValue({ crews: [] });
  });

  describe('super-admin guard', () => {
    test.each(ENDPOINTS_SUPER_ADMIN_ONLY)('%s returns 403 for non-super-admin', async (path) => {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${tokenFor('ops-admin@acwaops.com')}`);
      expect(res.status).toBe(403);
    });

    test('GET /api/reports/staffing-conflicts allows crew admin', async () => {
      const res = await request(app)
        .get('/api/reports/staffing-conflicts')
        .set(
          'Authorization',
          `Bearer ${tokenFor({
            email: 'crew-admin@acwaops.com',
            accessRole: 'admin',
            crew: 'A',
          })}`
        );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('super-admin access', () => {
    test.each(ENDPOINTS_SUPER_ADMIN_ONLY)('%s returns flat array for super admin', async (path) => {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('GET /api/reports/staffing-conflicts returns flat array for super admin', async () => {
      const res = await request(app)
        .get('/api/reports/staffing-conflicts')
        .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  test('GET /api/reports/leave-summary filters by date range', async () => {
    AdminUser.find.mockImplementation(() =>
      mockFindChain([
        {
          empId: 'E1',
          name: 'Alice',
          crew: 'A',
          role: 'CCR Operator',
          createdAt: new Date('2026-01-01'),
          leaves: [
            {
              _id: 'leave1',
              start: new Date('2026-06-01'),
              end: new Date('2026-06-05'),
              type: 'Annual Leave',
              status: 'approved',
              totalDays: 5,
            },
            {
              _id: 'leave2',
              start: new Date('2025-01-01'),
              end: new Date('2025-01-03'),
              type: 'Planned',
              status: 'approved',
            },
          ],
        },
      ])
    );
    LeaveBalanceLog.find.mockImplementation(() => mockFindChain([]));

    const res = await request(app)
      .get('/api/reports/leave-summary')
      .query({ from: '2026-06-01', to: '2026-06-30' })
      .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]['Employee ID']).toBe('E1');
    expect(res.body[0].Start).toBe('2026-06-01');
  });

  test('GET /api/reports/attendance filters by date range', async () => {
    const loggerId = '6a31592c52b3edbe3b0a2142';
    const allRecords = [
      {
        empId: 'E1',
        employeeName: 'Alice',
        crew: 'A',
        date: '2026-06-15',
        status: 'present',
        isLate: false,
        lateMinutes: 0,
        isLeftEarly: false,
        leftEarlyMinutes: 0,
        remarks: '',
        loggedBy: loggerId,
        loggedByEmail: 'm.algarni@acwapower.com',
        loggedAt: new Date('2026-06-15T08:00:00Z'),
        derivedFromLeave: false,
      },
      {
        empId: 'E2',
        employeeName: 'Bob',
        crew: 'B',
        date: '2026-05-01',
        status: 'absent',
        isLate: false,
        lateMinutes: 0,
        isLeftEarly: false,
        leftEarlyMinutes: 0,
        remarks: '',
        loggedBy: '',
        loggedAt: null,
        derivedFromLeave: true,
      },
    ];

    AttendanceRecord.find.mockImplementation((query) => {
      let rows = allRecords;
      const dr = query?.date;
      if (dr?.$gte || dr?.$lte) {
        rows = rows.filter((r) => {
          if (dr.$gte && r.date < dr.$gte) return false;
          if (dr.$lte && r.date > dr.$lte) return false;
          return true;
        });
      }
      return mockFindChain(rows);
    });

    AdminUser.find.mockImplementation((query) => {
      if (query?._id) {
        return mockFindChain([
          {
            _id: loggerId,
            name: 'Mohammad Algarni',
            email: 'm.algarni@acwapower.com',
          },
        ]);
      }
      return mockFindChain([]);
    });

    const res = await request(app)
      .get('/api/reports/attendance')
      .query({ from: '2026-06-01', to: '2026-06-30' })
      .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]['Employee ID']).toBe('E1');
    expect(res.body[0].Date).toBe('2026-06-15');
    expect(res.body[0]['Logged By']).toBe('Mohammad Algarni');
  });

  test('GET /api/reports/balance-snapshot omits bank accrual rate column', async () => {
    AdminUser.find.mockImplementation(() =>
      mockFindChain([
        {
          empId: 'E1',
          name: 'Alice',
          crew: 'A',
          role: 'CCR Operator',
          annualLeaveBalance: 10,
          bankLeaveBalance: 2,
          annualLeaveAccrualRate: 0.05,
          bankLeaveAccrualRate: 0.02,
        },
      ])
    );

    const res = await request(app)
      .get('/api/reports/balance-snapshot')
      .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);

    expect(res.status).toBe(200);
    expect(res.body[0]['Annual Accrual Rate']).toBe(0.05);
    expect(res.body[0]).not.toHaveProperty('Bank Accrual Rate');
  });
});
