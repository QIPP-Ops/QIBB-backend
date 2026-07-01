const {
  calculateGoalScore,
  calculateUnifiedScore,
  calculateIndividualKPI,
} = require('../services/kpiService');

describe('unified KPI score', () => {
  test('calculateUnifiedScore blends compliance and goals 50/50 when goals available', () => {
    expect(calculateUnifiedScore(80, 60)).toBe(70);
    expect(calculateUnifiedScore(100, 0)).toBe(50);
  });

  test('calculateUnifiedScore returns compliance only when no goals', () => {
    expect(calculateUnifiedScore(85, null)).toBe(85);
    expect(calculateUnifiedScore(85, undefined)).toBe(85);
  });

  test('calculateGoalScore averages KPI goal progress', () => {
    const score = calculateGoalScore({
      kpis: [
        { title: 'Safety', progress: 80, weight: 50 },
        { title: 'Quality', progress: 40, weight: 50 },
      ],
    });
    expect(score).toBe(60);
  });

  test('calculateGoalScore returns null when no goals', () => {
    expect(calculateGoalScore({ kpis: [] })).toBeNull();
    expect(calculateGoalScore({ kpis: [{ title: '', progress: 50 }] })).toBeNull();
  });

  test('compliance KPI formula blends training, PTW, and attendance 40/40/20', () => {
    expect(calculateIndividualKPI(80, 60, 100)).toBe(76);
  });
});
