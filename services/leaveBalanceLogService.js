const LeaveBalanceLog = require('../models/LeaveBalanceLog');

async function logBalanceChange({
  empId,
  changeType,
  balanceField,
  delta,
  balanceBefore,
  balanceAfter,
  leaveId = '',
  performedBy = 'system',
  reason = '',
}) {
  if (!empId || !changeType || !balanceField) return null;
  return LeaveBalanceLog.create({
    empId,
    changeType,
    balanceField,
    delta,
    balanceBefore,
    balanceAfter,
    leaveId,
    performedBy,
    reason,
  });
}

async function getBalanceLogForEmployee(empId, { from, to } = {}) {
  const filter = { empId: String(empId).trim() };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }
  return LeaveBalanceLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
}

module.exports = {
  logBalanceChange,
  getBalanceLogForEmployee,
};
