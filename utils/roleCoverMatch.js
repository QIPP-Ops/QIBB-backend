const { STAFFING_RULES } = require('../services/staffingRulesService');

function isSicRole(role) {
  const r = String(role || '').toLowerCase();
  return r.includes('shift in charge') || /\bsic\b/.test(r);
}

function isSupervisorRole(role) {
  const r = String(role || '').toLowerCase();
  return r.includes('supervisor') && !isSicRole(role);
}

function isLeaderRole(role) {
  return isSicRole(role) || isSupervisorRole(role);
}

function normalizeRoleKey(role) {
  return String(role || '').trim().toLowerCase();
}

function staffingRuleLabelForRole(role) {
  for (const rule of STAFFING_RULES) {
    if (rule.match(role)) return rule.label;
  }
  return null;
}

function roleCoverBucket(role) {
  if (isLeaderRole(role)) return 'leader';
  const label = staffingRuleLabelForRole(role);
  if (label) return label;
  return normalizeRoleKey(role);
}

/**
 * Cover/delegation role compatibility:
 * - SIC and Supervisor are interchangeable (leader group)
 * - Otherwise same staffing role bucket (e.g. CCR Operator ↔ CCR Operator)
 */
function rolesMatchForCover(absentRole, coverRole) {
  if (!absentRole || !coverRole) return false;
  if (isLeaderRole(absentRole) && isLeaderRole(coverRole)) return true;
  return roleCoverBucket(absentRole) === roleCoverBucket(coverRole);
}

function assertRolesMatchForCover(absentRole, coverRole) {
  if (!rolesMatchForCover(absentRole, coverRole)) {
    const err = new Error(
      'Cover delegate must have a matching role. Shift in Charge and Supervisor may cover each other; otherwise the same role is required.'
    );
    err.status = 400;
    throw err;
  }
}

module.exports = {
  isSicRole,
  isSupervisorRole,
  isLeaderRole,
  rolesMatchForCover,
  assertRolesMatchForCover,
  staffingRuleLabelForRole,
  roleCoverBucket,
};
