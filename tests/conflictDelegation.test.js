jest.mock('../models/ActingAssignment', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  DELEGATION_STATUSES: ['pending', 'approved', 'declined', 'cancelled'],
  DELEGATION_SOURCES: ['leave_request', 'conflict_resolution'],
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
const { filterConflictsByDelegations } = require('../services/actingCoverService');

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

describe('conflict delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActor({ email: SUPER_ADMIN_EMAIL });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  test('POST /api/roster/delegations/resolve-conflict requires admin', async () => {
    mockActor({ email: 'ccr@test.com', empId: 'CCR-1', crew: 'A', role: 'CCR Operator' });
    const res = await request(app)
      .post('/api/roster/delegations/resolve-conflict')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'ccr@test.com', empId: 'CCR-1', crew: 'A', role: 'viewer', accessRole: 'viewer' })}`
      )
      .send({});
    expect(res.status).toBe(403);
  });

  test('super admin can resolve conflict with cross-crew cover (auto-approved)', async () => {
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'E1',
          name: 'Alice',
          crew: 'A',
          role: 'CCR Operator',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'E2',
          name: 'Bob',
          crew: 'B',
          role: 'CCR Operator',
        }),
      });
    ActingAssignment.findOne.mockResolvedValue(null);
    ActingAssignment.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439099',
      absentEmpId: 'E1',
      coverEmpId: 'E2',
      role: 'ccr_operator',
      roleAtTime: 'CCR Operator',
      crew: 'A',
      coverFromCrew: 'B',
      startDate: '2026-06-01',
      endDate: '2026-06-04',
      status: 'approved',
      source: 'conflict_resolution',
      conflictKey: 'high|A|E1,E2|2026-06-01',
      toObject() {
        return { ...this };
      },
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'E1', name: 'Alice', crew: 'A' },
          { empId: 'E2', name: 'Bob', crew: 'B' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/delegations/resolve-conflict')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({
        absentEmpId: 'E1',
        coverEmpId: 'E2',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
        conflictKey: 'high|A|E1,E2|2026-06-01',
        notes: 'Cycle cover',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('approved');
    expect(ActingAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'approved',
        source: 'conflict_resolution',
        coverEmpId: 'E2',
        coverFromCrew: 'B',
        conflictKey: 'high|A|E1,E2|2026-06-01',
      })
    );
  });

  test('portal admin cannot resolve conflict for another crew', async () => {
    mockActor({ email: 'admin@test.com', empId: 'ADM-1', crew: 'A', role: 'Management', accessRole: 'admin' });
    const res = await request(app)
      .post('/api/roster/delegations/resolve-conflict')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: 'admin@test.com', empId: 'ADM-1', crew: 'A', role: 'admin', accessRole: 'admin' })}`
      )
      .send({
        absentEmpId: 'E1',
        coverEmpId: 'E2',
        crew: 'B',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
      });
    expect(res.status).toBe(403);
  });

  test('rejects conflict delegation when cover role does not match', async () => {
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'E1',
          name: 'Alice',
          crew: 'A',
          role: 'CCR Operator',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'E2',
          name: 'Bob',
          crew: 'B',
          role: 'Local Operator',
        }),
      });

    const res = await request(app)
      .post('/api/roster/delegations/resolve-conflict')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({
        absentEmpId: 'E1',
        coverEmpId: 'E2',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/matching role/i);
    expect(ActingAssignment.create).not.toHaveBeenCalled();
  });

  test('allows SIC to cover for Supervisor', async () => {
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'SIC1',
          name: 'SIC Alice',
          crew: 'A',
          role: 'Shift in Charge Engineer',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'SUP1',
          name: 'Super Bob',
          crew: 'B',
          role: 'Supervisor',
        }),
      });
    ActingAssignment.findOne.mockResolvedValue(null);
    ActingAssignment.create.mockResolvedValue({
      _id: '507f1f77bcf86cd799439088',
      absentEmpId: 'SIC1',
      coverEmpId: 'SUP1',
      role: 'shift_in_charge',
      roleAtTime: 'Shift in Charge Engineer',
      crew: 'A',
      coverFromCrew: 'B',
      startDate: '2026-06-01',
      endDate: '2026-06-04',
      status: 'approved',
      source: 'conflict_resolution',
      toObject() {
        return { ...this };
      },
    });
    AdminUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { empId: 'SIC1', name: 'SIC Alice', crew: 'A' },
          { empId: 'SUP1', name: 'Super Bob', crew: 'B' },
        ]),
      }),
    });

    const res = await request(app)
      .post('/api/roster/delegations/resolve-conflict')
      .set('Authorization', `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL })}`)
      .send({
        absentEmpId: 'SIC1',
        coverEmpId: 'SUP1',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
      });

    expect(res.status).toBe(201);
    expect(ActingAssignment.create).toHaveBeenCalled();
  });

  test('rejects conflict delegation for General crew members', async () => {
    AdminUser.findOne
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'G1',
          name: 'General Staff',
          crew: 'General',
          role: 'Chemist',
        }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          empId: 'A2',
          name: 'Cover Staff',
          crew: 'A',
          role: 'CCR Operator',
        }),
      });

    const res = await request(app)
      .post('/api/roster/delegations/resolve-conflict')
      .set(
        'Authorization',
        `Bearer ${tokenFor({ email: SUPER_ADMIN_EMAIL, empId: 'SA-1', crew: 'A', role: 'admin', accessRole: 'admin' })}`
      )
      .send({
        absentEmpId: 'G1',
        coverEmpId: 'A2',
        crew: 'General',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/General crew/i);
  });

  test('approved conflict delegation clears schedule conflict', () => {
    const conflicts = [
      {
        date: '2026-06-01',
        crew: 'A',
        severity: 'high',
        message: 'Alice and Bob both on leave',
        employees: [
          { empId: 'E1', name: 'Alice' },
          { empId: 'E2', name: 'Bob' },
        ],
      },
    ];
    const assignments = [
      {
        _id: '1',
        absentEmpId: 'E1',
        coverEmpId: 'E3',
        crew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-04',
        status: 'approved',
        source: 'conflict_resolution',
      },
    ];
    const filtered = filterConflictsByDelegations(conflicts, assignments);
    expect(filtered).toHaveLength(0);
  });

  test('approved conflict delegation clears staffing conflict and drops conflictCount', () => {
    const { groupConflictsByCycle } = require('../services/shiftCycleConflict');

    const dailyConflicts = [
      {
        date: '2026-07-01',
        crew: 'A',
        severity: 'high',
        conflictType: 'staffing',
        message: 'Understaffed',
        employees: [
          { empId: 'E1', name: 'Alice' },
          { empId: 'E2', name: 'Bob' },
        ],
        below: [{ label: 'CCR Operator', shortfall: 1, available: 2, min: 3 }],
      },
      {
        date: '2026-07-02',
        crew: 'A',
        severity: 'high',
        conflictType: 'staffing',
        message: 'Understaffed',
        employees: [
          { empId: 'E1', name: 'Alice' },
          { empId: 'E2', name: 'Bob' },
        ],
        below: [{ label: 'CCR Operator', shortfall: 1, available: 2, min: 3 }],
      },
    ];
    const assignments = [
      {
        _id: '1',
        absentEmpId: 'E1',
        coverEmpId: 'E3',
        crew: 'A',
        coverFromCrew: 'B',
        startDate: '2026-07-01',
        endDate: '2026-07-04',
        status: 'approved',
        source: 'conflict_resolution',
      },
    ];

    const cycleDates = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'];
    const beforeDaily = filterConflictsByDelegations(dailyConflicts, []);
    const afterDaily = filterConflictsByDelegations(dailyConflicts, assignments);
    const beforeGrouped = groupConflictsByCycle(beforeDaily, cycleDates);
    const afterGrouped = groupConflictsByCycle(afterDaily, cycleDates);

    expect(beforeDaily).toHaveLength(2);
    expect(afterDaily).toHaveLength(0);
    expect(beforeGrouped.length).toBeGreaterThan(0);
    expect(afterGrouped).toHaveLength(0);
  });
});
