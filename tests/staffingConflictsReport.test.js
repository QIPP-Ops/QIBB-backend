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

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const ActingAssignment = require('../models/ActingAssignment');
const { buildJwtPayload } = require('../utils/jwtAuth');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

const app = require('../app');

function tokenFor(overrides = {}) {
  return jwt.sign(
    buildJwtPayload({
      _id: '507f1f77bcf86cd799439011',
      email: overrides.email || 'admin@acwaops.com',
      name: 'Test User',
      accessRole: overrides.accessRole || (overrides.email === 'admin@acwaops.com' ? 'admin' : 'viewer'),
      crew: overrides.crew || 'A',
      empId: overrides.empId || '100001',
      role: overrides.role || 'CCR Operator',
      ...overrides,
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

function leave(start, end) {
  return { start, end, type: 'Annual Leave', status: 'approved' };
}

function understaffedRoster() {
  return [
    {
      empId: 'A1',
      name: 'Absent One',
      crew: 'A',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      leaves: [leave('2026-07-16', '2026-07-18')],
    },
    {
      empId: 'A2',
      name: 'Absent Two',
      crew: 'A',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      leaves: [leave('2026-07-16', '2026-07-18')],
    },
    {
      empId: 'A3',
      name: 'Working CCR',
      crew: 'A',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      leaves: [],
    },
    {
      empId: 'B1',
      name: 'Backup CCR',
      crew: 'B',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      seniority: 'crew-red',
      leaves: [],
    },
  ];
}

describe('staffing conflicts report API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminConfig.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ shiftCycleBaseDate: '2026-01-01' }),
    });
    ShiftOverride.find.mockImplementation(() => mockFindChain([]));
    ActingAssignment.find.mockImplementation(() => mockFindChain([]));
  });

  test('crew admin can access staffing conflicts for own crew', async () => {
    const roster = understaffedRoster();
    AdminUser.find.mockImplementation(() => mockFindChain(roster));

    const res = await request(app)
      .get('/api/reports/staffing-conflicts')
      .query({ from: '2026-07-16', to: '2026-07-16' })
      .set(
        'Authorization',
        `Bearer ${tokenFor({
          email: 'crew-admin@acwaops.com',
          accessRole: 'admin',
          crew: 'A',
          role: 'Supervisor',
        })}`
      );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('populates suggested backups from role-based cover pool', async () => {
    const roster = understaffedRoster();
    AdminUser.find.mockImplementation(() => mockFindChain(roster));

    const res = await request(app)
      .get('/api/reports/staffing-conflicts')
      .query({ from: '2026-07-16', to: '2026-07-16', crew: 'A' })
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const row = res.body[0];
    expect(row['Conflict Type']).toBe('Staffing shortfall');
    expect(row.Shift).toBeTruthy();
    expect(row.Rotation).toBeTruthy();
    expect(row.Message).toContain('Shift');
    expect(row['Has Cover']).toBe('No');
    expect(row['Suggested Backups']).toContain('Backup CCR');
    expect(row._meta?.suggestedBackups?.length).toBeGreaterThan(0);
    expect(row._meta?.employees?.length).toBeGreaterThan(0);
  });

  test('shows assigned cover names when delegation exists', async () => {
    const roster = understaffedRoster();
    AdminUser.find.mockImplementation(() => mockFindChain(roster));
    ActingAssignment.find.mockImplementation(() =>
      mockFindChain([
        {
          _id: 'deleg1',
          absentEmpId: 'A1',
          coverEmpId: 'B1',
          crew: 'A',
          coverFromCrew: 'B',
          role: 'ccr_operator',
          roleAtTime: 'CCR Operator',
          startDate: '2026-07-16',
          endDate: '2026-07-16',
          status: 'approved',
        },
      ])
    );

    const res = await request(app)
      .get('/api/reports/staffing-conflicts')
      .query({ from: '2026-07-16', to: '2026-07-16', crew: 'A' })
      .set('Authorization', `Bearer ${tokenFor()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const row = res.body.find((r) => r.Employees.includes('Absent One'));
    expect(row).toBeTruthy();
    expect(row['Has Cover']).toMatch(/Yes|Partial/);
    expect(row['Cover Names']).toContain('Backup CCR');
  });
});
