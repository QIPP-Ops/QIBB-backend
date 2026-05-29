const AdminUser = require('../models/AdminUser');
const ShiftReport = require('../models/ShiftReport');
const ShiftOverride = require('../models/ShiftOverride');
const AdminConfig = require('../models/AdminConfig');
const {
  overrideMapFromDocs,
  resolveEmployeeShift,
  buildRosterSchedule,
} = require('./shiftScheduleService');
const { notifyShiftMissing, findSupervisorsForCrew } = require('./notificationService');

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function parseLocal(dateStr, hh, mm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Fixed shift windows per requirements. */
function shiftWindow(shift, dateStr, crew) {
  if (crew === 'General') {
    const dt = parseLocal(dateStr, 7, 0);
    const dow = dt.getDay();
    if (dow === 0 || dow === 5 || dow === 6) return null;
    return { start: parseLocal(dateStr, 7, 0), end: parseLocal(dateStr, 16, 0), label: 'General day' };
  }
  if (shift === 'D') {
    return { start: parseLocal(dateStr, 5, 30), end: parseLocal(dateStr, 17, 30), label: 'Day' };
  }
  if (shift === 'N') {
    const end = parseLocal(dateStr, 5, 30);
    end.setDate(end.getDate() + 1);
    return { start: parseLocal(dateStr, 17, 30), end, label: 'Night' };
  }
  return null;
}

function windowEnded(win, now = new Date()) {
  const end = win.end instanceof Date ? win.end : new Date(win.end);
  return now >= end;
}

async function employeesOnShift(dateStr, shiftCode) {
  const config = await AdminConfig.findOne().lean();
  const baseDate = config?.shiftCycleBaseDate || '2026-01-01';
  const overrides = overrideMapFromDocs(await ShiftOverride.find({ date: dateStr }).lean());
  const employees = await AdminUser.find({ isApproved: true }).select('-passwordHash').lean();

  return employees.filter((emp) => {
    const slot = resolveEmployeeShift(emp, dateStr, { baseDate, overrideMap: overrides });
    if (slot.onLeave) return false;
    if (emp.crew === 'General') return shiftCode === 'D' && shiftWindow('D', dateStr, 'General');
    return slot.shift === shiftCode;
  });
}

async function checkShiftReportsForEndedShift({ dateStr, shiftCode, now = new Date() }) {
  const onDuty = await employeesOnShift(dateStr, shiftCode);
  if (!onDuty.length) return { checked: 0, missing: 0 };

  const sample = onDuty[0];
  const win = shiftWindow(shiftCode, dateStr, sample.crew);
  if (!win || !windowEnded(win, now)) return { checked: onDuty.length, missing: 0, pending: true };

  const missing = [];
  for (const emp of onDuty) {
    const report = await ShiftReport.findOne({ empId: emp.empId, date: dateStr, shift: shiftCode }).lean();
    if (!report || report.status === 'draft') missing.push(emp);
  }

  if (!missing.length) return { checked: onDuty.length, missing: 0 };

  const digestLines = [];
  for (const emp of missing) {
    const supervisors = await findSupervisorsForCrew(emp.crew);
    await notifyShiftMissing({
      member: emp,
      shiftDate: dateStr,
      shiftLabel: win.label,
      supervisors,
    });
    digestLines.push(`${emp.name} (${emp.crew})`);
  }

  if (digestLines.length) {
    await notifyShiftMissing({
      member: null,
      shiftDate: dateStr,
      shiftLabel: win.label,
      supervisors: [],
      adminDigest: `Missing ${win.label} reports for ${dateStr}: ${digestLines.join('; ')}`,
    });
  }

  return { checked: onDuty.length, missing: missing.length };
}

async function runShiftReportReminderSweep(now = new Date()) {
  const today = fmtDate(now);
  const yesterday = fmtDate(new Date(now.getTime() - 86400000));
  const dates = [yesterday, today];
  const results = [];

  for (const dateStr of dates) {
    for (const shiftCode of ['D', 'N']) {
      results.push(await checkShiftReportsForEndedShift({ dateStr, shiftCode, now }));
    }
  }
  return results;
}

let timer = null;

function startShiftReportReminderScheduler(intervalMs = 15 * 60 * 1000) {
  if (timer) return;
  const tick = async () => {
    try {
      await runShiftReportReminderSweep();
    } catch (err) {
      console.error('[shift-reminder]', err.message);
    }
  };
  tick();
  timer = setInterval(tick, intervalMs);
}

module.exports = {
  shiftWindow,
  runShiftReportReminderSweep,
  startShiftReportReminderScheduler,
  checkShiftReportsForEndedShift,
};
