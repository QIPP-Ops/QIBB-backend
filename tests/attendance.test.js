jest.mock('../models/AdminUser', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/AttendanceRecord', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/attendanceReminderService', () => ({
  getAttendanceReminderStatus: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const AdminUser = require('../models/AdminUser');
const AttendanceRecord = require('../models/AttendanceRecord');
const { logAction } = require('../services/auditLogService');
const { getAttendanceReminderStatus } = require('../services/attendanceReminderService');
const { buildJwtPayload } = require('../utils/jwtAuth');

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.COSMOS_URI = 'mongodb://localhost:27017/qipp-test';
process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

const app = require('../app');

const crewAEmployee = {
  _id: '507f1f77bcf86cd799439011',
  empId: 'EMP-100',
  name: 'Test Operator',
  crew: 'A',
  role: 'CCR Operator',
};

const crewBEmployee = {
  _id: '507f1f77bcf86cd799439012',
  empId: 'EMP-200',
  name: 'Other Operator',
  crew: 'B',
  role: 'CCR Operator',
};

function tokenFor(overrides = {}) {
  const user = {
    _id: overrides.id || '507f1f77bcf86cd799439099',
    email: overrides.email || 'supervisor@acwapower.com',
    name: overrides.name || 'Supervisor User',
    accessRole: overrides.accessRole || 'viewer',
    crew: overrides.crew || 'A',
    empId: overrides.empId || 'EMP-SUP',
    role: overrides.jobRole || 'Supervisor',
    ...overrides,
  };
  return jwt.sign(buildJwtPayload(user), process.env.JWT_SECRET, { expiresIn: '1h' });
}

function mockFindChain(rows = []) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(rows),
    }),
    lean: jest.fn().mockResolvedValue(rows),
  };
}

describe('attendance API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AttendanceRecord.find.mockImplementation(() => mockFindChain([]));
    AdminUser.find.mockImplementation(() => mockFindChain([]));
    getAttendanceReminderStatus.mockResolvedValue({
      show: true,
      date: '2026-06-23',
      crew: 'A',
      isWorkingDay: true,
      expectedCount: 3,
      savedCount: 1,
      missingCount: 2,
    });
  });

  test('GET /api/attendance requires auth', async () => {
    const res = await request(app).get('/api/attendance?date=2026-06-23&crew=A');
    expect(res.status).toBe(401);
  });

  test('GET /api/attendance allows crew admin to list own crew', async () => {
    const loggerId = '6a31592c52b3edbe3b0a2142';
    AttendanceRecord.find.mockImplementation(() =>
      mockFindChain([
        {
          empId: 'EMP-100',
          date: '2026-06-23',
          crew: 'A',
          status: 'present',
          loggedBy: loggerId,
          loggedByEmail: 'm.algarni@acwapower.com',
        },
      ])
    );
    AdminUser.find.mockImplementation((query) => {
      if (query?.empId) {
        return mockFindChain([crewAEmployee]);
      }
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

    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .get('/api/attendance?date=2026-06-23&crew=A')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].loggedBy).toBe('Mohammad Algarni');
    expect(AttendanceRecord.find).toHaveBeenCalled();
  });

  test('GET /api/attendance rejects crew admin for other crew', async () => {
    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .get('/api/attendance?date=2026-06-23&crew=B')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/attendance rejects regular viewer even for own empId', async () => {
    const token = tokenFor({
      jobRole: 'CCR Operator',
      crew: 'A',
      empId: 'EMP-100',
      email: 'operator@acwapower.com',
    });
    const res = await request(app)
      .get('/api/attendance?date=2026-06-23&empId=EMP-100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/attendance rejects supervisor job role without admin access', async () => {
    const token = tokenFor({ jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .get('/api/attendance?date=2026-06-23&crew=A')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('POST /api/attendance creates record for crew admin same crew', async () => {
    AdminUser.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(crewAEmployee),
      }),
    });
    AttendanceRecord.findOne.mockResolvedValue(null);
    const supervisorId = '507f1f77bcf86cd799439088';
    AttendanceRecord.create.mockImplementation((doc) =>
      Promise.resolve({
        ...doc,
        _id: 'att-1',
        toObject: () => doc,
      })
    );

    const token = tokenFor({
      id: supervisorId,
      email: 'sic@acwapower.com',
      accessRole: 'admin',
      jobRole: 'Shift in Charge',
      crew: 'A',
      name: 'SIC Logger',
    });
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({
        empId: 'EMP-100',
        date: '2026-06-23',
        status: 'present',
        isLate: true,
        lateMinutes: 15,
        remarks: 'Traffic',
      });

    expect(res.status).toBe(201);
    expect(AttendanceRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        empId: 'EMP-100',
        loggedBy: supervisorId,
        loggedByEmail: 'sic@acwapower.com',
      })
    );
    expect(AttendanceRecord.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        loggedBy: 'EMP-100',
      })
    );
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_RECORDED' })
    );
  });

  test('POST /api/attendance rejects crew admin for other crew employee', async () => {
    AdminUser.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(crewBEmployee),
      }),
    });

    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ empId: 'EMP-200', date: '2026-06-23', status: 'absent' });

    expect(res.status).toBe(403);
  });

  test('POST /api/attendance rejects regular operator', async () => {
    const token = tokenFor({ jobRole: 'CCR Operator', crew: 'A', empId: 'EMP-100' });
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${token}`)
      .send({ empId: 'EMP-100', date: '2026-06-23', status: 'present' });

    expect(res.status).toBe(403);
  });

  test('POST /api/attendance/batch saves multiple rows', async () => {
    AdminUser.findOne.mockImplementation(({ empId }) => ({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          empId === 'EMP-100' ? crewAEmployee : { ...crewAEmployee, empId: 'EMP-101', _id: 'x2' }
        ),
      }),
    }));
    AttendanceRecord.findOne.mockResolvedValue(null);
    AttendanceRecord.create.mockImplementation((doc) =>
      Promise.resolve({
        ...doc,
        _id: `att-${doc.empId}`,
        toObject: () => doc,
      })
    );

    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .post('/api/attendance/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-06-23',
        records: [
          { empId: 'EMP-100', status: 'present' },
          { empId: 'EMP-101', status: 'absent', remarks: 'Sick' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.saved).toHaveLength(2);
    expect(AttendanceRecord.create).toHaveBeenCalledTimes(2);
  });

  test('PATCH /api/attendance/:id updates record', async () => {
    const existing = {
      _id: 'att-1',
      empId: 'EMP-100',
      date: '2026-06-23',
      crew: 'A',
      status: 'present',
      isLate: false,
      lateMinutes: 0,
      isLeftEarly: false,
      leftEarlyMinutes: 0,
      remarks: '',
      toObject() {
        return {
          _id: this._id,
          empId: this.empId,
          date: this.date,
          crew: this.crew,
          status: this.status,
          isLate: this.isLate,
          lateMinutes: this.lateMinutes,
          isLeftEarly: this.isLeftEarly,
          leftEarlyMinutes: this.leftEarlyMinutes,
          remarks: this.remarks,
        };
      },
      save: jest.fn().mockImplementation(function saveMock() {
        return Promise.resolve(this);
      }),
    };
    AttendanceRecord.findById.mockResolvedValue(existing);
    AdminUser.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(crewAEmployee),
      }),
    });

    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .patch('/api/attendance/att-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'partial', isLeftEarly: true, leftEarlyMinutes: 30 });

    expect(res.status).toBe(200);
    expect(existing.save).toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_UPDATED' })
    );
  });

  test('DELETE /api/attendance/:id requires super admin', async () => {
    const existing = {
      _id: 'att-1',
      empId: 'EMP-100',
      date: '2026-06-23',
      toObject: () => ({ empId: 'EMP-100', date: '2026-06-23' }),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    AttendanceRecord.findById.mockResolvedValue(existing);

    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .delete('/api/attendance/att-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('DELETE /api/attendance/:id allows super admin', async () => {
    const existing = {
      _id: 'att-1',
      empId: 'EMP-100',
      date: '2026-06-23',
      toObject: () => ({ empId: 'EMP-100', date: '2026-06-23' }),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    AttendanceRecord.findById.mockResolvedValue(existing);

    const token = tokenFor({ email: 'admin@acwaops.com', jobRole: 'Management', crew: 'S' });
    const res = await request(app)
      .delete('/api/attendance/att-1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(existing.deleteOne).toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_DELETED' })
    );
  });

  test('GET /api/attendance/reminder-status requires auth', async () => {
    const res = await request(app).get('/api/attendance/reminder-status');
    expect(res.status).toBe(401);
  });

  test('GET /api/attendance/reminder-status allows crew admin for own crew', async () => {
    const token = tokenFor({ accessRole: 'admin', jobRole: 'Supervisor', crew: 'A' });
    const res = await request(app)
      .get('/api/attendance/reminder-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.show).toBe(true);
    expect(getAttendanceReminderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ crew: 'A' })
    );
  });

  test('GET /api/attendance/reminder-status rejects viewer', async () => {
    const token = tokenFor({ accessRole: 'viewer', jobRole: 'CCR Operator', crew: 'A' });
    const res = await request(app)
      .get('/api/attendance/reminder-status')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
