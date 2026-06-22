const { isSuperAdmin } = require('../middleware/superAdmin');

const BANDER_EMAIL = 'b.aldogaish@nomac.com';

function normalizePersonName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Bander / Bandar Aldogaish — match by personnel name or known email. */
function isBanderAldogaishUser(user) {
  if (!user) return false;
  const email = String(user.email || '').trim().toLowerCase();
  if (email === BANDER_EMAIL) return true;
  const blob = normalizePersonName(
    `${user.name || ''} ${user.displayName || ''} ${user.fullName || ''}`
  );
  const hasFirst = blob.includes('bander') || blob.includes('bandar');
  const hasLast = blob.includes('aldogaish') || blob.includes('aldogais');
  return hasFirst && hasLast;
}

/**
 * Whether the user may open the Maintenance portal (/maintenance, /task-planner).
 * Super admin or Bander Aldogaish only.
 */
function canAccessMaintenancePortal(user) {
  if (!user) return false;
  const reqLike = { user };
  if (isSuperAdmin(reqLike)) return true;
  if (isBanderAldogaishUser(user)) return true;
  return false;
}

module.exports = {
  canAccessMaintenancePortal,
  isBanderAldogaishUser,
};
