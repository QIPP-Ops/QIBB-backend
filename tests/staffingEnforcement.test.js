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

  test('returns not breached when staffing is sufficient', async () => {
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

  test('STAFFING_RULES includes minimum CCR count', () => {
    const ccr = STAFFING_RULES.find((r) => r.label === 'CCR Operator');
    expect(ccr?.min).toBe(3);
  });
});
