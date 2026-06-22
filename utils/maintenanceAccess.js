const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const { resolveMaintenanceDepartment, parseDepartmentFromDesignation } = require('./maintenanceDepartment');

function isMaintenanceJobRole(role) {
  const r = String(role || '').toLowerCase();
  return /\bmaintenance\b/.test(r) || /\b(mmd|emd|imd)\b/.test(r);
}

/**
 * Whether the user may open the Maintenance portal (/maintenance, /task-planner).
 * Admins, maintenance department (MMD/EMD/IMD), PTW personnel with maintenance
 * designation, or explicit maintenance job role — not general operations crew only.
 */
function canAccessMaintenancePortal(user, ptwPerson) {
  if (!user) return false;
  const reqLike = { user };
  if (isSuperAdmin(reqLike) || hasPortalAdminAccess(reqLike)) return true;

  if (resolveMaintenanceDepartment(user, ptwPerson)) return true;

  if (isMaintenanceJobRole(user.role)) return true;

  if (ptwPerson) {
    if (parseDepartmentFromDesignation(ptwPerson.designation)) return true;
    if (isMaintenanceJobRole(ptwPerson.designation)) return true;
    const auths = ptwPerson.authorizations || [];
    if (auths.includes('maintenancePersonnel') || auths.includes('maintenance')) return true;
  }

  return false;
}

module.exports = {
  canAccessMaintenancePortal,
  isMaintenanceJobRole,
};
