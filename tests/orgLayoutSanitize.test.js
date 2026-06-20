const {
  repairCrewOpsLayoutNodes,
  resolveCrewOpsLayoutNodes,
} = require('../utils/orgLayoutSanitize');

function memberMap(rows) {
  const map = new Map();
  rows.forEach((row) => map.set(row.empId, row));
  return map;
}

describe('orgLayoutSanitize', () => {
  const roster = [
    { empId: 'b-sic', role: 'Shift in Charge Engineer', name: 'Abdullah' },
    { empId: 'b-gdp', role: 'GDP Engineer', name: 'Albara' },
    { empId: 'b-ccr1', role: 'CCR Operator Group 1-2', name: 'Adam' },
    { empId: 'b-ccr2', role: 'CCR Operator Group 3-4', name: 'Ahmed' },
  ];

  test('re-parents CCRs from GDP engineer to SIC', () => {
    const memberById = memberMap(roster);
    const badNodes = [
      { empId: 'b-sic', parentEmpId: '' },
      { empId: 'b-gdp', parentEmpId: 'b-sic' },
      { empId: 'b-ccr1', parentEmpId: 'b-gdp' },
      { empId: 'b-ccr2', parentEmpId: 'b-gdp' },
    ];
    const repaired = repairCrewOpsLayoutNodes(memberById, badNodes);
    expect(repaired.find((n) => n.empId === 'b-ccr1').parentEmpId).toBe('b-sic');
    expect(repaired.find((n) => n.empId === 'b-ccr2').parentEmpId).toBe('b-sic');
  });

  test('resolve re-parents CCR-to-CCR chains to operations lead', () => {
    const memberById = memberMap([
      { empId: '100', role: 'Supervisor Engineer', name: 'Sup' },
      { empId: '201', role: 'CCR Operator Group 1-2', name: 'CCR 1' },
      { empId: '202', role: 'CCR Operator Group 3-4', name: 'CCR 2' },
    ]);
    const chained = [
      { empId: '100', parentEmpId: '' },
      { empId: '201', parentEmpId: '100' },
      { empId: '202', parentEmpId: '201' },
    ];
    const out = resolveCrewOpsLayoutNodes(memberById, chained);
    expect(out.find((n) => n.empId === '202').parentEmpId).toBe('100');
  });
});
