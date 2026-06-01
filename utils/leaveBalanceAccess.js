const { hasPortalAdminAccess } = require('../middleware/superAdmin');

/**
 * Whether the authenticated user may see leave balance fields for targetEmpId.
 * Admins/super admin: all; viewer: own row only; management: own row or same crew.
 */
function canViewLeaveBalance(req, targetEmpId, targetCrew) {
  if (hasPortalAdminAccess(req)) return true;
  const viewerEmpId = req.user?.empId;
  if (!viewerEmpId) return false;
  if (viewerEmpId === targetEmpId) return true;
  if (req.user?.accessRole === 'management' && targetCrew && req.user.crew === targetCrew) {
    return true;
  }
  return false;
}

/** Strip balance fields when the caller must not see them (prevents API leakage). */
function redactLeaveBalancesForClient(row, req) {
  if (!row || typeof row !== 'object') return row;
  const empId = row.empId || row._id;
  if (canViewLeaveBalance(req, empId, row.crew)) return row;
  const out = { ...row };
  delete out.annualLeaveBalance;
  delete out.bankLeaveBalance;
  delete out.compensateDayBalance;
  return out;
}

module.exports = { canViewLeaveBalance, redactLeaveBalancesForClient };
