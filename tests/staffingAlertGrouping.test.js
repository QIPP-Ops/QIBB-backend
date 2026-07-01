const {
  collapseIsoDatesToRanges,
  groupStaffingAlertsByDateRange,
} = require('../utils/staffingAlertGrouping');

describe('staffingAlertGrouping', () => {
  test('collapseIsoDatesToRanges merges consecutive dates', () => {
    expect(collapseIsoDatesToRanges(['2026-08-01', '2026-08-02', '2026-08-10'])).toEqual([
      { from: '2026-08-01', to: '2026-08-02' },
      { from: '2026-08-10', to: '2026-08-10' },
    ]);
  });

  test('groupStaffingAlertsByDateRange groups same crew/shortfall into periods', () => {
    const alerts = [
      { crew: 'A', date: '2026-08-01', below: [{ label: 'CCR Operator', shortfall: 1 }] },
      { crew: 'A', date: '2026-08-02', below: [{ label: 'CCR Operator', shortfall: 1 }] },
      { crew: 'A', date: '2026-08-10', below: [{ label: 'CCR Operator', shortfall: 1 }] },
    ];
    expect(groupStaffingAlertsByDateRange(alerts)).toEqual([
      {
        crew: 'A',
        date: '2026-08-01',
        dateEnd: '2026-08-02',
        dateLabel: '2026-08-01 – 2026-08-02',
        below: [{ label: 'CCR Operator', shortfall: 1 }],
      },
      {
        crew: 'A',
        date: '2026-08-10',
        dateEnd: '2026-08-10',
        dateLabel: '2026-08-10',
        below: [{ label: 'CCR Operator', shortfall: 1 }],
      },
    ]);
  });
});
