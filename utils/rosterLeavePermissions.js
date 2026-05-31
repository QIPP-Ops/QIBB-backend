const { isSuperAdmin } = require('../middleware/superAdmin');

/** Whether the user may view or interact with leave / shift report rows for this employee. */
function canEditLeaveRow(user, row) {
  if (!user?.empId) return false;
  if (isSuperAdmin({ user })) return true;

  const portalRole = user.accessRole || user.role;
  if (portalRole === 'viewer') {
    return user.empId === row.empId;
  }

  if (portalRole === 'admin' || portalRole === 'management' || user.canOpsLead) {
    if (user.crew && row.crew) {
      return user.crew === row.crew;
    }
    return user.empId === row.empId;
  }

  return user.empId === row.empId;
}

function canAccessShiftReport(req, employee) {
  return canEditLeaveRow(req.user, {
    empId: employee?.empId,
    crew: employee?.crew || '',
  });
}

function canEditShiftReport(req, employee, duty) {
  if (!canAccessShiftReport(req, employee)) return false;
  if (isSuperAdmin(req)) return true;

  const isOwner = req.user?.empId === employee?.empId;
  if (isOwner) return Boolean(duty?.onDuty);

  const portalRole = req.user?.accessRole || req.user?.role;
  if (portalRole === 'admin' || portalRole === 'management' || req.user?.canOpsLead) {
    if (req.user?.crew && employee?.crew && req.user.crew === employee.crew) {
      return true;
    }
  }

  return false;
}

module.exports = {
  canEditLeaveRow,
  canAccessShiftReport,
  canEditShiftReport,
};
