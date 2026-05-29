const {
  calculatePtwScore,
  calculateTrainingScore,
  calculateIndividualKPI,
  ptwTargetLevelForRole,
  maxAuthLevel,
} = require('../services/kpiService');

describe('kpiService scoring', () => {
  const member = { empId: '100', name: 'Test User', role: 'CCR Operator' };

  test('individual KPI rounds training and PTW 50/50', () => {
    expect(calculateIndividualKPI(80, 100)).toBe(90);
    expect(calculateIndividualKPI(100, 0)).toBe(50);
    expect(calculateIndividualKPI(0, 0)).toBe(0);
  });

  test('training score is 100 when no assignments', () => {
    expect(
      calculateTrainingScore(member, [], [], new Set(), new Set())
    ).toBe(100);
  });

  test('training score counts curriculum and quiz assignments', () => {
    const curriculum = [{ title: 'Safety 101' }];
    const completed = [{ empId: '100', employeeName: 'Test User', courseTitle: 'Safety 101' }];
    const assigned = new Set(['quiz a']);
    const done = new Set(['quiz a']);
    expect(
      calculateTrainingScore(member, curriculum, completed, assigned, done)
    ).toBe(100);
  });

  test('PTW unlisted role returns 100', () => {
    expect(calculatePtwScore({ role: 'Field Operator' }, { authorizations: [] })).toBe(100);
  });

  test('PTW CCR requires PI — IA only is partial', () => {
    expect(ptwTargetLevelForRole('CCR Operator')).toBe(2);
    const person = { authorizations: ['isolationAuthority'] };
    expect(maxAuthLevel(person)).toBe(1);
    expect(calculatePtwScore({ role: 'CCR Operator' }, person)).toBe(50);
  });

  test('PTW CCR with PI is 100', () => {
    const person = { authorizations: ['permitIssuer'] };
    expect(calculatePtwScore({ role: 'CCR Operator' }, person)).toBe(100);
  });

  test('PTW Local Operator with no auth is 0', () => {
    expect(calculatePtwScore({ role: 'Local Operator' }, { authorizations: [] })).toBe(0);
  });

  test('PTW higher auth satisfies lower target', () => {
    const person = { authorizations: ['safetyControllerA'] };
    expect(calculatePtwScore({ role: 'Local Operator' }, person)).toBe(100);
  });
});
