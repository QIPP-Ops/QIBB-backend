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

const ENDPOINTS = [
  '/api/reports/leave-summary',
  '/api/reports/attendance',
  '/api/reports/balance-snapshot',
  '/api/reports/staffing-conflicts',
  '/api/reports/kpi-scores',
  '/api/reports/balance-history',
];

function tokenFor(email) {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email,
      name: 'Test User',
      accessRole: email === 'admin@acwaops.com' ? 'admin' : 'viewer',
      crew: 'A',
      empId: '100001',
      role: 'CCR Operator',
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
    test.each(ENDPOINTS)('%s returns 403 for non-super-admin', async (path) => {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${tokenFor('ops-admin@acwaops.com')}`);
      expect(res.status).toBe(403);
    });
  });

  describe('super-admin access', () => {
    test.each(ENDPOINTS)('%s returns flat array for super admin', async (path) => {
      const res = await request(app)
        .get(path)
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
        loggedBy: 'Supervisor',
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

    const res = await request(app)
      .get('/api/reports/attendance')
      .query({ from: '2026-06-01', to: '2026-06-30' })
      .set('Authorization', `Bearer ${tokenFor('admin@acwaops.com')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]['Employee ID']).toBe('E1');
    expect(res.body[0].Date).toBe('2026-06-15');
  });
});
