const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const { logRosterEvent } = require('../services/rosterAuditService');
const { isPlaceholderEmail, sanitizeEmailForClient } = require('../utils/placeholderEmail');
const ShiftOverride = require('../models/ShiftOverride');
const { getShiftForDate, userCanAccessOpsTools } = require('../services/shiftScheduleService');

async function loadActor(req) {
  if (!req.user?.id) return null;
  return AdminUser.findById(req.user.id).select('-passwordHash');
}

function calendarDaysInclusive(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function canEditCompensateBalance(req, targetUser) {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  if (req.user.canOpsLead) return true;
  if (req.user.role === 'management' && targetUser.crew === req.user.crew) return true;
  return false;
}

function rosterRowForClient(doc) {
  const row = doc.toObject ? doc.toObject() : { ...doc };
  row.email = sanitizeEmailForClient(row.email);
  if (!row.opsGroupLabel) row.opsGroupLabel = '';
  if (!row.opsTreeParentEmpId) row.opsTreeParentEmpId = '';
  if (!row.opsTreeRelation) row.opsTreeRelation = '';
  if (!row.assignedTo) row.assignedTo = '';
  return row;
}

exports.getRoster = async (req, res) => {
  try {
    const rows = await AdminUser.find().select('-passwordHash').sort({ crew: 1, role: 1 }).lean();
    res.json(rows.map(rosterRowForClient));
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.addLeave = async (req, res) => {
  const { employeeId, empId, leave, start, end, type, workingDays, totalDays } = req.body;
  const targetId = employeeId || empId;
  if (!targetId) return res.status(400).json({ message: 'employeeId (or empId) is required.' });

  try {
    const actor = await loadActor(req);
    const user = await AdminUser.findOne({ empId: targetId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin && actor && actor.empId !== targetId) {
      return res.status(403).json({ message: 'You can only apply leave for your own account.' });
    }

    const leaveData = leave || { start, end, type, workingDays, totalDays };
    if (!leaveData.start || !leaveData.end) {
      return res.status(400).json({ message: 'Leave start and end dates are required.' });
    }
    leaveData.start = new Date(leaveData.start);
    leaveData.end = new Date(leaveData.end);
    const leaveTypeStr = String(leaveData.type || 'Planned');
    if (/compensat/i.test(leaveTypeStr)) {
      const span =
        typeof leaveData.workingDays === 'number' && leaveData.workingDays > 0
          ? leaveData.workingDays
          : typeof leaveData.totalDays === 'number' && leaveData.totalDays > 0
            ? leaveData.totalDays
            : calendarDaysInclusive(leaveData.start, leaveData.end);
      const bal = user.compensateDayBalance ?? 0;
      if (bal < span) {
        return res.status(400).json({
          message: `Insufficient compensate-day balance (${bal} available, ${span} required).`,
        });
      }
      user.compensateDayBalance = bal - span;
    }

    user.leaves.push(leaveData);
    await user.save();

    const startStr = new Date(leaveData.start).toISOString().slice(0, 10);
    const endStr = new Date(leaveData.end).toISOString().slice(0, 10);

    await logRosterEvent({
      action: 'LEAVE_APPLIED',
      actor,
      target: user,
      summary: `${user.name} (${user.empId}): leave ${leaveData.type || 'Planned'} ${startStr} → ${endStr}`,
      metadata: { leave: leaveData, appliedBy: actor?.email || 'unknown' },
    });

    res.status(201).json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.createEmployee = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Only administrators can add roster members.' });
  }
  try {
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const actor = await loadActor(req);
    const { name, empId, crew, role, color, email, accessRole, assignedTo } = req.body;
    if (!name?.trim() || !empId?.trim() || !crew || !role) {
      return res.status(400).json({ message: 'name, empId, crew, and role are required.' });
    }
    const id = String(empId).trim();
    const dup = await AdminUser.findOne({ empId: id });
    if (dup) return res.status(409).json({ message: `Employee ID ${id} already exists.` });

    const loginEmail = (email || '').trim().toLowerCase() || `${id}@roster.acwaops.local`;
    const emailTaken = await AdminUser.findOne({ email: loginEmail });
    if (emailTaken) {
      return res.status(409).json({ message: 'That email is already in use.' });
    }

    const validColors = [
      'crew-red', 'crew-yellow', 'crew-green', 'crew-lightblue',
      'crew-lightviolet', 'crew-lightorange', 'crew-grey',
    ];
    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const { isSuperAdmin } = require('../middleware/superAdmin');
    let resolvedRole = 'viewer';
    if (['admin', 'viewer', 'management'].includes(accessRole)) {
      if (accessRole === 'admin' && !isSuperAdmin(req)) {
        return res.status(403).json({
          message: 'Only admin@acwaops.com may create accounts with admin access.',
        });
      }
      resolvedRole = accessRole;
    }

    const user = await AdminUser.create({
      name: name.trim(),
      empId: id,
      crew,
      role,
      color: validColors.includes(color) ? color : 'crew-grey',
      email: loginEmail,
      passwordHash,
      accessRole: resolvedRole,
      isApproved: true,
      isEmailVerified: Boolean(email?.trim()),
      ...(assignedTo !== undefined && { assignedTo: String(assignedTo || '').trim() }),
    });

    await logRosterEvent({
      action: 'PROFILE_UPDATED',
      actor,
      target: user,
      summary: `Admin added ${user.name} (${user.empId}) to crew ${user.crew}`,
      metadata: { created: true },
    });

    const out = user.toObject();
    delete out.passwordHash;
    res.status(201).json({
      message: 'Personnel added.',
      user: out,
      tempPassword: email?.trim() ? undefined : tempPassword,
      loginEmail,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const isAdmin = req.user?.role === 'admin';
    const isOpsLead = actor && userCanAccessOpsTools(actor);

    if (!isAdmin && !isOpsLead) {
      return res.status(403).json({
        message: 'Only administrators or management can update personnel profiles.',
      });
    }

    const {
      passwordHash,
      email,
      accessRole,
      isApproved,
      isEmailVerified,
      leaves,
      kpis,
      ...rest
    } = req.body;

    let safeBody;
    if (isAdmin) {
      safeBody = { ...rest };
    } else {
      const allowed = [
        'name', 'fullName', 'crew', 'role', 'color', 'seniority', 'position',
        'joiningDate', 'nationality', 'iqama', 'employmentType', 'company', 'empId',
      ];
      safeBody = {};
      allowed.forEach((k) => {
        if (rest[k] !== undefined) safeBody[k] = rest[k];
      });
      if (!Object.keys(safeBody).length) {
        return res.status(403).json({
          message: 'Management can only update personnel profile fields.',
        });
      }
    }

    if (isAdmin) {
      const hrFields = [
        'fullName', 'position', 'joiningDate', 'nationality', 'iqama',
        'employmentType', 'company', 'canOpsLead',
      ];
      hrFields.forEach((k) => {
        if (rest[k] !== undefined) safeBody[k] = rest[k];
      });
    }

    const { isSuperAdmin } = require('../middleware/superAdmin');
    if (isSuperAdmin(req)) {
      ['opsGroupLabel', 'opsTreeParentEmpId', 'opsTreeRelation', 'opsTreeOrder', 'assignedTo'].forEach((k) => {
        if (rest[k] !== undefined) safeBody[k] = rest[k];
      });
    }

    const user = await AdminUser.findOneAndUpdate(
      { empId: req.params.empId },
      { $set: safeBody },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    await logRosterEvent({
      action: 'PROFILE_UPDATED',
      actor,
      target: user,
      summary: `${isAdmin ? 'Admin' : 'Management'} updated profile for ${user.name} (${user.empId})`,
      metadata: { fields: Object.keys(safeBody) },
    });

    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.deleteEmployee = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Only administrators can remove personnel.' });
    }
    const actor = await loadActor(req);
    const user = await AdminUser.findOneAndDelete({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    await logRosterEvent({
      action: 'USER_REJECTED',
      actor,
      target: user,
      summary: `Removed personnel record ${user.name} (${user.empId})`,
    });

    res.json({ message: 'Deleted' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.removeLeave = async (req, res) => {
  const { employeeId, leaveId } = req.params;
  try {
    const actor = await loadActor(req);
    const user = await AdminUser.findOne({ empId: employeeId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin && actor && actor.empId !== employeeId) {
      return res.status(403).json({ message: 'You can only remove your own leave requests.' });
    }

    const removed = user.leaves.id(leaveId);
    user.leaves = user.leaves.filter((l) => l._id.toString() !== leaveId);
    await user.save();

    await logRosterEvent({
      action: 'LEAVE_REMOVED',
      actor,
      target: user,
      summary: `Leave removed for ${user.name} (${user.empId})`,
      metadata: { leaveId, removed },
    });

    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.updateKpi = async (req, res) => {
  try {
    const { empId, kpiId } = req.params;
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    const config = await AdminConfig.findOne();
    const isAdmin = req.user?.role === 'admin';
    const globalAllowed = config?.globalKpiEditingAllowed !== false;
    if (!isAdmin && (!globalAllowed || !user.kpiEditingAllowed))
      return res.status(403).json({ message: 'KPI editing is locked.' });
    const kpi = user.kpis.id(kpiId);
    if (!kpi) return res.status(404).json({ message: 'KPI not found' });
    if (!isAdmin && kpi.locked)
      return res.status(403).json({ message: 'This KPI is locked by admin.' });
    const { progress, title, description, locked, visible, targetDate } = req.body;
    if (progress !== undefined) kpi.progress = progress;
    if (isAdmin) {
      if (title       !== undefined) kpi.title       = title;
      if (description !== undefined) kpi.description = description;
      if (locked      !== undefined) kpi.locked      = locked;
      if (visible     !== undefined) kpi.visible     = visible;
      if (targetDate  !== undefined) kpi.targetDate  = targetDate;
    }
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.addKpi = async (req, res) => {
  try {
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    user.kpis.push(req.body);
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.deleteKpi = async (req, res) => {
  try {
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    user.kpis = user.kpis.filter((k) => k._id.toString() !== req.params.kpiId);
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.patchCompensateBalance = async (req, res) => {
  try {
    const { empId } = req.params;
    const bal = req.body?.balance;
    if (bal === undefined || Number.isNaN(Number(bal))) {
      return res.status(400).json({ message: 'Numeric balance is required.' });
    }
    const target = await AdminUser.findOne({ empId });
    if (!target) return res.status(404).json({ message: 'Personnel not found' });
    if (!canEditCompensateBalance(req, target)) {
      return res.status(403).json({ message: 'Not allowed to edit compensate balance for this employee.' });
    }
    const prev = target.compensateDayBalance ?? 0;
    target.compensateDayBalance = Number(bal);
    await target.save();
    const actor = await loadActor(req);
    await logRosterEvent({
      action: 'COMPENSATE_BALANCE_SET',
      actor,
      target,
      summary: `Compensate balance for ${target.name} (${empId}): ${prev} → ${target.compensateDayBalance}`,
      metadata: { previous: prev, next: target.compensateDayBalance },
    });
    res.json(target);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.exportIcs = async (req, res) => {
  try {
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const config = await AdminConfig.findOne();
    const baseDate = config?.shiftCycleBaseDate || '2026-01-01';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endDate = new Date(today); endDate.setDate(endDate.getDate() + 90);
    const pad = (n) => String(n).padStart(2, '0');

    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QIPP Ops//EN',
      `X-WR-CALNAME:${user.name} Shift Schedule`, 'CALSCALE:GREGORIAN',
    ];

    const padDate = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
    const startStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
    const overrideDocs = await ShiftOverride.find({
      empId: user.empId,
      date: { $gte: startStr, $lte: endStr },
    }).lean();
    const overrideByDate = Object.fromEntries(overrideDocs.map((o) => [o.date, o.shift]));

    let d = new Date(today);
    while (d <= endDate) {
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const shift = overrideByDate[dateStr] || getShiftForDate(user.crew, dateStr, baseDate);

      if (shift !== 'O') {
        const ds = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        const dsNext = `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`;

        lines.push(
          'BEGIN:VEVENT',
          `DTSTART;TZID=Asia/Riyadh:${ds}T${shift === 'D' ? '053000' : '173000'}`,
          `DTEND;TZID=Asia/Riyadh:${shift === 'D' ? ds + 'T173000' : dsNext + 'T053000'}`,
          `SUMMARY:${shift === 'D' ? 'Day' : 'Night'} Shift - Crew ${user.crew}`,
          `UID:shift-${user.empId}-${ds}@qipp`,
          'END:VEVENT'
        );
      }
      d.setDate(d.getDate() + 1);
    }

    user.leaves.forEach((lv, i) => {
      const s = new Date(lv.start); const e = new Date(lv.end);
      e.setDate(e.getDate() + 1);
      const fmt = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
      lines.push(
        'BEGIN:VEVENT',
        `DTSTART;VALUE=DATE:${fmt(s)}`,
        `DTEND;VALUE=DATE:${fmt(e)}`,
        `SUMMARY:${lv.type}`,
        `UID:leave-${user.empId}-${i}@qipp`,
        'END:VEVENT'
      );
    });

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${user.name.replace(/\s+/g, '_')}.ics"`);
    res.send(lines.join('\r\n'));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
