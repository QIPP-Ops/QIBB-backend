const { isSuperAdminUser } = require('../middleware/superAdmin');
const { crewsMatch } = require('../services/actingCoverService');

function isSicOrSupervisorRole(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('shift in charge') || /\bsic\b/.test(r)) return true;
  if (r.includes('supervisor') && !r.includes('shift in charge') && !/\bsic\b/.test(r)) return true;
  return false;
}

function jobRoleFromReq(req) {
  return req.user?.jobRole || '';
}

function canLogAttendance(req) {
  if (isSuperAdminUser(req)) return true;
  return isSicOrSupervisorRole(jobRoleFromReq(req));
}

function canViewAttendanceList(req, { crew, empId } = {}) {
  if (isSuperAdminUser(req)) return true;

  const actorEmpId = String(req.user?.empId || '').trim();
  const actorCrew = req.user?.crew;

  if (empId && actorEmpId && empId === actorEmpId) return true;

  if (canLogAttendance(req)) {
    if (!crew) return true;
    return crewsMatch(actorCrew, crew);
  }

  if (empId && actorEmpId) {
    return empId === actorEmpId;
  }

  return false;
}

function canEditAttendanceForEmployee(req, employee) {
  if (!employee) return false;
  if (isSuperAdminUser(req)) return true;

  const actorCrew = req.user?.crew;
  if (!canLogAttendance(req)) return false;
  return crewsMatch(actorCrew, employee.crew);
}

function canDeleteAttendance(req) {
  return isSuperAdminUser(req);
}

module.exports = {
  canLogAttendance,
  canViewAttendanceList,
  canEditAttendanceForEmployee,
  canDeleteAttendance,
  jobRoleFromReq,
  isSicOrSupervisorRole,
};
