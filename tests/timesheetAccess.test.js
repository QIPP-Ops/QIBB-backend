const {
  canViewTimesheetRow,
  canApproveLeaveForEmployee,
} = require('../utils/rosterLeavePermissions');
const {
  filterRosterRowsForViewer,
  filterScheduleForViewer,
} = require('../utils/timesheetAccess');

describe('timesheetAccess — row visibility', () => {
  test('regular viewer sees only own row', () => {
    const viewer = { empId: '100001', accessRole: 'viewer', crew: 'A' };
    expect(canViewTimesheetRow(viewer, { empId: '100001', crew: 'A' })).toBe(true);
    expect(canViewTimesheetRow(viewer, { empId: '200001', crew: 'A' })).toBe(false);
    expect(canViewTimesheetRow(viewer, { empId: '200001', crew: 'B' })).toBe(false);
  });

  test('crew admin sees same crew only', () => {
    const admin = { empId: '100001', accessRole: 'admin', crew: 'A' };
    expect(canViewTimesheetRow(admin, { empId: '200001', crew: 'A' })).toBe(true);
    expect(canViewTimesheetRow(admin, { empId: '200001', crew: 'B' })).toBe(false);
  });

  test('super admin sees all rows', () => {
    const superAdmin = { email: 'admin@acwaops.com', empId: 'SA-1', crew: 'A' };
    expect(canViewTimesheetRow(superAdmin, { empId: '200001', crew: 'B' })).toBe(true);
  });

  test('SIC sees same crew only', () => {
    const sic = { empId: '100001', role: 'Shift in Charge Engineer', crew: 'C' };
    expect(canViewTimesheetRow(sic, { empId: '200001', crew: 'C' })).toBe(true);
    expect(canViewTimesheetRow(sic, { empId: '200001', crew: 'A' })).toBe(false);
  });

  test('GDP Engineer with viewer portal role sees same crew only', () => {
    const gdp = { empId: 'a-gdp', accessRole: 'viewer', jobRole: 'GDP Engineer', crew: 'A' };
    expect(canViewTimesheetRow(gdp, { empId: 'a-ccr1', crew: 'A' })).toBe(true);
    expect(canViewTimesheetRow(gdp, { empId: 'b-ccr1', crew: 'B' })).toBe(false);
    expect(canViewTimesheetRow(gdp, { empId: 'a-gdp', crew: 'A' })).toBe(true);
  });
});

describe('timesheetAccess — schedule filtering', () => {
  const schedule = {
    dates: ['2026-06-01'],
    rows: [
      { empId: 'E1', crew: 'A', name: 'Alice', cells: [{ date: '2026-06-01', onLeave: true }] },
      { empId: 'E2', crew: 'B', name: 'Bob', cells: [{ date: '2026-06-01', onLeave: false }] },
    ],
    conflicts: [
      {
        date: '2026-06-01',
        crew: 'A',
        employees: [{ empId: 'E1', crew: 'A' }, { empId: 'E2', crew: 'B' }],
      },
    ],
    conflictCount: 1,
  };

  test('viewer gets only own schedule row', () => {
    const req = { user: { empId: 'E1', accessRole: 'viewer', crew: 'A' } };
    const filtered = filterScheduleForViewer(schedule, req);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].empId).toBe('E1');
    expect(filtered.conflicts).toHaveLength(1);
    expect(filtered.conflicts[0].employees).toHaveLength(1);
    expect(filtered.conflicts[0].employees[0].empId).toBe('E1');
  });

  test('crew admin gets full crew A schedule', () => {
    const scheduleA = {
      ...schedule,
      rows: [
        ...schedule.rows,
        { empId: 'E3', crew: 'A', name: 'Carol', cells: [] },
      ],
    };
    const req = { user: { empId: 'E9', accessRole: 'admin', crew: 'A' } };
    const filtered = filterScheduleForViewer(scheduleA, req);
    expect(filtered.rows.map((r) => r.empId).sort()).toEqual(['E1', 'E3']);
  });

  test('super admin gets all rows', () => {
    const req = { user: { email: 'admin@acwaops.com', empId: 'SA', crew: 'A' } };
    const filtered = filterScheduleForViewer(schedule, req);
    expect(filtered.rows).toHaveLength(2);
  });
});

describe('timesheetAccess — roster list filtering', () => {
  test('filters roster employees for viewer', () => {
    const rows = [
      { empId: 'E1', crew: 'A', annualLeaveBalance: 5 },
      { empId: 'E2', crew: 'B', annualLeaveBalance: 3 },
    ];
    const req = { user: { empId: 'E1', accessRole: 'viewer', crew: 'A' } };
    const filtered = filterRosterRowsForViewer(rows, req);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].empId).toBe('E1');
    expect(filtered[0].annualLeaveBalance).toBe(5);
  });
});

describe('timesheetAccess — approve leave scope', () => {
  test('crew admin cannot approve other crew leave', () => {
    const req = { user: { empId: 'A1', accessRole: 'admin', crew: 'A' } };
    expect(canApproveLeaveForEmployee(req, { empId: 'E2', crew: 'A' })).toBe(true);
    expect(canApproveLeaveForEmployee(req, { empId: 'E2', crew: 'B' })).toBe(false);
  });

  test('viewer cannot approve any leave', () => {
    const req = { user: { empId: 'E1', accessRole: 'viewer', crew: 'A' } };
    expect(canApproveLeaveForEmployee(req, { empId: 'E1', crew: 'A' })).toBe(false);
  });
});
