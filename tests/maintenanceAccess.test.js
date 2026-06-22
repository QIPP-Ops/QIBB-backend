const {
  canAccessMaintenancePortal,
  isBanderAldogaishUser,
} = require('../utils/maintenanceAccess');

describe('maintenanceAccess', () => {
  test('super admin has maintenance portal access', () => {
    expect(
      canAccessMaintenancePortal({ email: 'admin@acwaops.com', role: 'viewer' })
    ).toBe(true);
  });

  test('Bander Aldogaish has maintenance portal access by name', () => {
    expect(
      canAccessMaintenancePortal({ name: 'Bander Khalid AlDogaish', role: 'Plant Manager' })
    ).toBe(true);
    expect(
      canAccessMaintenancePortal({ name: 'Bandar Aldogaish', role: 'Plant Manager' })
    ).toBe(true);
  });

  test('Bander Aldogaish has maintenance portal access by email', () => {
    expect(
      canAccessMaintenancePortal({ email: 'b.aldogaish@nomac.com', name: 'Bander Khalid AlDogaish' })
    ).toBe(true);
  });

  test('regular admin is denied', () => {
    expect(
      canAccessMaintenancePortal({ accessRole: 'admin', role: 'admin', email: 'ops@acwaops.com' })
    ).toBe(false);
  });

  test('maintenance department staff is denied', () => {
    expect(
      canAccessMaintenancePortal({ maintenanceDepartment: 'MMD', role: 'Technician' })
    ).toBe(false);
  });

  test('PTW maintenance designation is denied', () => {
    expect(
      canAccessMaintenancePortal(
        { role: 'Viewer', accessRole: 'viewer' },
        { designation: 'EMD Supervisor' }
      )
    ).toBe(false);
  });

  test('operations crew is denied', () => {
    expect(
      canAccessMaintenancePortal(
        { role: 'CCR Operator', accessRole: 'viewer', crew: 'A' },
        { designation: 'CCR Operator', authorizations: ['permitReceiverStandard'] }
      )
    ).toBe(false);
  });

  test('isBanderAldogaishUser rejects unrelated plant managers', () => {
    expect(isBanderAldogaishUser({ role: 'Plant Manager', name: 'Other Manager' })).toBe(false);
  });
});
