const {
  buildRosterSchedule,
} = require('../services/shiftScheduleService');
const {
  enrichScheduleRows,
  filterConflictsByDelegations,
} = require('../services/actingCoverService');
const { visibleRosterEmployees } = require('../utils/rosterEmployeeLoad');
const { willBreachStaffingRules } = require('../services/leaveConflictService');

jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../models/ActingAssignment', () => ({
  find: jest.fn(),
}));

jest.mock('../models/AdminConfig', () => ({
  findOne: jest.fn(() => ({
    lean: () => Promise.resolve({ shiftCycleBaseDate: '2026-01-01' }),
  })),
}));

function leave(start, end, status = 'approved') {
  return { start, end, type: 'Annual Leave', status };
}

/** Production-like Crew A CCR roster: Sami on leave, 3 others meet minimum. */
function samiProductionRoster() {
  return [
    {
      empId: '2364',
      name: 'Sami Hamdan Al Harbi',
      crew: 'A',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      leaves: [leave('2024-07-24', '2024-07-27')],
    },
    {
      empId: 'faisal',
      name: 'Faisal Abdullah D Alotaibi',
      crew: 'Crew A',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      leaves: [],
    },
    {
      empId: '2711',
      name: 'Shaheer Yousaf Latif Ur Rehman',
      crew: 'A',
      role: 'CCR Operator',
      isApproved: true,
      isActive: true,
      leaves: [],
    },
    {
      empId: '3672',
      name: 'Somanathan Nair Prathapan',
      crew: 'A',
      role: 'CCR Operator',
      isApproved: false,
      isActive: true,
      hiddenFromLeaveTimesheet: true,
      leaves: [],
    },
  ];
}

function mockStaffingFind(employees) {
  const AdminUser = require('../models/AdminUser');
  AdminUser.find.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(employees),
    }),
  });
}

describe('Sami Hamdan staffing scenario (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('schedule API path: 4 Crew A CCR with Sami on leave yields zero conflicts (3/3)', () => {
    const staffingEmployees = samiProductionRoster();
    const visible = visibleRosterEmployees(staffingEmployees);
    expect(visible).toHaveLength(3);

    const schedule = buildRosterSchedule(visible, {
      startDate: '2024-07-24',
      endDate: '2024-07-27',
      staffingEmployees,
    });

    const filtered = filterConflictsByDelegations(
      schedule.conflicts,
      [],
      staffingEmployees
    );

    expect(schedule.conflicts).toEqual([]);
    expect(filtered).toEqual([]);
  });

  test('willBreachStaffingRules: not breached when unapproved hidden CCR still counts', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');
    const roster = samiProductionRoster();

    AdminUser.findOne.mockReturnValue({
      lean: () => Promise.resolve(roster[0]),
    });
    mockStaffingFind(roster);
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('2364', '2024-07-24', '2024-07-27');
    expect(result.breached).toBe(false);
    expect(result.alerts).toEqual([]);
  });

  test('cover metadata appears on covered (absent) employee cells per day', () => {
    const staffingEmployees = samiProductionRoster();
    const visible = visibleRosterEmployees(staffingEmployees);
    const schedule = buildRosterSchedule(visible, {
      startDate: '2024-07-24',
      endDate: '2024-07-27',
      staffingEmployees,
    });

    const employeeById = new Map(staffingEmployees.map((e) => [e.empId, e]));
    const assignments = [
      {
        _id: 'cover1',
        absentEmpId: '2364',
        coverEmpId: 'faisal',
        role: 'ccr_operator',
        roleAtTime: 'CCR Operator',
        crew: 'A',
        coverFromCrew: 'Crew A',
        startDate: '2024-07-24',
        endDate: '2024-07-25',
        status: 'approved',
      },
    ];

    const enriched = enrichScheduleRows(schedule.rows, assignments, employeeById);
    const samiRow = enriched.find((r) => r.empId === '2364');
    expect(samiRow).toBeDefined();

    const jul24 = samiRow.cells.find((c) => c.date === '2024-07-24');
    const jul26 = samiRow.cells.find((c) => c.date === '2024-07-26');
    expect(jul24.coveredBy).toBe('Faisal Abdullah D Alotaibi');
    expect(jul24.coveredByEmpId).toBe('faisal');
    expect(jul26.coveredBy).toBeUndefined();
  });
});
