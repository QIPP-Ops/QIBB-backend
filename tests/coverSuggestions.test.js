const { rolesMatchForCover } = require('../utils/roleCoverMatch');
const {
  buildCoverSuggestions,
  getOffBlockInfo,
} = require('../services/coverSuggestionsService');

describe('rolesMatchForCover', () => {
  test('SIC and Supervisor are interchangeable', () => {
    expect(rolesMatchForCover('Shift in Charge Engineer', 'Supervisor')).toBe(true);
    expect(rolesMatchForCover('Supervisor', 'Shift in Charge')).toBe(true);
  });

  test('same operational role bucket matches', () => {
    expect(rolesMatchForCover('CCR Operator Group 1-2', 'CCR Operator Group 3-4')).toBe(true);
    expect(rolesMatchForCover('Local Operator Group 1-2', 'Local Operator Group 5-6')).toBe(true);
    expect(rolesMatchForCover('Chemist', 'Chemist')).toBe(true);
  });

  test('different roles do not match', () => {
    expect(rolesMatchForCover('CCR Operator', 'Local Operator')).toBe(false);
    expect(rolesMatchForCover('CCR Operator', 'Chemist')).toBe(false);
    expect(rolesMatchForCover('Supervisor', 'CCR Operator')).toBe(false);
  });
});

describe('getOffBlockInfo first-off rule', () => {
  const baseDate = '2026-01-01';

  test('first off after N/N cannot cover day but can cover night', () => {
    // Crew B: D,D,N,N,O,O,O,O — 2026-01-05 is first O after N/N
    const info = getOffBlockInfo('B', '2026-01-05', baseDate);
    expect(info.onOff).toBe(true);
    expect(info.onOffDay).toBe(1);
    expect(info.isFirstOffAfterNights).toBe(true);
    expect(info.canCoverDay).toBe(false);
    expect(info.canCoverNight).toBe(true);
  });

  test('second off day can cover day shift', () => {
    const info = getOffBlockInfo('B', '2026-01-06', baseDate);
    expect(info.onOffDay).toBe(2);
    expect(info.canCoverDay).toBe(true);
    expect(info.canCoverNight).toBe(true);
  });
});

describe('buildCoverSuggestions', () => {
  const baseDate = '2026-01-01';
  const leave = (start, end) => ({ start, end, status: 'approved', type: 'Annual Leave' });

  const employees = [
    {
      empId: 'CCR-B1',
      name: 'Bob CCR',
      crew: 'B',
      role: 'CCR Operator Group 1-2',
      color: 'crew-red',
      seniority: 'crew-red',
      leaves: [],
    },
    {
      empId: 'CCR-B2',
      name: 'Ben CCR',
      crew: 'B',
      role: 'CCR Operator Group 3-4',
      color: 'crew-yellow',
      seniority: 'crew-yellow',
      leaves: [leave('2026-01-05', '2026-01-05')],
    },
    {
      empId: 'LOC-B1',
      name: 'Local Bob',
      crew: 'B',
      role: 'Local Operator Group 1-2',
      color: 'crew-green',
      leaves: [],
    },
    {
      empId: 'CCR-C1',
      name: 'Charlie CCR',
      crew: 'C',
      role: 'CCR Operator Group 1-2',
      color: 'crew-red',
      seniority: 'crew-red',
      leaves: [],
    },
  ];

  test('excludes employees on approved leave', () => {
    const { candidates } = buildCoverSuggestions(employees, {
      date: '2026-01-05',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'N',
      baseDate,
    });
    expect(candidates.some((c) => c.empId === 'CCR-B2')).toBe(false);
  });

  test('filters by role — only CCR operators', () => {
    const { candidates } = buildCoverSuggestions(employees, {
      date: '2026-01-05',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'N',
      baseDate,
    });
    expect(candidates.every((c) => /ccr operator/i.test(c.role))).toBe(true);
    expect(candidates.some((c) => c.empId === 'LOC-B1')).toBe(false);
  });

  test('first-off rule blocks day shift for eligible CCR on crew B', () => {
    const { candidates } = buildCoverSuggestions(employees, {
      date: '2026-01-05',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'D',
      baseDate,
    });
    const bob = candidates.find((c) => c.empId === 'CCR-B1');
    expect(bob).toBeDefined();
    expect(bob.eligibleForRequestedShift).toBe(false);
    expect(bob.canCoverDay).toBe(false);
    expect(bob.reason).toMatch(/first off/i);
  });

  test('ranks crew-red before crew-yellow', () => {
    const extra = [
      ...employees,
      {
        empId: 'CCR-B3',
        name: 'Zed CCR',
        crew: 'B',
        role: 'CCR Operator Group 5-6',
        color: 'crew-yellow',
        seniority: 'crew-yellow',
        leaves: [],
      },
    ];
    const { candidates } = buildCoverSuggestions(extra, {
      date: '2026-01-06',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'D',
      baseDate,
    });
    const eligible = candidates.filter((c) => c.eligibleForRequestedShift);
    expect(eligible[0]?.empId).toBe('CCR-B1');
  });

  test('includes cross-crew same-role candidates', () => {
    const { candidates } = buildCoverSuggestions(employees, {
      date: '2026-01-06',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'D',
      baseDate,
    });
    expect(candidates.some((c) => c.empId === 'CCR-C1')).toBe(true);
  });

  test('stillUnderstaffedAfterBestCover is zero when crew is exactly at CCR minimum', () => {
    const atMinimum = [
      { empId: 'CCR-A1', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'CCR-A2', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'CCR-A3', crew: 'A', role: 'CCR Operator', leaves: [] },
      { empId: 'CCR-B1', crew: 'B', role: 'CCR Operator Group 1-2', color: 'crew-red', leaves: [] },
    ];
    const { meta } = buildCoverSuggestions(atMinimum, {
      date: '2026-01-06',
      crew: 'A',
      role: 'CCR Operator',
      shift: 'D',
      baseDate,
    });
    expect(meta.shortfallBefore).toBe(0);
    expect(meta.stillUnderstaffedAfterBestCover).toBe(0);
  });
});
