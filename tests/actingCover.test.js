jest.mock('../models/ActingAssignment', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../services/rosterAuditService', () => ({
  logRosterEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/auditLogService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const ActingAssignment = require('../models/ActingAssignment');
const AdminUser = require('../models/AdminUser');
const app = require('../app');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-chars-long';

function tokenFor(user) {
  return jwt.sign(
    {
      id: user.id || '507f1f77bcf86cd799439011',
      email: user.email || 'ops-admin@acwaops.com',
      role: user.role || 'admin',
      accessRole: user.accessRole || user.role || 'admin',
      empId: user.empId || '100001',
      crew: user.crew || 'A',
      name: user.name || 'Test User',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function mockActor(user = {}) {
  AdminUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      email: user.email || SUPER_ADMIN_EMAIL,
      name: user.name || 'Super Admin',
      empId: user.empId || 'SA-1',
      crew: user.crew || 'A',
      role: user.role || 'Management',
      ...user,
    }),
  });
}

describe('acting cover API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActor({ email: SUPER_ADMIN_EMAIL });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  test('POST /api/roster/acting-cover requires auth', async () => {
    const res = await request(app).post('/api/roster/acting-cover').send({});
    expect(res.status).toBe(401);
  });

  test('POST /api/roster/acting-cover rejects non-admin', async () => {
    const res = await request(app)
      .post('/api/roster/acting-cover')
      .set('Authorization', `Bearer ${tokenFor({ role: 'viewer', accessRole: 'viewer', email: 'viewer@test.com' })}`)
      .send({
        absentEmpId: 'SIC-1',
        coverEmpId: 'SUP-1',
        role: 'shift_in_charge',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      });
    expect(res.status).toBe(403);
  });

  test('super admin can create pending delegation', async () => {
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'SIC-1',
          name: 'Absent SIC',
          crew: 'A',
          role: 'Shift in Charge Engineer',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'SUP-1',
          name: 'Cover Sup',
          crew: 'A',
          role: 'Supervisor',
        }),
      });
    ActingAssignment.findOne.mockResolvedValue(null);
    ActingAssignment.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'SIC-1',
      coverEmpId: 'SUP-1',
      role: 'shift_in_charge',
      roleAtTime: 'Shift in Charge Engineer',
      crew: 'A',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'pending',
      notes: '',
      toObject() {
        return { ...this };
      },
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'SIC-1', name: 'Absent SIC' },
          { empId: 'SUP-1', name: 'Cover Sup' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/acting-cover')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({
        absentEmpId: 'SIC-1',
        coverEmpId: 'SUP-1',
        role: 'shift_in_charge',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.coverEmpId).toBe('SUP-1');
    expect(res.body.data.status).toBe('pending');
    expect(ActingAssignment.create).toHaveBeenCalled();
  });

  test('crew admin cannot assign acting cover for another crew', async () => {
    mockActor({ email: 'crew-admin@test.com', crew: 'B' });
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'SIC-1',
          name: 'Absent SIC',
          crew: 'A',
          role: 'Shift in Charge Engineer',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'SUP-1',
          name: 'Cover Sup',
          crew: 'A',
          role: 'Supervisor',
        }),
      });

    const res = await request(app)
      .post('/api/roster/acting-cover')
      .set('Authorization', `Bearer ${tokenFor({ email: 'crew-admin@test.com', crew: 'B' })}`)
      .send({
        absentEmpId: 'SIC-1',
        coverEmpId: 'SUP-1',
        role: 'shift_in_charge',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      });

    expect(res.status).toBe(403);
  });

  test('GET /api/roster/acting-cover lists assignments', async () => {
    ActingAssignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: '1',
            absentEmpId: 'SIC-1',
            coverEmpId: 'SUP-1',
            role: 'shift_in_charge',
            crew: 'A',
            startDate: '2026-06-01',
            endDate: '2026-06-05',
          },
        ]),
      }),
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'SIC-1', name: 'Absent SIC' },
          { empId: 'SUP-1', name: 'Cover Sup' },
        ]),
      }),
    });

    const res = await request(app)
      .get('/api/roster/acting-cover?crew=A')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].coverName).toBe('Cover Sup');
  });

  test('DELETE /api/roster/acting-cover/:id removes assignment', async () => {
    const doc = {
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'SIC-1',
      coverEmpId: 'SUP-1',
      role: 'shift_in_charge',
      crew: 'A',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      deleteOne: jest.fn().mockResolvedValue(undefined),
      toObject() {
        return { ...this };
      },
    };
    ActingAssignment.findById.mockResolvedValue(doc);
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ empId: 'SIC-1', name: 'Absent SIC' }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ empId: 'SUP-1', name: 'Cover Sup' }),
      });

    const res = await request(app)
      .delete('/api/roster/acting-cover/507f1f77bcf86cd799439099')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`);

    expect(res.status).toBe(200);
    expect(doc.deleteOne).toHaveBeenCalled();
  });
});
