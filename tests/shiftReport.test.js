jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../models/ShiftReport', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/ShiftReportAuditLog', () => ({
  find: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../services/onDutyService', () => ({
  fmtDate: jest.fn(() => '2026-01-05'),
  getEmployeeDutyStatus: jest.fn().mockResolvedValue({
    date: '2026-01-05',
    empId: 'EMP-100',
    crew: 'A',
    shift: 'D',
    onDuty: true,
    onLeave: false,
    dutyLabel: 'Day',
  }),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const ShiftReport = require('../models/ShiftReport');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';

const app = require('../app');

const employee = {
  _id: '507f1f77bcf86cd799439011',
  empId: 'EMP-100',
  name: 'Test Operator',
  crew: 'A',
  role: 'CCR Operator',
  leaves: [],
};

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id || '507f1f77bcf86cd799439012',
      email: user.email || 'user@acwapower.com',
      role: user.role || 'viewer',
      accessRole: user.role || 'viewer',
      empId: user.empId || 'EMP-100',
      name: user.name || 'Test',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('personnel shift reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminUser.findOne.mockResolvedValue(employee);
    ShiftReport.find.mockImplementation(() => ({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }));
  });

  test('GET /api/personnel/shift-reports requires auth', async () => {
    const res = await request(app).get('/api/personnel/shift-reports?empId=EMP-100');
    expect(res.status).toBe(401);
  });

  test('GET /api/personnel/shift-reports rejects other empId for member', async () => {
    const token = tokenFor({ empId: 'EMP-100', role: 'viewer' });
    const res = await request(app)
      .get('/api/personnel/shift-reports?empId=EMP-OTHER&date=2026-01-05')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/personnel/shift-reports returns duty status for own empId', async () => {
    const { getEmployeeDutyStatus } = require('../services/onDutyService');
    getEmployeeDutyStatus.mockResolvedValue({
      date: '2026-01-05',
      empId: 'EMP-100',
      crew: 'A',
      shift: 'D',
      onDuty: true,
      onLeave: false,
      dutyLabel: 'Day',
    });
    const token = tokenFor({ empId: 'EMP-100', role: 'viewer' });
    const res = await request(app)
      .get('/api/personnel/shift-reports?empId=EMP-100&date=2026-01-05')
      .set('Authorization', `Bearer ${token}`);
    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.log('shift report list error:', res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.duty).toBeDefined();
    expect(typeof res.body.data.duty.onDuty).toBe('boolean');
  });
});
