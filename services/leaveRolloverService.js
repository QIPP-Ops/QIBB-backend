const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const { logBalanceChange } = require('./leaveBalanceLogService');

async function runYearEndRollover(year, { dryRun = false, performedBy = 'system' } = {}) {
  const config = (await AdminConfig.findOne()) || (await AdminConfig.create({}));
  const cap = Number(config.carryForwardCap ?? 30);
  const employees = await AdminUser.find({ isApproved: true });
  const results = [];

  for (const emp of employees) {
    const before = emp.annualLeaveBalance ?? 0;
    const after = Math.min(before, cap);
    const forfeited = Math.round((before - after) * 10000) / 10000;

    results.push({
      empId: emp.empId,
      name: emp.name,
      balanceBefore: before,
      balanceAfter: after,
      forfeited,
      cap,
    });

    if (!dryRun && after !== before) {
      emp.annualLeaveBalance = after;
      await emp.save();
      await logBalanceChange({
        empId: emp.empId,
        changeType: 'manual_adjust',
        balanceField: 'annualLeaveBalance',
        delta: after - before,
        balanceBefore: before,
        balanceAfter: after,
        performedBy,
        reason: `Year-end rollover ${year} (carry-forward cap ${cap})`,
      });
    }
  }

  const adjusted = results.filter((r) => r.balanceBefore !== r.balanceAfter).length;
  return {
    year,
    cap,
    dryRun,
    totalEmployees: results.length,
    adjusted,
    employees: results,
  };
}

module.exports = {
  runYearEndRollover,
};
