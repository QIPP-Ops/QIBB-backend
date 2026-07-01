const {
  canLogAttendance,
  canViewAttendanceList,
  canEditAttendanceForEmployee,
  canDeleteAttendance,
} = require('../utils/attendancePermissions');

process.env.SUPER_ADMIN_EMAIL = 'admin@acwaops.com';

function req(user) {
  return { user };
}

describe('attendancePermissions', () => {
  test('super admin can log, view any crew, and edit any employee', () => {
    const superReq = req({ email: 'admin@acwaops.com', accessRole: 'viewer', crew: 'S' });
    expect(canLogAttendance(superReq)).toBe(true);
    expect(canViewAttendanceList(superReq, { crew: 'B' })).toBe(true);
    expect(canViewAttendanceList(superReq, {})).toBe(true);
    expect(canEditAttendanceForEmployee(superReq, { crew: 'B', empId: 'EMP-200' })).toBe(true);
    expect(canDeleteAttendance(superReq)).toBe(true);
  });

  test('crew admin is scoped to own crew', () => {
    const adminReq = req({ email: 'sic@acwapower.com', accessRole: 'admin', crew: 'A' });
    expect(canLogAttendance(adminReq)).toBe(true);
    expect(canViewAttendanceList(adminReq, { crew: 'A' })).toBe(true);
    expect(canViewAttendanceList(adminReq, { crew: 'B' })).toBe(false);
    expect(canEditAttendanceForEmployee(adminReq, { crew: 'A', empId: 'EMP-100' })).toBe(true);
    expect(canEditAttendanceForEmployee(adminReq, { crew: 'B', empId: 'EMP-200' })).toBe(false);
    expect(canDeleteAttendance(adminReq)).toBe(false);
  });

  test('viewer cannot log or edit attendance', () => {
    const viewerReq = req({
      email: 'operator@acwapower.com',
      accessRole: 'viewer',
      crew: 'A',
      empId: 'EMP-100',
    });
    expect(canLogAttendance(viewerReq)).toBe(false);
    expect(canViewAttendanceList(viewerReq, { crew: 'A' })).toBe(false);
    expect(canEditAttendanceForEmployee(viewerReq, { crew: 'A', empId: 'EMP-100' })).toBe(false);
  });
});
