const AdminUser = require('../models/AdminUser');
const { isSuperAdmin, hasPortalAdminAccess } = require('../middleware/superAdmin');
const { isPlantManagerFromToken } = require('../services/plantManagerService');
const { normCrew } = require('./rosterRowSort');
const { CHAT_AUDIT_ACTIONS } = require('../services/chatAuditService');

function hasFullLogAccess(req) {
  if (isSuperAdmin(req)) return true;
  if (isPlantManagerFromToken(req.user)) return true;
  return false;
}

function canViewAuditLogs(req) {
  if (hasFullLogAccess(req)) return true;
  if (!hasPortalAdminAccess(req)) return false;
  return Boolean(String(req.user?.crew || '').trim());
}

function canViewLoginLogs(req) {
  return canViewAuditLogs(req);
}

async function getCrewMemberEmails(crew) {
  const normalized = normCrew(crew);
  const users = await AdminUser.find({}).select('email crew').lean();
  return users
    .filter((user) => normCrew(user.crew) === normalized)
    .map((user) => String(user.email || '').trim().toLowerCase())
    .filter(Boolean);
}

async function buildAuditLogCrewFilter(req) {
  if (hasFullLogAccess(req)) return null;

  const crew = String(req.user?.crew || '').trim();
  if (!crew || !hasPortalAdminAccess(req)) {
    const error = new Error('Audit log access is restricted to administrators with an assigned crew.');
    error.status = 403;
    throw error;
  }

  const crewEmails = await getCrewMemberEmails(crew);
  const normalizedCrew = normCrew(crew);

  return {
    $or: [
      { actorCrew: normalizedCrew },
      { targetCrew: normalizedCrew },
      { actorEmail: { $in: crewEmails } },
      { 'before.crew': crew },
      { 'after.crew': crew },
      { 'before.crew': normalizedCrew },
      { 'after.crew': normalizedCrew },
    ],
  };
}

function buildLoginLogCrewFilter(req) {
  if (hasFullLogAccess(req)) return null;

  const crew = String(req.user?.crew || '').trim();
  if (!crew || !hasPortalAdminAccess(req)) {
    const error = new Error('Login log access is restricted to administrators with an assigned crew.');
    error.status = 403;
    throw error;
  }

  const normalizedCrew = normCrew(crew);
  return {
    $or: [{ crew: crew }, { crew: normalizedCrew }],
  };
}

function mergeFilters(baseFilter, scopeFilter) {
  if (!scopeFilter) return baseFilter;
  if (!baseFilter || Object.keys(baseFilter).length === 0) return scopeFilter;
  return { $and: [baseFilter, scopeFilter] };
}

/** Chat/contact audit is visible to super admin only — hide from crew admins and plant managers. */
function buildNonChatAuditFilter() {
  return { action: { $nin: CHAT_AUDIT_ACTIONS } };
}

function canViewChatAudit(req) {
  return isSuperAdmin(req);
}

module.exports = {
  hasFullLogAccess,
  canViewAuditLogs,
  canViewLoginLogs,
  buildAuditLogCrewFilter,
  buildLoginLogCrewFilter,
  mergeFilters,
  getCrewMemberEmails,
  buildNonChatAuditFilter,
  canViewChatAudit,
};
