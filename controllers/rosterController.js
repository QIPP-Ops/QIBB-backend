const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const { logRosterEvent } = require('../services/rosterAuditService');
const { isPlaceholderEmail, sanitizeEmailForClient, isValidEmailFormat } = require('../utils/placeholderEmail');
const { isProtectedAccountEmail, filterProtectedAccounts } = require('../utils/protectedAccounts');
const ShiftOverride = require('../models/ShiftOverride');
const { getShiftForDate, userCanAccessOpsTools } = require('../services/shiftScheduleService');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const {
  redactLeaveBalancesForClient,
  canEditCompensateBalance,
} = require('../utils/leaveBalanceAccess');
const {
  isAnnualLeaveType,
  isBankLeaveType,
  isCompensateLeaveType,
  normalizeCompensateLeaveType,
  normalizeLeaveType,
} = require('../constants/leaveTypes');
const { daysBetweenInclusive } = require('../services/leaveAccrualService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

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

function rosterRowForClient(doc) {
  const row = doc.toObject ? doc.toObject() : { ...doc };
  row.email = sanitizeEmailForClient(row.email);
  if (!row.opsGroupLabel) row.opsGroupLabel = '';
  if (!row.opsTreeParentEmpId) row.opsTreeParentEmpId = '';
  if (!row.opsTreeRelation) row.opsTreeRelation = '';
  if (!row.assignedTo) row.assignedTo = '';
  row.isERT = Boolean(row.isERT);
  row.employeeExternalId = row.employeeExternalId || '';
  return row;
}

function isLeaveTimesheetRosterRequest(req) {
  const raw = req.query.forLeaveTimesheet;
  return raw === '1' || raw === 'true';
}

exports.getRoster = async (req, res) => {
  try {
    const { sortRosterEmployees } = require('../utils/rosterRowSort');
    const rosterFilter = isLeaveTimesheetRosterRequest(req)
      ? { hiddenFromLeaveTimesheet: { $ne: true } }
      : {};
    const rows = sortRosterEmployees(
      await AdminUser.find(rosterFilter).select('-passwordHash').lean()
    );
    res.json(
      filterProtectedAccounts(rows)
        .map(rosterRowForClient)
        .map((row) => redactLeaveBalancesForClient(row, req))
    );
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.getPersonnelDirectory = async (_req, res) => {
  try {
    const { sortRosterEmployees } = require('../utils/rosterRowSort');
    const rows = sortRosterEmployees(
      await AdminUser.find()
        .select('name email empId isERT employeeExternalId crew role')
        .lean()
    );
    res.json({
      success: true,
      data: filterProtectedAccounts(rows).map((r) => ({
        name: r.name,
        email: sanitizeEmailForClient(r.email),
        empId: r.empId,
        isERT: Boolean(r.isERT),
        employeeExternalId: r.employeeExternalId || '',
        crew: r.crew,
        role: r.role,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.patchPersonnelProfile = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin only' });
    }
    const { empId } = req.params;
    const { isSuperAdmin } = require('../middleware/superAdmin');
    const superAdmin = isSuperAdmin(req);

    if (req.body?.newEmpId !== undefined) {
      if (!superAdmin) {
        return res.status(403).json({ message: 'Super admin only' });
      }
      const newEmpId = String(req.body.newEmpId || '').trim();
      if (!newEmpId) {
        return res.status(400).json({ message: 'Employee ID is required.' });
      }
      if (newEmpId !== empId) {
        const dup = await AdminUser.findOne({ empId: newEmpId });
        if (dup) return res.status(409).json({ message: 'Employee ID already in use.' });
      }
      const user = await AdminUser.findOneAndUpdate(
        { empId },
        { $set: { empId: newEmpId } },
        { new: true, runValidators: true }
      ).select('-passwordHash');
      if (!user) return res.status(404).json({ message: 'Personnel not found' });
      return res.json({ success: true, data: rosterRowForClient(user) });
    }

    const patch = {};
    if (req.body?.isERT !== undefined) patch.isERT = Boolean(req.body.isERT);
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    const user = await AdminUser.findOneAndUpdate(
      { empId },
      { $set: patch },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    res.json({ success: true, data: rosterRowForClient(user) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.addLeave = async (req, res) => {
  const {
    employeeId,
    empId,
    leave,
    start,
    end,
    type,
    workingDays,
    totalDays,
    appliedOnSap,
  } = req.body;
  const targetId = employeeId || empId;
  if (!targetId) return res.status(400).json({ message: 'employeeId (or empId) is required.' });

  try {
    const actor = await loadActor(req);
    const user = await AdminUser.findOne({ empId: targetId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const isAdmin = hasPortalAdminAccess(req);
    if (!isAdmin && actor && actor.empId !== targetId) {
      return res.status(403).json({ message: 'You can only apply leave for your own account.' });
    }

    const leaveData = leave || { start, end, type, workingDays, totalDays, appliedOnSap };
    if (!leaveData.start || !leaveData.end) {
      return res.status(400).json({ message: 'Leave start and end dates are required.' });
    }
    leaveData.start = new Date(leaveData.start);
    leaveData.end = new Date(leaveData.end);
    leaveData.appliedOnSap = leaveData.appliedOnSap === true;
    const leaveTypeStr = normalizeLeaveType(normalizeCompensateLeaveType(leaveData.type || 'Planned'));
    leaveData.type = leaveTypeStr;
    const spanDays =
      typeof leaveData.totalDays === 'number' && leaveData.totalDays > 0
        ? leaveData.totalDays
        : daysBetweenInclusive(leaveData.start, leaveData.end);

    if (isAnnualLeaveType(leaveTypeStr)) {
      const bal = user.annualLeaveBalance ?? 0;
      if (bal < spanDays) {
        return res.status(400).json({
          message: `Insufficient annual leave balance (${bal} available, ${spanDays} required).`,
        });
      }
      user.annualLeaveBalance = Math.round((bal - spanDays) * 10000) / 10000;
    }
    if (isBankLeaveType(leaveTypeStr)) {
      const bal = user.bankLeaveBalance ?? 0;
      if (bal < spanDays) {
        return res.status(400).json({
          message: `Insufficient bank leave balance (${bal} available, ${spanDays} required).`,
        });
      }
      user.bankLeaveBalance = Math.round((bal - spanDays) * 10000) / 10000;
    }

    if (isCompensateLeaveType(leaveTypeStr)) {
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
    await logAction({
      actor,
      action: AUDIT_ACTIONS.LEAVE_CREATED,
      targetType: 'leave',
      targetId: user.leaves[user.leaves.length - 1]?._id?.toString(),
      targetName: `${user.name} leave`,
      after: leaveData,
      req,
    });

    try {
      const { processLeaveSaved } = require('../services/leaveConflictService');
      const ActingAssignment = require('../models/ActingAssignment');
      const employees = await AdminUser.find().select('-passwordHash').lean();
      const savedLeave = user.leaves[user.leaves.length - 1];
      const leaveStart = new Date(savedLeave.start).toISOString().slice(0, 10);
      const leaveEnd = new Date(savedLeave.end).toISOString().slice(0, 10);
      const actingAssignments = await ActingAssignment.find({
        crew: user.crew,
        startDate: { $lte: leaveEnd },
        endDate: { $gte: leaveStart },
      }).lean();
      await processLeaveSaved(
        user.toObject ? user.toObject() : user,
        savedLeave,
        employees,
        actingAssignments
      );
    } catch (conflictErr) {
      console.warn('[leave] conflict notify skipped:', conflictErr.message);
    }

    res.status(201).json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.createEmployee = async (req, res) => {
  if (!hasPortalAdminAccess(req)) {
    return res.status(403).json({ message: 'Only administrators can add team members.' });
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
    await logAction({
      actor,
      action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
      targetType: 'employee',
      targetId: user.empId,
      targetName: user.name,
      after: user.toObject ? user.toObject() : user,
      req,
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
    const isAdmin = hasPortalAdminAccess(req);
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

    if (isAdmin && email !== undefined) {
      const trimmed = String(email).trim().toLowerCase();
      if (!trimmed) {
        return res.status(400).json({ message: 'Email is required.' });
      }
      if (!isValidEmailFormat(trimmed)) {
        return res.status(400).json({ message: 'Email must contain @ and a domain.' });
      }
      const dup = await AdminUser.findOne({ email: trimmed, empId: { $ne: req.params.empId } });
      if (dup) {
        return res.status(400).json({ message: 'Email is already in use.' });
      }
      safeBody.email = trimmed;
    }

    const existing = await AdminUser.findOne({ empId: req.params.empId }).select('-passwordHash');
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
    await logAction({
      actor,
      action: safeBody.email !== undefined ? AUDIT_ACTIONS.EMPLOYEE_EMAIL_UPDATED : AUDIT_ACTIONS.EMPLOYEE_UPDATED,
      targetType: 'employee',
      targetId: user.empId,
      targetName: user.name,
      before: existing?.toObject ? existing.toObject() : existing,
      after: user?.toObject ? user.toObject() : user,
      req,
    });
    if (safeBody.accessRole !== undefined || safeBody.role !== undefined || safeBody.crew !== undefined) {
      await logAction({
        actor,
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        targetType: 'employee',
        targetId: user.empId,
        targetName: user.name,
        before: { accessRole: existing?.accessRole, role: existing?.role, crew: existing?.crew },
        after: { accessRole: user?.accessRole, role: user?.role, crew: user?.crew },
        req,
      });
    }

    const notifyUser = req.body?.notifyUser === true;
    if (notifyUser) {
      if (!isSuperAdmin(req)) {
        return res.status(403).json({
          message: 'Only the designated super administrator may notify users about personnel changes.',
        });
      }
      const { notifyPersonnelChanges } = require('../services/personnelNotifyService');
      notifyPersonnelChanges({
        user,
        actor,
        before: existing?.toObject ? existing.toObject() : existing,
        after: user?.toObject ? user.toObject() : user,
        fields: ['crew', 'role'],
        req,
      }).catch((err) => console.warn('[personnel-notify]', err.message));
    }

    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.deleteEmployee = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Only administrators can remove personnel.' });
    }
    const actor = await loadActor(req);
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    if (isProtectedAccountEmail(user.email)) {
      return res.status(403).json({ message: 'This system account cannot be deleted.' });
    }
    await AdminUser.deleteOne({ _id: user._id });

    await logRosterEvent({
      action: 'USER_REJECTED',
      actor,
      target: user,
      summary: `Removed personnel record ${user.name} (${user.empId})`,
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.EMPLOYEE_DELETED,
      targetType: 'employee',
      targetId: user.empId,
      targetName: user.name,
      before: user.toObject ? user.toObject() : user,
      req,
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

    const isAdmin = hasPortalAdminAccess(req);
    if (!isAdmin && actor && actor.empId !== employeeId) {
      return res.status(403).json({ message: 'You can only remove your own leave requests.' });
    }

    const removed = user.leaves.id(leaveId);
    if (removed) {
      const leaveTypeStr = String(removed.type || 'Planned');
      const span =
        typeof removed.totalDays === 'number' && removed.totalDays > 0
          ? removed.totalDays
          : daysBetweenInclusive(removed.start, removed.end);
      if (isAnnualLeaveType(leaveTypeStr)) {
        user.annualLeaveBalance = Math.round(((user.annualLeaveBalance ?? 0) + span) * 10000) / 10000;
      }
      if (isBankLeaveType(leaveTypeStr)) {
        user.bankLeaveBalance = Math.round(((user.bankLeaveBalance ?? 0) + span) * 10000) / 10000;
      }
    }
    user.leaves = user.leaves.filter((l) => l._id.toString() !== leaveId);
    await user.save();

    await logRosterEvent({
      action: 'LEAVE_REMOVED',
      actor,
      target: user,
      summary: `Leave removed for ${user.name} (${user.empId})`,
      metadata: { leaveId, removed },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.LEAVE_DELETED,
      targetType: 'leave',
      targetId: leaveId,
      targetName: `${user.name} leave`,
      before: removed?.toObject ? removed.toObject() : removed,
      req,
    });

    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.updateKpi = async (req, res) => {
  try {
    const { empId, kpiId } = req.params;
    const { canEditEmployeeKpi } = require('./kpiGoalsController');
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    const config = await AdminConfig.findOne();
    const isAdmin = hasPortalAdminAccess(req);
    const isSelf = canEditEmployeeKpi(req, empId) && !isAdmin;
    const globalAllowed = config?.globalKpiEditingAllowed !== false;
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Not authorized to edit KPIs for this employee.' });
    }
    if (!isAdmin && (!globalAllowed || !user.kpiEditingAllowed))
      return res.status(403).json({ message: 'KPI editing is locked.' });
    const kpi = user.kpis.id(kpiId);
    if (!kpi) return res.status(404).json({ message: 'KPI not found' });
    if (!isAdmin && kpi.locked)
      return res.status(403).json({ message: 'This KPI is locked by admin.' });
    const { progress, title, description, locked, visible, targetDate, weight } = req.body;
    if (progress !== undefined) kpi.progress = progress;
    if (weight !== undefined) kpi.weight = Math.min(100, Math.max(0, Number(weight) || 0));
    if (isAdmin) {
      if (title       !== undefined) kpi.title       = title;
      if (description !== undefined) kpi.description = description;
      if (locked      !== undefined) kpi.locked      = locked;
      if (visible     !== undefined) kpi.visible     = visible;
      if (targetDate  !== undefined) kpi.targetDate  = targetDate;
    } else if (isSelf) {
      if (title       !== undefined) kpi.title       = title;
      if (description !== undefined) kpi.description = description;
      if (targetDate  !== undefined) kpi.targetDate  = targetDate;
    }
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.addKpi = async (req, res) => {
  try {
    const { empId } = req.params;
    const { canEditEmployeeKpi } = require('./kpiGoalsController');
    if (!canEditEmployeeKpi(req, empId)) {
      return res.status(403).json({ message: 'Not authorized to edit KPIs for this employee.' });
    }
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    const body = { ...req.body };
    if (body.weight !== undefined) body.weight = Math.min(100, Math.max(0, Number(body.weight) || 0));
    user.kpis.push(body);
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

exports.patchLeaveBalances = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        message: 'Only the designated super administrator may edit leave balances.',
      });
    }
    const { empId } = req.params;
    const target = await AdminUser.findOne({ empId });
    if (!target) return res.status(404).json({ message: 'Personnel not found' });

    const { annualLeaveBalance, bankLeaveBalance } = req.body;
    const actor = await loadActor(req);
    const prevAnnual = target.annualLeaveBalance ?? 0;
    const prevBank = target.bankLeaveBalance ?? 0;

    if (annualLeaveBalance !== undefined) {
      target.annualLeaveBalance = Number(annualLeaveBalance) || 0;
    }
    if (bankLeaveBalance !== undefined) {
      target.bankLeaveBalance = Number(bankLeaveBalance) || 0;
    }
    await target.save();

    await logRosterEvent({
      action: 'LEAVE_BALANCE_SET',
      actor,
      target,
      summary: `Leave balances for ${target.name} (${empId}): annual ${prevAnnual}→${target.annualLeaveBalance}, bank ${prevBank}→${target.bankLeaveBalance}`,
      metadata: {
        previousAnnual: prevAnnual,
        previousBank: prevBank,
        annualLeaveBalance: target.annualLeaveBalance,
        bankLeaveBalance: target.bankLeaveBalance,
      },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.LEAVE_BALANCE_EDITED,
      targetType: 'employee',
      targetId: target.empId,
      targetName: target.name,
      before: { annualLeaveBalance: prevAnnual, bankLeaveBalance: prevBank },
      after: { annualLeaveBalance: target.annualLeaveBalance, bankLeaveBalance: target.bankLeaveBalance },
      req,
    });

    res.json(target);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.patchCompensateBalance = async (req, res) => {
  try {
    if (!isCompensateLeaveType('Compensate Off')) {
      return res.status(500).json({ message: 'Compensate leave type is not configured.' });
    }
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
    await logAction({
      actor,
      action: AUDIT_ACTIONS.LEAVE_BALANCE_EDITED,
      targetType: 'employee',
      targetId: target.empId,
      targetName: target.name,
      before: { compensateDayBalance: prev },
      after: { compensateDayBalance: target.compensateDayBalance },
      req,
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

exports.patchPersonnelInline = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const superAdmin = isSuperAdmin(req);
    const portalAdmin = hasPortalAdminAccess(req);

    if (!superAdmin && !portalAdmin) {
      return res.status(403).json({
        message: 'Only administrators may edit personnel profile fields.',
      });
    }

    const { empId } = req.params;
    const editable = superAdmin
      ? ['name', 'empId', 'role', 'crew', 'opsGroupLabel', 'email', 'position']
      : ['name'];

    const patch = {};
    for (const key of editable) {
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'No editable fields provided.' });
    }

    const existing = await AdminUser.findOne({ empId }).select('-passwordHash');
    if (!existing) return res.status(404).json({ message: 'Personnel not found' });

    if (!superAdmin) {
      const actorCrew = String(actor?.crew || '').trim().toUpperCase();
      const targetCrew = String(existing.crew || '').trim().toUpperCase();
      const actorCrewNorm = actorCrew.replace(/^CREW\s*/i, '');
      const targetCrewNorm = targetCrew.replace(/^CREW\s*/i, '');
      if (!actorCrewNorm || actorCrewNorm !== targetCrewNorm) {
        return res.status(403).json({
          message: 'Crew administrators may only edit names for members of their own crew.',
        });
      }
    }

    if (patch.email !== undefined) {
      const trimmed = String(patch.email || '').trim().toLowerCase();
      if (!trimmed || !isValidEmailFormat(trimmed)) {
        return res.status(400).json({ message: 'Valid email is required.' });
      }
      patch.email = trimmed;
    }

    const user = await AdminUser.findOneAndUpdate(
      { empId },
      { $set: patch },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const nameChanged = patch.name !== undefined && patch.name !== existing.name;
    await logRosterEvent({
      action: nameChanged ? 'NAME_UPDATED' : 'PROFILE_UPDATED',
      actor,
      target: user,
      summary: `${superAdmin ? 'Super admin' : 'Crew admin'} inline-updated ${user.name} (${user.empId})`,
      metadata: { fields: Object.keys(patch), inline: true },
    });
    await logAction({
      actor,
      action: nameChanged ? AUDIT_ACTIONS.EMPLOYEE_NAME_UPDATED : AUDIT_ACTIONS.EMPLOYEE_UPDATED,
      targetType: 'employee',
      targetId: user.empId,
      targetName: user.name,
      before: existing?.toObject ? existing.toObject() : existing,
      after: user?.toObject ? user.toObject() : user,
      req,
    });

    const notifyUser = req.body?.notifyUser === true;
    if (notifyUser) {
      if (!superAdmin) {
        return res.status(403).json({
          message: 'Only the designated super administrator may notify users about personnel changes.',
        });
      }
      const { notifyPersonnelChanges } = require('../services/personnelNotifyService');
      notifyPersonnelChanges({
        user,
        actor,
        before: existing?.toObject ? existing.toObject() : existing,
        after: user?.toObject ? user.toObject() : user,
        fields: ['crew', 'role'],
        req,
      }).catch((err) => console.warn('[personnel-notify]', err.message));
    }

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
