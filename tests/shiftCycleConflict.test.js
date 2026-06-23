const {
  assignShiftCycleKeys,
  groupConflictsByCycle,
  getShiftForDate,
} = require('../services/shiftCycleConflict');

const BASE = '2026-01-01';

function cell(date, shift) {
  return { date, shift };
}

function makeConflict(date, crew, empA, empB) {
  return {
    date,
    crew,
    severity: 'high',
    message: `${empA.name} and ${empB.name} both on leave while crew ${crew} is scheduled to work`,
    employees: [empA, empB],
  };
}

describe('assignShiftCycleKeys', () => {
  test('assigns the same cycle key to all four days of a D-D-N-N block (crew B)', () => {
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
    const cells = dates.map((date) => cell(date, getShiftForDate('B', date, BASE)));
    const keys = assignShiftCycleKeys(cells);
    expect(keys.get('2026-01-01')).toBe('2026-01-01');
    expect(keys.get('2026-01-02')).toBe('2026-01-01');
    expect(keys.get('2026-01-03')).toBe('2026-01-01');
    expect(keys.get('2026-01-04')).toBe('2026-01-01');
  });

  test('starts a new cycle key after off days', () => {
    const dates = [
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
    ];
    const cells = dates.map((date) => cell(date, getShiftForDate('B', date, BASE)));
    const keys = assignShiftCycleKeys(cells);
    expect(keys.get('2026-01-01')).toBe('2026-01-01');
    expect(keys.get('2026-01-09')).toBe('2026-01-09');
    expect(keys.get('2026-01-12')).toBe('2026-01-09');
  });
});

describe('groupConflictsByCycle', () => {
  const empA = { empId: 'E1', name: 'Alice', crew: 'B' };
  const empB = { empId: 'E2', name: 'Bob', crew: 'B' };
  const dates = [
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
    '2026-01-04',
    '2026-01-09',
    '2026-01-10',
    '2026-01-11',
    '2026-01-12',
  ];

  test('four conflict days in one cycle count as one grouped conflict', () => {
    const daily = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].map((date) =>
      makeConflict(date, 'B', empA, empB)
    );
    const grouped = groupConflictsByCycle(daily, dates);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].dates).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(grouped[0].cycleLabel).toBe('2026-01-01 – 2026-01-04');
    expect(grouped[0].cycleStart).toBe('2026-01-01');
  });

  test('conflicts in two cycles count as two grouped conflicts', () => {
    const daily = [
      makeConflict('2026-01-01', 'B', empA, empB),
      makeConflict('2026-01-02', 'B', empA, empB),
      makeConflict('2026-01-09', 'B', empA, empB),
      makeConflict('2026-01-10', 'B', empA, empB),
    ];
    const grouped = groupConflictsByCycle(daily, dates);
    expect(grouped).toHaveLength(2);
    expect(grouped.map((g) => g.cycleStart).sort()).toEqual(['2026-01-01', '2026-01-09']);
  });
});
