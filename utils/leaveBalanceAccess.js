const { isSuperAdmin } = require('../middleware/superAdmin');
const { normCrew } = require('./rosterRowSort');

/** Same crew when both sides have a crew label (supports Crew A vs A). */
function sameCrewForAccess(actorCrew, targetCrew) {
  const a = String(actorCrew ?? '').trim();
  const b = String(targetCrew ?? '').trim();
  if (!a || !b) return false;
  return normCrew(a) === normCrew(b);
}

function resolveActorCrew(req, actor) {
  return actor?.crew ?? req?.user?.crew;
}

/**
 * Whether the authenticated user may edit compensate-day balance for a crew member.
 * Super admin: all; admin/management/ops lead: same crew (or own row when crew unset).
 */
function canEditCompensateBalance(req, targetUser, actor) {
  if (!req?.user || !targetUser) return false;
  if (isSuperAdmin(req)) return true;

  const portalRole = req.user.accessRole || req.user.role;
  if (portalRole === 'admin' || portalRole === 'management' || req.user.canOpsLead) {
    if (sameCrewForAccess(resolveActorCrew(req, actor), targetUser.crew)) {
      return true;
    }
    return req.user.empId === targetUser.empId;
  }
  return false;
}

/**
 * Whether the authenticated user may see leave balance fields for targetEmpId.
 * Super admin: all; crew admin/management/ops lead: same crew; viewer: own row only.
 */
function canViewLeaveBalance(req, targetEmpId, targetCrew) {
  if (isSuperAdmin(req)) return true;
  const viewerEmpId = req.user?.empId;
  if (!viewerEmpId) return false;
  if (viewerEmpId === targetEmpId) return true;

  const portalRole = req.user?.accessRole || req.user?.role;
  if (portalRole === 'admin' || portalRole === 'management' || req.user?.canOpsLead) {
    return sameCrewForAccess(req.user.crew, targetCrew);
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

module.exports = {
  canViewLeaveBalance,
  canEditCompensateBalance,
  redactLeaveBalancesForClient,
  sameCrewForAccess,
};
