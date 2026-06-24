jest.mock('../models/AdminUser', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../models/ActingAssignment', () => ({
  find: jest.fn(),
}));

const {
  STAFFING_RULES,
  willBreachStaffingRules,
} = require('../services/leaveConflictService');

describe('willBreachStaffingRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns breached when CCR minimum would not be met after approval', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    const crewEmployees = [
      {
        empId: 'E1',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [{ start: new Date('2026-06-05'), end: new Date('2026-06-05'), status: 'approved' }],
      },
      {
        empId: 'E2',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [{ start: new Date('2026-06-05'), end: new Date('2026-06-05'), status: 'approved' }],
      },
      {
        empId: 'E3',
        crew: 'A',
        role: 'CCR Operator',
        leaves: [],
      },
      {
        empId: 'E4',
        crew: 'A',
        role: 'Local Operator',
        leaves: [],
      },
    ];

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'E3',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [{ _id: 'leave1', start: new Date('2026-06-05'), end: new Date('2026-06-05'), status: 'pending' }],
        }),
    });
    AdminUser.find.mockReturnValue({ lean: () => Promise.resolve(crewEmployees) });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('E3', '2026-06-05', '2026-06-05', 'leave1');
    expect(result.breached).toBe(true);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.alerts[0].below.some((b) => b.label === 'CCR Operator')).toBe(true);
  });

  test('returns not breached when CCR exactly at minimum after approval', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'E3',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [{ _id: 'leave1', start: new Date('2026-06-10'), end: new Date('2026-06-10'), status: 'pending' }],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { empId: 'E1', crew: 'A', role: 'CCR Operator', leaves: [] },
          { empId: 'E2', crew: 'A', role: 'CCR Operator', leaves: [] },
          { empId: 'E3', crew: 'A', role: 'CCR Operator', leaves: [] },
          { empId: 'E4', crew: 'A', role: 'CCR Operator', leaves: [] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('E3', '2026-06-10', '2026-06-10', 'leave1');
    expect(result.breached).toBe(false);
  });

  test('returns not breached when local operators exactly at minimum', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'L5',
          crew: 'A',
          role: 'Local Operator',
          leaves: [],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { empId: 'L1', crew: 'A', role: 'Local Operator', leaves: [] },
          { empId: 'L2', crew: 'A', role: 'Local Operator', leaves: [] },
          { empId: 'L3', crew: 'A', role: 'Local Operator', leaves: [] },
          { empId: 'L4', crew: 'A', role: 'Local Operator', leaves: [] },
          { empId: 'L5', crew: 'A', role: 'Local Operator', leaves: [] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('L5', '2026-06-12', '2026-06-12');
    expect(result.breached).toBe(false);
  });

  test('returns breached when leader bucket would be empty', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'SIC1',
          crew: 'A',
          role: 'Shift in Charge',
          leaves: [],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { empId: 'SIC1', crew: 'A', role: 'Shift in Charge', leaves: [] },
          { empId: 'SUP1', crew: 'A', role: 'Supervisor', leaves: [{ start: new Date('2026-06-15'), end: new Date('2026-06-15'), status: 'approved' }] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('SIC1', '2026-06-15', '2026-06-15');
    expect(result.breached).toBe(true);
    expect(result.alerts[0].below.some((b) => b.label === 'Leader')).toBe(true);
  });

  test('returns not breached when one leader remains (SIC covers Supervisor absence)', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'SUP1',
          crew: 'A',
          role: 'Supervisor',
          leaves: [],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { empId: 'SIC1', crew: 'A', role: 'Shift in Charge', leaves: [] },
          { empId: 'SUP1', crew: 'A', role: 'Supervisor', leaves: [] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('SUP1', '2026-06-16', '2026-06-16');
    expect(result.breached).toBe(false);
  });

  test('STAFFING_RULES uses combined leader minimum', () => {
    const leader = STAFFING_RULES.find((r) => r.label === 'Leader');
    expect(leader?.min).toBe(1);
  });

  test('returns not breached when 4 CCR with mixed crew labels and 1 on leave (3/3)', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'CCR0',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          {
            empId: 'CCR0',
            crew: 'A',
            role: 'CCR Operator',
            leaves: [],
          },
          { empId: 'CCR1', crew: 'Crew A', role: 'CCR Operator', leaves: [] },
          { empId: 'CCR2', crew: 'crew a', role: 'CCR Operator', leaves: [] },
          { empId: 'CCR3', crew: 'A', role: 'CCR Operator', leaves: [] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('CCR0', '2026-01-05', '2026-01-05');
    expect(result.breached).toBe(false);
  });

  test('returns breached when 3 CCR with 1 on leave leaves 2 on duty (2/3)', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'CCR0',
          crew: 'A',
          role: 'CCR Operator',
          leaves: [],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { empId: 'CCR0', crew: 'A', role: 'CCR Operator', leaves: [] },
          { empId: 'CCR1', crew: 'Crew A', role: 'CCR Operator', leaves: [] },
          { empId: 'CCR2', crew: 'A', role: 'CCR Operator', leaves: [] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('CCR0', '2026-01-05', '2026-01-05');
    expect(result.breached).toBe(true);
    expect(result.alerts[0].below.some((b) => b.label === 'CCR Operator')).toBe(true);
  });

  test('returns not breached when 5 locals with 1 on leave (4/4)', async () => {
    const AdminUser = require('../models/AdminUser');
    const ActingAssignment = require('../models/ActingAssignment');

    AdminUser.findOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          empId: 'LOC0',
          crew: 'B',
          role: 'Local Operator',
          leaves: [],
        }),
    });
    AdminUser.find.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { empId: 'LOC0', crew: 'B', role: 'Local Operator', leaves: [] },
          { empId: 'LOC1', crew: 'Crew B', role: 'Local Operator', leaves: [] },
          { empId: 'LOC2', crew: 'B', role: 'Local Operator', leaves: [] },
          { empId: 'LOC3', crew: 'crew b', role: 'Local Operator', leaves: [] },
          { empId: 'LOC4', crew: 'B', role: 'Local Operator', leaves: [] },
        ]),
    });
    ActingAssignment.find.mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await willBreachStaffingRules('LOC0', '2026-01-03', '2026-01-03');
    expect(result.breached).toBe(false);
  });
});
