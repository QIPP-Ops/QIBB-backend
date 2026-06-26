const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const ActingAssignment = require('../models/ActingAssignment');
const RosterAuditLog = require('../models/RosterAuditLog');
const {
  buildRosterSchedule,
  overrideMapFromDocs,
  filterActiveConflicts,
} = require('../services/shiftScheduleService');
const { groupConflictsByCycle } = require('../services/shiftCycleConflict');
const { enrichScheduleRows, filterConflictsByDelegations } = require('../services/actingCoverService');
const { logRosterEvent } = require('../services/rosterAuditService');
const { filterScheduleForViewer } = require('../utils/timesheetAccess');
const { enrichScheduleWithAttendance } = require('../services/scheduleAttendanceService');

function fmtDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Leave timesheet default: 2 weeks before today through 2 calendar months after today. */
function leaveTimesheetDefaultRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 14);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setMonth(end.getMonth() + 2);
  return { start, end };
}

async function loadOverridesForRange(start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  const docs = await ShiftOverride.find({
    date: { $gte: startStr, $lte: endStr },
  }).lean();
  return overrideMapFromDocs(docs);
}

async function loadActingAssignmentsForRange(start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  return ActingAssignment.find({
    startDate: { $lte: endStr },
    endDate: { $gte: startStr },
  }).lean();
}

async function buildSchedulePayload(start, end) {
  const config = await AdminConfig.findOne();
  const {
    loadStaffingRosterEmployees,
    visibleRosterEmployees,
  } = require('../utils/rosterEmployeeLoad');
  const staffingEmployees = await loadStaffingRosterEmployees();
  const employees = visibleRosterEmployees(staffingEmployees);
  const overrideMap = await loadOverridesForRange(start, end);
  const actingAssignments = await loadActingAssignmentsForRange(start, end);
  const schedule = buildRosterSchedule(employees, {
    startDate: start,
    endDate: end,
    baseDate: config?.shiftCycleBaseDate || '2026-01-01',
    overrideMap,
    actingAssignments,
    staffingEmployees,
  });
  const employeeById = new Map(staffingEmployees.map((e) => [e.empId, e]));
  schedule.rows = enrichScheduleRows(schedule.rows, actingAssignments, employeeById);
  schedule.actingAssignments = actingAssignments;
  schedule.delegations = actingAssignments;
  const dailyConflicts = filterActiveConflicts(
    filterConflictsByDelegations(schedule.conflicts, actingAssignments, staffingEmployees)
  );
  schedule.conflicts = groupConflictsByCycle(
    dailyConflicts,
    schedule.dates,
    schedule.baseDate
  );
  schedule.conflictCount = schedule.conflicts.length;
  return schedule;
}

function scheduleForClient(schedule, req) {
  return filterScheduleForViewer(schedule, req);
}

exports.getSchedule = async (req, res) => {
  try {
    const startRaw = req.query.start || req.query.from;
    const endRaw = req.query.end || req.query.to;
    let start;
    let end;
    if (startRaw || endRaw) {
      start = new Date(startRaw || endRaw);
      start.setHours(0, 0, 0, 0);
      end = new Date(endRaw || startRaw);
      end.setHours(0, 0, 0, 0);
    } else if (req.query.days) {
      const days = Math.min(parseInt(req.query.days, 10) || 48, 366);
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date(start.getTime() + (days - 1) * 86400000);
    } else {
      ({ start, end } = leaveTimesheetDefaultRange());
    }

    if (end < start) {
      return res.status(400).json({ message: 'End date must be on or after start date.' });
    }
    const spanDays = Math.floor((end - start) / 86400000) + 1;
    const MAX_SCHEDULE_RANGE_DAYS = 580;
    if (spanDays > MAX_SCHEDULE_RANGE_DAYS) {
      return res.status(400).json({
        message: `Date range is too large (${spanDays} days). Maximum is ${MAX_SCHEDULE_RANGE_DAYS} days per request.`,
      });
    }

    const schedule = await enrichScheduleWithAttendance(await buildSchedulePayload(start, end));
    res.json({ success: true, data: scheduleForClient(schedule, req) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCoverage = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 31, 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + (days - 1) * 86400000);
    const payload = await buildSchedulePayload(start, end);
    const { coverage, conflictCount } = payload;
    res.json({ success: true, data: { coverage, conflictCount } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAuditLog = async (req, res) => {
  const { isSuperAdmin } = require('../middleware/superAdmin');
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: 'Only the designated super administrator may view audit logs.' });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const filter = {};
    if (req.query.empId) filter.targetEmpId = req.query.empId;
    if (req.query.action) filter.action = req.query.action;

    const logs = await RosterAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.setShiftOverride = async (req, res) => {
  try {
    const { empId, date, shift, note } = req.body;
    if (!empId || !date) {
      return res.status(400).json({ message: 'empId and date are required.' });
    }
    if (!['D', 'N', 'O'].includes(shift)) {
      return res.status(400).json({ message: 'shift must be D, N, or O.' });
    }

    const target = await AdminUser.findOne({ empId }).select('-passwordHash');
    if (!target) return res.status(404).json({ message: 'Personnel not found.' });

    const actor = await AdminUser.findById(req.user.id).select('-passwordHash');
    const doc = await ShiftOverride.findOneAndUpdate(
      { empId, date },
      { shift, note: note || '', setBy: req.user.id },
      { upsert: true, new: true, runValidators: true }
    );

    await logRosterEvent({
      action: 'SHIFT_OVERRIDE',
      actor,
      target,
      summary: `${actor?.name || 'Ops lead'} set ${target.name} (${empId}) to ${shift} on ${date}`,
      metadata: { date, shift, note: note || '' },
    });

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.clearShiftOverride = async (req, res) => {
  try {
    const { empId, date } = req.params;
    const target = await AdminUser.findOne({ empId }).select('-passwordHash');
    const actor = await AdminUser.findById(req.user.id).select('-passwordHash');

    const removed = await ShiftOverride.findOneAndDelete({ empId, date });
    if (!removed) {
      return res.status(404).json({ message: 'No override for this date.' });
    }

    if (target) {
      await logRosterEvent({
        action: 'SHIFT_OVERRIDE',
        actor,
        target,
        summary: `${actor?.name || 'Ops lead'} cleared shift override for ${target.name} (${empId}) on ${date}`,
        metadata: { date, cleared: true, previousShift: removed.shift },
      });
    }

    res.json({ success: true, message: 'Override cleared.' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
