jest.mock('../models/ActingAssignment', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  DELEGATION_STATUSES: ['pending', 'approved', 'declined', 'cancelled'],
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

jest.mock('../services/emailService', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
  emailTemplate: jest.fn((title, body) => body),
  isEmailConfigured: jest.fn().mockReturnValue(false),
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

describe('leave delegation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActor({ email: SUPER_ADMIN_EMAIL });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  test('POST /api/roster/delegations requires auth', async () => {
    const res = await request(app).post('/api/roster/delegations').send({});
    expect(res.status).toBe(401);
  });

  test('employee can request cover for self', async () => {
    mockActor({ email: 'ccr@test.com', empId: 'CCR-1', crew: 'A', role: 'CCR Operator' });
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'CCR-1',
          name: 'Absent CCR',
          crew: 'A',
          role: 'CCR Operator',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'CCR-2',
          name: 'Delegate CCR',
          crew: 'A',
          role: 'CCR Operator',
        }),
      });
    ActingAssignment.findOne.mockResolvedValue(null);
    ActingAssignment.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'CCR-1',
      coverEmpId: 'CCR-2',
      role: 'ccr_operator',
      roleAtTime: 'CCR Operator',
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
          { empId: 'CCR-1', name: 'Absent CCR' },
          { empId: 'CCR-2', name: 'Delegate CCR' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/delegations')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'ccr@test.com', empId: 'CCR-1', crew: 'A', role: 'viewer', accessRole: 'viewer' })}`
      )
      .send({
        absentEmpId: 'CCR-1',
        delegateEmpId: 'CCR-2',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(ActingAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', coverEmpId: 'CCR-2' })
    );
  });

  test('super admin can create pending delegation for any role', async () => {
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'LOC-1',
          name: 'Absent Local',
          crew: 'A',
          role: 'Local Operator',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'LOC-2',
          name: 'Delegate Local',
          crew: 'A',
          role: 'Local Operator',
        }),
      });
    ActingAssignment.findOne.mockResolvedValue(null);
    ActingAssignment.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'LOC-1',
      coverEmpId: 'LOC-2',
      role: 'local_operator',
      roleAtTime: 'Local Operator',
      crew: 'A',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'pending',
      toObject() {
        return { ...this };
      },
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'LOC-1', name: 'Absent Local' },
          { empId: 'LOC-2', name: 'Delegate Local' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/delegations')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({
        absentEmpId: 'LOC-1',
        coverEmpId: 'LOC-2',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  test('delegate can approve pending request', async () => {
    mockActor({ email: 'delegate@test.com', empId: 'CCR-2', crew: 'A' });
    const doc = {
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'CCR-1',
      coverEmpId: 'CCR-2',
      role: 'ccr_operator',
      roleAtTime: 'CCR Operator',
      crew: 'A',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'pending',
      notes: '',
      save: jest.fn().mockResolvedValue(undefined),
      toObject() {
        return { ...this };
      },
    };
    ActingAssignment.findById.mockResolvedValue(doc);
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ empId: 'CCR-1', name: 'Absent CCR' }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ empId: 'CCR-2', name: 'Delegate CCR' }),
      });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'CCR-1', name: 'Absent CCR' },
          { empId: 'CCR-2', name: 'Delegate CCR' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/delegations/507f1f77bcf86cd799439099/approve')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'delegate@test.com', empId: 'CCR-2', role: 'viewer', accessRole: 'viewer' })}`
      );

    expect(res.status).toBe(200);
    expect(doc.status).toBe('approved');
    expect(doc.save).toHaveBeenCalled();
  });

  test('non-delegate cannot approve request', async () => {
    mockActor({ email: 'other@test.com', empId: 'OTHER-1', crew: 'A' });
    ActingAssignment.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'CCR-1',
      coverEmpId: 'CCR-2',
      status: 'pending',
    });

    const res = await request(app)
      .post('/api/roster/delegations/507f1f77bcf86cd799439099/approve')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'other@test.com', empId: 'OTHER-1', role: 'viewer', accessRole: 'viewer' })}`
      );

    expect(res.status).toBe(403);
  });

  test('delegate can decline pending request', async () => {
    mockActor({ email: 'delegate@test.com', empId: 'CCR-2', crew: 'A' });
    const doc = {
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'CCR-1',
      coverEmpId: 'CCR-2',
      role: 'ccr_operator',
      roleAtTime: 'CCR Operator',
      crew: 'A',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'pending',
      save: jest.fn().mockResolvedValue(undefined),
      toObject() {
        return { ...this };
      },
    };
    ActingAssignment.findById.mockResolvedValue(doc);
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ empId: 'CCR-1', name: 'Absent CCR' }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({ empId: 'CCR-2', name: 'Delegate CCR' }),
      });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'CCR-1', name: 'Absent CCR' },
          { empId: 'CCR-2', name: 'Delegate CCR' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/delegations/507f1f77bcf86cd799439099/decline')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'delegate@test.com', empId: 'CCR-2', role: 'viewer', accessRole: 'viewer' })}`
      );

    expect(res.status).toBe(200);
    expect(doc.status).toBe('declined');
  });

  test('GET /api/roster/delegations/inbox lists pending for delegate', async () => {
    mockActor({ email: 'delegate@test.com', empId: 'CCR-2', crew: 'A' });
    ActingAssignment.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: '1',
            absentEmpId: 'CCR-1',
            coverEmpId: 'CCR-2',
            role: 'ccr_operator',
            roleAtTime: 'CCR Operator',
            crew: 'A',
            startDate: '2026-06-01',
            endDate: '2026-06-05',
            status: 'pending',
          },
        ]),
      }),
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'CCR-1', name: 'Absent CCR' },
          { empId: 'CCR-2', name: 'Delegate CCR' },
        ]),
      }),
    });

    const res = await request(app)
      .get('/api/roster/delegations/inbox')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'delegate@test.com', empId: 'CCR-2', role: 'viewer', accessRole: 'viewer' })}`
      );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].absentName).toBe('Absent CCR');
  });
});
