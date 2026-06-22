const QIPP_DEPARTMENTS = ['MMD', 'EMD', 'IMD'];

function normalizeDepartment(raw) {
  const value = String(raw || '').trim().toUpperCase();
  return QIPP_DEPARTMENTS.includes(value) ? value : null;
}

/** Derive MMD / EMD / IMD from PTW designation (e.g. "MMD Sup.", "IMD Tech"). */
function parseDepartmentFromDesignation(designation) {
  const value = String(designation || '').trim().toUpperCase();
  if (value.startsWith('MMD')) return 'MMD';
  if (value.startsWith('EMD')) return 'EMD';
  if (value.startsWith('IMD')) return 'IMD';
  return null;
}

/**
 * Resolve a user's maintenance department for QIPP tab scoping.
 * Priority: AdminUser.maintenanceDepartment → PTW personnel department → designation prefix.
 */
function resolveMaintenanceDepartment(user, ptwPerson) {
  const fromProfile = normalizeDepartment(user?.maintenanceDepartment);
  if (fromProfile) return fromProfile;

  if (!ptwPerson) return null;

  const fromPtw = normalizeDepartment(ptwPerson.department);
  if (fromPtw) return fromPtw;

  return parseDepartmentFromDesignation(ptwPerson.designation);
}

const { canAccessMaintenancePortal } = require('./maintenanceAccess');

module.exports = {
  QIPP_DEPARTMENTS,
  normalizeDepartment,
  parseDepartmentFromDesignation,
  resolveMaintenanceDepartment,
  canAccessMaintenancePortal,
};
