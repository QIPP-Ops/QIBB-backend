const AdminUser = require('../models/AdminUser');
const { filterProtectedAccounts } = require('./protectedAccounts');
const { sortRosterEmployees } = require('./rosterRowSort');

/** Approved active crew used for minimum-staffing headcount (includes timesheet-hidden). */
async function loadStaffingRosterEmployees() {
  const rows = filterProtectedAccounts(
    await AdminUser.find({ isApproved: true, isActive: { $ne: false } })
      .select('-passwordHash')
      .lean()
  );
  return sortRosterEmployees(rows);
}

/** Rows shown on the operations leave timesheet grid. */
function visibleRosterEmployees(staffingEmployees) {
  return (staffingEmployees || []).filter((e) => !e.hiddenFromLeaveTimesheet);
}

module.exports = {
  loadStaffingRosterEmployees,
  visibleRosterEmployees,
};
