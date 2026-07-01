const AttendanceRecord = require('../models/AttendanceRecord');
const { logAction } = require('./auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const {
  approvedLeaveOnDate,
  eachDateInRange,
  getLeaveOverlayForDate,
} = require('./shiftScheduleService');

function applyLoggedBy(doc, actor) {
  doc.loggedBy = String(actor.id || actor.email || '');
  doc.loggedByEmail = String(actor.email || '').trim().toLowerCase();
  doc.loggedAt = new Date();
}

function derivedAttendanceBody(approvedLeave) {
  return {
    status: 'absent',
    isLate: false,
    lateMinutes: 0,
    isLeftEarly: false,
    leftEarlyMinutes: 0,
    remarks: `On leave: ${approvedLeave.type || 'Leave'}`,
    derivedFromLeave: true,
  };
}

async function upsertDerivedAttendanceForDate(employee, dateStr, actor, req) {
  const approvedLeave = approvedLeaveOnDate(employee, dateStr);
  if (!approvedLeave) return null;

  const body = derivedAttendanceBody(approvedLeave);
  const existing = await AttendanceRecord.findOne({ empId: employee.empId, date: dateStr });

  if (existing) {
    if (existing.derivedFromLeave && existing.status === 'absent') {
      return existing;
    }
    const before = existing.toObject();
    Object.assign(existing, body, {
      employeeName: employee.name || '',
      crew: employee.crew || '',
    });
    applyLoggedBy(existing, actor);
    const doc = await existing.save();
    await logAction({
      actor,
      action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
      targetType: 'attendance',
      targetId: doc._id,
      targetName: `${employee.empId} ${dateStr}`,
      before,
      after: doc.toObject(),
      req,
    });
    return doc;
  }

  const doc = await AttendanceRecord.create({
    empId: employee.empId,
    date: dateStr,
    employeeName: employee.name || '',
    crew: employee.crew || '',
    ...body,
    loggedBy: String(actor.id || actor.email || ''),
    loggedByEmail: String(actor.email || '').trim().toLowerCase(),
    loggedAt: new Date(),
  });
  await logAction({
    actor,
    action: AUDIT_ACTIONS.ATTENDANCE_RECORDED,
    targetType: 'attendance',
    targetId: doc._id,
    targetName: `${employee.empId} ${dateStr}`,
    before: null,
    after: doc.toObject(),
    req,
  });
  return doc;
}

async function clearDerivedAttendanceForDate(employee, dateStr, actor, req) {
  const existing = await AttendanceRecord.findOne({ empId: employee.empId, date: dateStr });
  if (!existing?.derivedFromLeave) return null;

  if (approvedLeaveOnDate(employee, dateStr)) {
    return upsertDerivedAttendanceForDate(employee, dateStr, actor, req);
  }

  const before = existing.toObject();
  await existing.deleteOne();
  await logAction({
    actor,
    action: AUDIT_ACTIONS.ATTENDANCE_DELETED,
    targetType: 'attendance',
    targetId: existing._id,
    targetName: `${employee.empId} ${dateStr}`,
    before,
    after: null,
    req,
  });
  return null;
}

async function syncApprovedLeaveRange(employee, startStr, endStr, actor, req) {
  const dates = [];
  eachDateInRange(startStr, endStr, (dateStr) => dates.push(dateStr));
  const results = [];
  for (const dateStr of dates) {
    const doc = await upsertDerivedAttendanceForDate(employee, dateStr, actor, req);
    if (doc) results.push(doc);
  }
  return results;
}

async function reconcileLeaveAttendanceRange(employee, startStr, endStr, actor, req) {
  const dates = [];
  eachDateInRange(startStr, endStr, (dateStr) => dates.push(dateStr));
  for (const dateStr of dates) {
    if (approvedLeaveOnDate(employee, dateStr)) {
      await upsertDerivedAttendanceForDate(employee, dateStr, actor, req);
    } else {
      await clearDerivedAttendanceForDate(employee, dateStr, actor, req);
    }
  }
}

function applyLeaveDerivedAttendance(employee, date, normalized, existing, req, isSuperAdminUser) {
  const approvedLeave = approvedLeaveOnDate(employee, date);
  if (!approvedLeave) return normalized;

  // Super admin may set any attendance status on leave days (past, present, or future).
  if (isSuperAdminUser(req)) {
    return normalized;
  }

  if (existing?.derivedFromLeave && normalized.status !== 'absent') {
    const err = new Error('Attendance is derived from approved leave and cannot be overridden.');
    err.status = 409;
    throw err;
  }

  return {
    ...normalized,
    status: 'absent',
    isLate: false,
    lateMinutes: 0,
    isLeftEarly: false,
    leftEarlyMinutes: 0,
    remarks:
      normalized.remarks ||
      `On leave: ${approvedLeave.type || 'Leave'}`,
  };
}

/** True when absent status is auto-derived from approved leave (not a super-admin override). */
function resolveDerivedFromLeave(employee, date, body, req, isSuperAdminUser) {
  const approvedLeave = approvedLeaveOnDate(employee, date);
  if (!approvedLeave) return false;
  if (body.status !== 'absent') return false;
  if (isSuperAdminUser(req)) return false;
  return true;
}

function enrichAttendanceRecord(record, employee) {
  if (!employee) return record;
  const overlay = getLeaveOverlayForDate(employee, record.date);
  if (!overlay.onLeave) {
    return { ...record, onLeave: false };
  }
  return {
    ...record,
    ...overlay,
    derivedFromLeave: Boolean(record.derivedFromLeave) || overlay.derivedFromLeave,
  };
}

module.exports = {
  applyLeaveDerivedAttendance,
  resolveDerivedFromLeave,
  enrichAttendanceRecord,
  syncApprovedLeaveRange,
  reconcileLeaveAttendanceRange,
  upsertDerivedAttendanceForDate,
  clearDerivedAttendanceForDate,
};
