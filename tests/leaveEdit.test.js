const { canEditLeaveRow, canEditLeaveForEmployee } = require('../utils/rosterLeavePermissions');

describe('rosterLeavePermissions — leave edit access', () => {
  test('super admin can edit any crew row', () => {
    expect(
      canEditLeaveRow(
        { email: 'admin@acwaops.com', empId: 'SA-1', crew: 'A' },
        { empId: '200001', crew: 'B' }
      )
    ).toBe(true);
  });

  test('portal admin can edit same crew', () => {
    expect(
      canEditLeaveRow(
        { empId: '100001', accessRole: 'admin', crew: 'A' },
        { empId: '200001', crew: 'A' }
      )
    ).toBe(true);
    expect(
      canEditLeaveRow(
        { empId: '100001', accessRole: 'admin', crew: 'A' },
        { empId: '200001', crew: 'B' }
      )
    ).toBe(false);
  });

  test('SIC can edit same crew leave rows', () => {
    expect(
      canEditLeaveRow(
        { empId: '100001', role: 'Shift in Charge Engineer', crew: 'A' },
        { empId: '200001', crew: 'A' }
      )
    ).toBe(true);
    expect(
      canEditLeaveRow(
        { empId: '100001', role: 'Shift in Charge Engineer', crew: 'A' },
        { empId: '200001', crew: 'B' }
      )
    ).toBe(false);
  });

  test('supervisor can edit same crew leave rows', () => {
    expect(
      canEditLeaveRow(
        { empId: '100001', role: 'Supervisor', crew: 'C' },
        { empId: '200001', crew: 'C' }
      )
    ).toBe(true);
  });

  test('viewer can only edit own row', () => {
    expect(
      canEditLeaveRow(
        { empId: '100001', accessRole: 'viewer', crew: 'A' },
        { empId: '100001', crew: 'A' }
      )
    ).toBe(true);
    expect(
      canEditLeaveRow(
        { empId: '100001', accessRole: 'viewer', crew: 'A' },
        { empId: '200001', crew: 'A' }
      )
    ).toBe(false);
  });

  test('canEditLeaveForEmployee wraps row check', () => {
    const req = {
      user: { empId: '100001', accessRole: 'admin', crew: 'A' },
    };
    expect(canEditLeaveForEmployee(req, { empId: '200001', crew: 'A' })).toBe(true);
    expect(canEditLeaveForEmployee(req, { empId: '200001', crew: 'B' })).toBe(false);
  });
});
