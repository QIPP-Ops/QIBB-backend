const { isSuperAdminUser, hasPortalAdminAccess } = require('../middleware/superAdmin');

const { crewsMatch } = require('../services/actingCoverService');



function isSicOrSupervisorRole(role) {

  const r = String(role || '').toLowerCase();

  if (r.includes('shift in charge') || /\bsic\b/.test(r)) return true;

  if (r.includes('supervisor') && !r.includes('shift in charge') && !/\bsic\b/.test(r)) return true;

  return false;

}



function isGdpEngineerRole(role) {

  return String(role || '').toLowerCase().includes('gdp');

}



/** SIC, Supervisor, or GDP Engineer — may view same-crew timesheet rows (read scope). */

function isCrewTimesheetLeadRole(role) {

  return isSicOrSupervisorRole(role) || isGdpEngineerRole(role);

}



function jobRoleFromReq(req) {

  return req.user?.jobRole || req.user?.role || '';

}



/** Crew admins and super admin may log attendance for their crew (or all crews for super admin). */

function canLogAttendance(req) {
  if (isSuperAdminUser(req)) return true;
  return hasPortalAdminAccess(req);
}



function canViewAttendanceList(req, { crew } = {}) {

  if (!canLogAttendance(req)) return false;

  if (isSuperAdminUser(req)) return true;



  const actorCrew = req.user?.crew;

  if (!crew) return true;

  return crewsMatch(actorCrew, crew);

}



function canEditAttendanceForEmployee(req, employee) {

  if (!employee) return false;

  if (isSuperAdminUser(req)) return true;

  if (!canLogAttendance(req)) return false;

  return crewsMatch(req.user?.crew, employee.crew);

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

  isGdpEngineerRole,

  isCrewTimesheetLeadRole,

};


