const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const {
  overrideMapFromDocs,
  resolveEmployeeShift,
} = require('./shiftScheduleService');

function fmtDate(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

async function loadOverridesForDate(dateStr) {
  const docs = await ShiftOverride.find({ date: dateStr }).lean();
  return overrideMapFromDocs(docs);
}

async function getShiftCycleBaseDate() {
  const config = await AdminConfig.findOne().lean();
  return config?.shiftCycleBaseDate || '2026-01-01';
}

/**
 * On-duty = roster shift D or N for that date, not on leave, after crew overrides.
 */
async function getEmployeeDutyStatus(employee, dateStr = fmtDate()) {
  const baseDate = await getShiftCycleBaseDate();
  const overrideMap = await loadOverridesForDate(dateStr);
  const slot = resolveEmployeeShift(employee, dateStr, { baseDate, overrideMap });
  return {
    date: dateStr,
    empId: employee.empId,
    crew: employee.crew,
    ...slot,
    dutyLabel: slot.shift === 'D' ? 'Day' : slot.shift === 'N' ? 'Night' : null,
  };
}

module.exports = {
  fmtDate,
  getEmployeeDutyStatus,
  loadOverridesForDate,
  getShiftCycleBaseDate,
};
