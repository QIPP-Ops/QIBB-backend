const {
  applyLeaveDerivedAttendance,
  resolveDerivedFromLeave,
} = require('../services/attendanceLeaveSyncService');

process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

const employeeOnLeave = {
  empId: 'EMP-100',
  crew: 'A',
  leaves: [{ start: '2026-06-20', end: '2026-06-25', status: 'approved', type: 'Annual' }],
};

const superAdminReq = { user: { email: 'admin@acwaops.com' } };
const crewAdminReq = { user: { email: 'sic@acwapower.com', accessRole: 'admin', crew: 'A' } };

describe('attendanceLeaveSyncService', () => {
  test('crew admin cannot override leave-derived absent to present', () => {
    const existing = { derivedFromLeave: true, status: 'absent' };
    expect(() =>
      applyLeaveDerivedAttendance(
        employeeOnLeave,
        '2026-06-23',
        { status: 'present', remarks: '' },
        existing,
        crewAdminReq,
        (req) => req.user?.email === 'admin@acwaops.com'
      )
    ).toThrow(/cannot be overridden/);
  });

  test('crew admin saving on leave day forces absent', () => {
    const body = applyLeaveDerivedAttendance(
      employeeOnLeave,
      '2026-06-23',
      { status: 'present', remarks: '' },
      null,
      crewAdminReq,
      (req) => req.user?.email === 'admin@acwaops.com'
    );
    expect(body.status).toBe('absent');
    expect(body.derivedFromLeave).toBeUndefined();
  });

  test('super admin can set present on approved leave day', () => {
    const existing = { derivedFromLeave: true, status: 'absent' };
    const body = applyLeaveDerivedAttendance(
      employeeOnLeave,
      '2026-06-23',
      { status: 'present', remarks: 'Worked partial day' },
      existing,
      superAdminReq,
      (req) => req.user?.email === 'admin@acwaops.com'
    );
    expect(body.status).toBe('present');
    expect(body.remarks).toBe('Worked partial day');
  });

  test('resolveDerivedFromLeave is false for super-admin present override', () => {
    const isSuperAdmin = (req) => req.user?.email === 'admin@acwaops.com';
    expect(
      resolveDerivedFromLeave(
        employeeOnLeave,
        '2026-06-23',
        { status: 'present' },
        superAdminReq,
        isSuperAdmin
      )
    ).toBe(false);
    expect(
      resolveDerivedFromLeave(
        employeeOnLeave,
        '2026-06-23',
        { status: 'absent' },
        crewAdminReq,
        isSuperAdmin
      )
    ).toBe(true);
    expect(
      resolveDerivedFromLeave(
        employeeOnLeave,
        '2026-06-23',
        { status: 'absent' },
        superAdminReq,
        isSuperAdmin
      )
    ).toBe(false);
  });
});
