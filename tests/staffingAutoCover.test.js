const {
  staffingCountsForDate,
  buildStaffingShortfallConflicts,
  hasStaffingShortfall,
} = require('../services/staffingRulesService');
const { getShiftForDate } = require('../services/shiftScheduleService');
const { filterConflictsByDelegations } = require('../services/actingCoverService');
const { isGeneralCrew } = require('../utils/rosterRowSort');

function leave(start, end, status = 'approved') {
  return { start, end, status };
}

describe('in-crew auto delegation for staffing counts', () => {
  test('SIC on leave with enough CCR in crew meets Leader minimum via auto cover', () => {
    const employees = [
      {
        empId: 'SIC1',
        crew: 'A',
        role: 'Shift in Charge Engineer',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
      { empId: 'C1', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C2', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C3', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C4', crew: 'A', role: 'CCR Operator', leaves: [] },
    ];

    const counts = staffingCountsForDate(employees, 'A', '2026-06-01', [], {
      approvedLeaveOnly: true,
    });
    const leader = counts.find((c) => c.label === 'Leader');
    const ccr = counts.find((c) => c.label === 'CCR Operator');

    expect(leader?.available).toBe(1);
    expect(leader?.autoCover).toBe(1);
    expect(leader?.shortfall).toBe(0);
    expect(ccr?.available).toBe(4);
    expect(ccr?.shortfall).toBe(0);
    expect(hasStaffingShortfall(counts)).toBe(false);
  });

  test('buildStaffingShortfallConflicts skips crew when in-crew auto cover meets minimums', () => {
    const employees = [
      {
        empId: 'SIC1',
        crew: 'A',
        role: 'Shift in Charge Engineer',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
      { empId: 'C1', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C2', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C3', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C4', crew: 'A', role: 'CCR Operator', leaves: [] },
    ];

    const conflicts = buildStaffingShortfallConflicts(employees, {
      dates: ['2026-06-01'],
      getShiftForDate,
      isGeneralCrew,
      approvedLeaveOnly: true,
    });
    const filtered = filterConflictsByDelegations(conflicts, [], employees);

    expect(conflicts).toEqual([]);
    expect(filtered).toEqual([]);
  });

  test('still flags conflict when CCR below minimum and no cross-role cover exists', () => {
    const employees = [
      { empId: 'C1', crew: 'A', role: 'CCR Operator', leaves: [leave('2026-06-01', '2026-06-01')] },
      { empId: 'C2', crew: 'A', role: 'CCR Operator', leaves: [leave('2026-06-01', '2026-06-01')] },
      { empId: 'C3', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C4', crew: 'A', role: 'CCR Operator', leaves: [] },
    ];

    const counts = staffingCountsForDate(employees, 'A', '2026-06-01', [], {
      approvedLeaveOnly: true,
    });
    const ccr = counts.find((c) => c.label === 'CCR Operator');

    expect(ccr?.available).toBe(2);
    expect(ccr?.shortfall).toBe(1);
    expect(hasStaffingShortfall(counts)).toBe(true);
  });

  test('both leaders on leave covered by one spare CCR meets Leader minimum', () => {
    const employees = [
      {
        empId: 'SIC1',
        crew: 'A',
        role: 'Shift in Charge Engineer',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
      {
        empId: 'SUP1',
        crew: 'A',
        role: 'Supervisor',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
      { empId: 'C1', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C2', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C3', crew: 'A', role: 'CCR Operator', leaves: [] },
    ];

    const counts = staffingCountsForDate(employees, 'A', '2026-06-01', [], {
      approvedLeaveOnly: true,
    });
    const leader = counts.find((c) => c.label === 'Leader');

    expect(leader?.available).toBe(1);
    expect(leader?.shortfall).toBe(0);
  });

  test('leader still short when no in-crew cover role available', () => {
    const employees = [
      {
        empId: 'SIC1',
        crew: 'A',
        role: 'Shift in Charge Engineer',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
      {
        empId: 'SUP1',
        crew: 'A',
        role: 'Supervisor',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
    ];

    const counts = staffingCountsForDate(employees, 'A', '2026-06-01', [], {
      approvedLeaveOnly: true,
    });
    const leader = counts.find((c) => c.label === 'Leader');

    expect(leader?.available).toBe(0);
    expect(leader?.shortfall).toBe(1);
  });

  test('does not double-count cover already assigned via approved delegation', () => {
    const employees = [
      {
        empId: 'SIC1',
        crew: 'A',
        role: 'Shift in Charge Engineer',
        leaves: [leave('2026-06-01', '2026-06-01')],
      },
      { empId: 'C1', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C2', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'C3', crew: 'A', role: 'CCR Operator', leaves: [] },
    ];
    const assignments = [
      {
        absentEmpId: 'SIC1',
        coverEmpId: 'C1',
        role: 'shift_in_charge',
        roleAtTime: 'Shift in Charge Engineer',
        crew: 'A',
        coverFromCrew: 'A',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        status: 'approved',
      },
    ];

    const counts = staffingCountsForDate(employees, 'A', '2026-06-01', assignments, {
      approvedLeaveOnly: true,
    });
    const leader = counts.find((c) => c.label === 'Leader');

    expect(leader?.available).toBe(1);
    expect(leader?.actingCover + leader?.autoCover).toBeLessThanOrEqual(1);
    expect(leader?.shortfall).toBe(0);
  });

  test('General crew still excluded from staffing counts', () => {
    const employees = [
      { empId: 'GEN1', crew: 'General', role: 'CCR Operator', leaves: [leave('2026-06-01', '2026-06-01')] },
      { empId: 'GEN2', crew: 'General', role: 'CCR Operator', leaves: [] },
    ];
    const counts = staffingCountsForDate(employees, 'General', '2026-06-01', []);
    expect(counts).toEqual([]);
  });
});
