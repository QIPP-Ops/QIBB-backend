const AdminUser = require('../models/AdminUser');
const { filterProtectedAccounts } = require('./protectedAccounts');
const { sortRosterEmployees } = require('./rosterRowSort');

/** Active crew used for minimum-staffing headcount (includes timesheet-hidden and non-portal-approved). */
async function loadStaffingRosterEmployees() {
  const rows = filterProtectedAccounts(
    await AdminUser.find({ isActive: { $ne: false } })
      .select('-passwordHash')
      .lean()
  );
  return sortRosterEmployees(
    rows.filter((e) => String(e.crew || '').trim() && String(e.role || '').trim())
  );
}

/** Rows shown on the operations leave timesheet grid. */
function visibleRosterEmployees(staffingEmployees) {
  return (staffingEmployees || []).filter((e) => !e.hiddenFromLeaveTimesheet);
}

module.exports = {
  loadStaffingRosterEmployees,
  visibleRosterEmployees,
};
