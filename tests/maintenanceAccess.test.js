const {
  canAccessMaintenancePortal,
  isMaintenanceJobRole,
} = require('../utils/maintenanceAccess');
const { resolveMaintenanceDepartment } = require('../utils/maintenanceDepartment');

describe('maintenanceAccess', () => {
  test('admins always have maintenance portal access', () => {
    expect(canAccessMaintenancePortal({ accessRole: 'admin', role: 'admin' }, null)).toBe(true);
  });

  test('maintenance department grants access', () => {
    expect(
      canAccessMaintenancePortal({ maintenanceDepartment: 'MMD', role: 'Technician' }, null)
    ).toBe(true);
  });

  test('PTW maintenance designation grants access', () => {
    expect(
      canAccessMaintenancePortal(
        { role: 'Viewer', accessRole: 'viewer' },
        { designation: 'EMD Supervisor' }
      )
    ).toBe(true);
  });

  test('operations crew without maintenance scope is denied', () => {
    expect(
      canAccessMaintenancePortal(
        { role: 'CCR Operator', accessRole: 'viewer', crew: 'A' },
        { designation: 'CCR Operator', authorizations: ['permitReceiverStandard'] }
      )
    ).toBe(false);
  });

  test('maintenance job role grants access', () => {
    expect(isMaintenanceJobRole('Maintenance Planner')).toBe(true);
    expect(resolveMaintenanceDepartment({ role: 'CCR Operator' }, null)).toBeNull();
  });
});
