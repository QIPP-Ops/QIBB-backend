const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');

const JWT_EXPIRES_IN = '8h';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Portal JWT role: admin | management | user */
function portalRoleFromUser(user) {
  const email = normalizeEmail(user.email);
  if (email === normalizeEmail(SUPER_ADMIN_EMAIL)) return 'admin';
  const access = user.accessRole || 'viewer';
  if (access === 'admin') return 'admin';
  if (access === 'management') return 'management';
  return 'user';
}

function buildJwtPayload(user) {
  const userId = String(user._id);
  const portalRole = portalRoleFromUser(user);
  const displayName = user.name || '';

  return {
    userId,
    email: user.email,
    role: portalRole,
    displayName,
    // Legacy / extended claims used by controllers and PTW
    id: userId,
    name: displayName,
    accessRole: user.accessRole || 'viewer',
    canOpsLead: Boolean(user.canOpsLead) || portalRole === 'admin',
    crew: user.crew,
    empId: user.empId,
    jobRole: user.role,
  };
}

/** After jwt.verify — single shape for req.user with legacy id/name fields */
function normalizeDecodedUser(decoded) {
  const userId = decoded.userId || decoded.id;
  const displayName = decoded.displayName || decoded.name || '';
  let role = decoded.role;
  if (!role && decoded.accessRole) {
    if (decoded.accessRole === 'admin') role = 'admin';
    else if (decoded.accessRole === 'management') role = 'management';
    else role = decoded.accessRole === 'viewer' ? 'user' : decoded.accessRole;
  }
  const accessRole =
    decoded.accessRole ||
    (role === 'user' ? 'viewer' : role === 'admin' || role === 'management' ? role : 'viewer');

  return {
    ...decoded,
    userId,
    id: userId,
    email: decoded.email,
    role,
    displayName,
    name: displayName,
    accessRole,
  };
}

module.exports = {
  JWT_EXPIRES_IN,
  buildJwtPayload,
  normalizeDecodedUser,
  portalRoleFromUser,
};
