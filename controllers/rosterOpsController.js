const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const RosterAuditLog = require('../models/RosterAuditLog');
const { buildRosterSchedule, overrideMapFromDocs } = require('../services/shiftScheduleService');
const { logRosterEvent } = require('../services/rosterAuditService');

function fmtDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

async function loadOverridesForRange(start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  const docs = await ShiftOverride.find({
    date: { $gte: startStr, $lte: endStr },
  }).lean();
  return overrideMapFromDocs(docs);
}

async function buildSchedulePayload(start, end) {
  const config = await AdminConfig.findOne();
  const employees = await AdminUser.find().select('-passwordHash').lean();
  const overrideMap = await loadOverridesForRange(start, end);
  const schedule = buildRosterSchedule(employees, {
    startDate: start,
    endDate: end,
    baseDate: config?.shiftCycleBaseDate || '2026-01-01',
    overrideMap,
  });
  return schedule;
}

exports.getSchedule = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 48, 366);
    const startRaw = req.query.start || req.query.from;
    const endRaw = req.query.end || req.query.to;
    const start = startRaw ? new Date(startRaw) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = endRaw
      ? new Date(endRaw)
      : new Date(start.getTime() + (days - 1) * 86400000);

    const schedule = await buildSchedulePayload(start, end);
    res.json({ success: true, data: schedule });
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
    const { coverage, conflictCount } = await buildSchedulePayload(start, end);
    res.json({ success: true, data: { coverage, conflictCount } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAuditLog = async (req, res) => {
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
