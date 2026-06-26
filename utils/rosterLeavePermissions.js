const { isSuperAdmin } = require('../middleware/superAdmin');
const { isPlantManagerUser } = require('../services/plantManagerService');
const { crewsMatch } = require('../services/actingCoverService');
const { isSicOrSupervisorRole, isCrewTimesheetLeadRole } = require('./attendancePermissions');

/** Whether the user may view or interact with leave / shift report rows for this employee. */
function canEditLeaveRow(user, row) {
  if (!user?.empId) return false;
  if (isSuperAdmin({ user })) return true;

  const jobRole = user.jobRole || user.role || '';
  if (isCrewTimesheetLeadRole(jobRole)) {
    if (user.crew && row.crew) {
      return crewsMatch(user.crew, row.crew);
    }
    return user.empId === row.empId;
  }

  const portalRole = user.accessRole || user.role;
  if (portalRole === 'viewer') {
    return user.empId === row.empId;
  }

  if (portalRole === 'admin' || portalRole === 'management' || user.canOpsLead) {
    if (user.crew && row.crew) {
      return user.crew === row.crew;
    }
    return user.empId === row.empId;
  }

  return user.empId === row.empId;
}

/** Whether the requester may add/edit/remove leave for this employee. */
function canEditLeaveForEmployee(req, employee) {
  if (!req?.user?.empId || !employee?.empId) return false;
  return canEditLeaveRow(req.user, {
    empId: employee.empId,
    crew: employee.crew || '',
  });
}

function canAccessShiftReport(req, employee) {
  if (isPlantManagerUser(req.user)) return false;
  return canEditLeaveRow(req.user, {
    empId: employee?.empId,
    crew: employee?.crew || '',
  });
}

function canEditShiftReport(req, employee, duty) {
  if (isPlantManagerUser(employee) || isPlantManagerUser(req.user)) return false;
  if (!canAccessShiftReport(req, employee)) return false;
  if (isSuperAdmin(req)) return true;

  const isOwner = req.user?.empId === employee?.empId;
  if (isOwner) return Boolean(duty?.onDuty);

  const portalRole = req.user?.accessRole || req.user?.role;
  if (portalRole === 'admin' || portalRole === 'management' || req.user?.canOpsLead) {
    if (req.user?.crew && employee?.crew && req.user.crew === employee.crew) {
      return true;
    }
  }

  return false;
}

/** Whether the user may view this employee's timesheet (schedule, leave cells, planner). */
function canViewTimesheetRow(user, row) {
  return canEditLeaveRow(user, row);
}

/** Whether the user may approve/reject leave for this employee. */
function canApproveLeaveForEmployee(req, employee) {
  if (!req?.user?.empId || !employee?.empId) return false;
  if (isSuperAdmin(req)) return true;

  const portalRole = req.user.accessRole || req.user.role;
  const jobRole = req.user.jobRole || req.user.role || '';
  const hasApproveRole =
    portalRole === 'admin' ||
    portalRole === 'management' ||
    isSicOrSupervisorRole(jobRole);
  if (!hasApproveRole) return false;

  return canViewTimesheetRow(req.user, {
    empId: employee.empId,
    crew: employee.crew || '',
  });
}

module.exports = {
  canEditLeaveRow,
  canEditLeaveForEmployee,
  canViewTimesheetRow,
  canApproveLeaveForEmployee,
  canAccessShiftReport,
  canEditShiftReport,
};
