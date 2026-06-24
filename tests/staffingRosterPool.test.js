const {
  buildRosterSchedule,
} = require('../services/shiftScheduleService');
const { filterConflictsByDelegations } = require('../services/actingCoverService');
const { buildCoverSuggestions } = require('../services/coverSuggestionsService');
const { visibleRosterEmployees } = require('../utils/rosterEmployeeLoad');

describe('staffing headcount uses full roster not only visible rows', () => {
  const leave = (start, end) => ({ start, end, type: 'Annual Leave', status: 'approved' });

  function samiLikeRoster() {
    const staffingEmployees = [
      {
        empId: '2364',
        name: 'Sami Hamdan Al Harbi',
        crew: 'A',
        role: 'CCR Operator',
        isApproved: true,
        leaves: [leave('2026-01-05', '2026-01-08')],
      },
      {
        empId: 'faisal',
        name: 'Faisal Abdullah D Alotaibi',
        crew: 'Crew A',
        role: 'CCR Operator',
        isApproved: true,
        leaves: [],
      },
      {
        empId: '2711',
        name: 'Shaheer Yousaf Latif Ur Rehman',
        crew: 'A',
        role: 'CCR Operator',
        isApproved: true,
        leaves: [],
      },
      {
        empId: 'hidden-ccr',
        name: 'Hidden Crew A CCR',
        crew: 'A',
        role: 'CCR Operator',
        isApproved: true,
        hiddenFromLeaveTimesheet: true,
        leaves: [],
      },
    ];
    return {
      staffingEmployees,
      visible: visibleRosterEmployees(staffingEmployees),
    };
  }

  test('Sami-like scenario: 4 CCR with 1 on leave yields zero conflicts (3/3)', () => {
    const { staffingEmployees, visible } = samiLikeRoster();
    expect(visible).toHaveLength(3);

    const schedule = buildRosterSchedule(visible, {
      startDate: '2026-01-05',
      endDate: '2026-01-08',
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

  test('hidden timesheet CCR still counts toward minimum when absent from visible grid', () => {
    const { staffingEmployees, visible } = samiLikeRoster();

    const scheduleVisibleOnly = buildRosterSchedule(visible, {
      startDate: '2026-01-05',
      endDate: '2026-01-05',
    });
    expect(scheduleVisibleOnly.conflicts.length).toBeGreaterThan(0);

    const scheduleFull = buildRosterSchedule(visible, {
      startDate: '2026-01-05',
      endDate: '2026-01-05',
      staffingEmployees,
    });
    expect(scheduleFull.conflicts).toEqual([]);

    const { meta: metaVisiblePool } = buildCoverSuggestions(visible, {
      date: '2026-01-05',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'D',
    });
    const { meta: metaStaffingPool } = buildCoverSuggestions(staffingEmployees, {
      date: '2026-01-05',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'D',
    });
    expect(metaVisiblePool.shortfallBefore).toBeGreaterThan(0);
    expect(metaStaffingPool.shortfallBefore).toBe(0);
    expect(metaStaffingPool.stillUnderstaffedAfterBestCover).toBe(0);
  });

  test('unapproved hidden CCR counts in staffing pool (portal approval not required)', () => {
    const staffingEmployees = [
      {
        empId: '2364',
        name: 'Sami Hamdan Al Harbi',
        crew: 'A',
        role: 'CCR Operator',
        isApproved: true,
        leaves: [leave('2026-01-05', '2026-01-08')],
      },
      { empId: 'faisal', name: 'Faisal', crew: 'A', role: 'CCR Operator', isApproved: true, leaves: [] },
      { empId: '2711', name: 'Shaheer', crew: 'A', role: 'CCR Operator', isApproved: true, leaves: [] },
      {
        empId: 'hidden-ccr',
        name: 'Hidden Crew A CCR',
        crew: 'A',
        role: 'CCR Operator',
        isApproved: false,
        hiddenFromLeaveTimesheet: true,
        leaves: [],
      },
    ];
    const visible = visibleRosterEmployees(staffingEmployees);
    const schedule = buildRosterSchedule(visible, {
      startDate: '2026-01-05',
      endDate: '2026-01-08',
      staffingEmployees,
    });
    expect(schedule.conflicts).toEqual([]);
  });
});
