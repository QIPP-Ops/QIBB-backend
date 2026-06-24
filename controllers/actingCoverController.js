const ActingAssignment = require('../models/ActingAssignment');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const { logRosterEvent } = require('../services/rosterAuditService');
const { logAction } = require('../services/auditLogService');
const { createLeavePushNotification } = require('../services/notificationService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { sendMail, emailTemplate, isEmailConfigured } = require('../services/emailService');
const {
  emailCallout,
  emailCtaButton,
  emailDetailTable,
} = require('../services/emailHtmlHelpers');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { isGeneralCrew } = require('../utils/rosterRowSort');
const {
  ROLE_LABELS,
  crewsMatch,
  resolveAbsentRole,
  roleSlugFromLabel,
  assignmentsForRange,
  assignmentRoleLabel,
  delegationStatus,
  isApprovedDelegation,
} = require('../services/actingCoverService');
const { assertRolesMatchForCover } = require('../utils/roleCoverMatch');
const { buildCoverSuggestions } = require('../services/coverSuggestionsService');

async function loadActor(req) {
  if (!req.user?.id) return null;
  return AdminUser.findById(req.user.id).select('-passwordHash');
}

function parseDateOnly(str) {
  const d = new Date(String(str).slice(0, 10));
  d.setHours(0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function fmtDate(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function assertCrewAccess(req, actor, crew) {
  if (isSuperAdmin(req)) return null;
  if (!hasPortalAdminAccess(req)) {
    return 'Only administrators may manage leave delegations for other crews.';
  }
  const actorCrew = String(actor?.crew || '').trim();
  if (!crewsMatch(actorCrew, crew)) {
    return 'Crew administrators may only manage delegations for their own crew.';
  }
  return null;
}

function canRequestDelegation(req, actor, absentEmpId) {
  if (hasPortalAdminAccess(req)) return true;
  return Boolean(actor?.empId && actor.empId === absentEmpId);
}

async function populateDelegation(doc, employeeMap) {
  const absent = employeeMap?.get(doc.absentEmpId);
  const cover = employeeMap?.get(doc.coverEmpId);
  return {
    ...doc,
    absentName: absent?.name || doc.absentEmpId,
    coverName: cover?.name || doc.coverEmpId,
    roleLabel: assignmentRoleLabel(doc),
    status: delegationStatus(doc),
  };
}

async function loadEmployeeMap(empIds) {
  const ids = [...new Set(empIds.filter(Boolean))];
  const employees = await AdminUser.find({ empId: { $in: ids } })
    .select('empId name crew role email')
    .lean();
  return new Map(employees.map((e) => [e.empId, e]));
}

async function notifyDelegatePending({ delegate, absent, actor, doc }) {
  const email = String(delegate?.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return;
  const html = emailTemplate(
    'Cover request pending your approval',
    `
      ${emailCallout(`<p>Hi <strong>${delegate.name || delegate.empId}</strong>,</p><p>${absent?.name || doc.absentEmpId} asked you to cover their duties while they are on leave.</p>`)}
      ${emailDetailTable([
        { label: 'Role', value: assignmentRoleLabel(doc) },
        { label: 'Crew', value: doc.crew },
        { label: 'Period', value: `${doc.startDate} → ${doc.endDate}` },
        { label: 'Requested by', value: actor?.name || 'Colleague' },
        { label: 'Notes', value: doc.notes || '—' },
      ])}
      ${emailCtaButton(`${getFrontendBaseUrl()}/personnel`, 'Review in My Work')}
    `
  );
  await sendMail({
    to: email,
    subject: `QIPP cover request — ${absent?.name || doc.absentEmpId}`,
    html,
  });
}

async function notifyAbsentDelegationResponse({ absent, delegate, doc, approved }) {
  const email = String(absent?.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return;
  const html = emailTemplate(
    approved ? 'Cover request approved' : 'Cover request declined',
    `
      ${emailCallout(
        `<p>Hi <strong>${absent.name || absent.empId}</strong>,</p><p>${delegate?.name || doc.coverEmpId} has <strong>${approved ? 'approved' : 'declined'}</strong> your cover request.</p>`,
        approved ? 'success' : 'warning'
      )}
      ${emailDetailTable([
        { label: 'Role', value: assignmentRoleLabel(doc) },
        { label: 'Period', value: `${doc.startDate} → ${doc.endDate}` },
      ])}
      ${emailCtaButton(`${getFrontendBaseUrl()}/calendar`, 'Open leave timesheet')}
    `
  );
  await sendMail({
    to: email,
    subject: `QIPP cover request ${approved ? 'approved' : 'declined'}`,
    html,
  });
}

async function createDelegationRecord({
  req,
  actor,
  absent,
  cover,
  crew,
  startDate,
  endDate,
  leaveId,
  notes,
  allowOverlapReplace = false,
}) {
  const roleAtTime = String(absent.role || '').trim();
  const roleKey = resolveAbsentRole(roleAtTime) || roleSlugFromLabel(roleAtTime);

  const overlapFilter = {
    absentEmpId: absent.empId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  const overlap = await ActingAssignment.findOne(overlapFilter);
  if (overlap && !allowOverlapReplace) {
    const err = new Error('A delegation request already exists for this employee and period.');
    err.status = 409;
    throw err;
  }
  if (overlap && allowOverlapReplace) {
    overlap.status = 'cancelled';
    overlap.respondedAt = new Date();
    await overlap.save();
  }

  const doc = await ActingAssignment.create({
    absentEmpId: absent.empId,
    coverEmpId: cover.empId,
    role: roleKey,
    roleAtTime,
    crew: String(crew).trim(),
    startDate,
    endDate,
    leaveId: leaveId || null,
    status: 'pending',
    requestedBy: req.user?.id || null,
    requestedAt: new Date(),
    createdBy: req.user?.id || null,
    notes: String(notes || '').trim(),
  });

  await logRosterEvent({
    action: 'DELEGATION_REQUESTED',
    actor,
    target: absent,
    summary: `${actor?.name || absent.name} requested ${cover.name} to cover ${absent.name} (${roleAtTime || roleKey}) ${startDate} – ${endDate}`,
    metadata: {
      absentEmpId: absent.empId,
      coverEmpId: cover.empId,
      role: roleKey,
      roleAtTime,
      crew,
      startDate,
      endDate,
      leaveId: leaveId || null,
    },
  });
  await logAction({
    actor,
    action: AUDIT_ACTIONS.DELEGATION_REQUESTED,
    targetType: 'employee',
    targetId: absent.empId,
    targetName: absent.name,
    after: doc.toObject ? doc.toObject() : doc,
    req,
  });

  try {
    await notifyDelegatePending({ delegate: cover, absent, actor, doc });
  } catch (err) {
    console.warn('[delegation] delegate notify failed:', err.message);
  }

  try {
    await createLeavePushNotification(
      cover.empId,
      'delegation_request',
      `${absent?.name || absent.empId} asked you to cover ${roleAtTime || roleKey} duties (${startDate} → ${endDate}).`,
      leaveId || ''
    );
  } catch (err) {
    console.warn('[delegation] push notify failed:', err.message);
  }

  return doc;
}

exports.createDelegation = exports.createActingCover = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const {
      absentEmpId,
      coverEmpId,
      delegateEmpId,
      crew,
      startDate,
      endDate,
      leaveId,
      notes,
    } = req.body || {};
    const delegateId = coverEmpId || delegateEmpId;

    if (!absentEmpId || !delegateId || !crew || !startDate || !endDate) {
      return res.status(400).json({
        message: 'absentEmpId, coverEmpId (or delegateEmpId), crew, startDate, and endDate are required.',
      });
    }

    if (!canRequestDelegation(req, actor, absentEmpId)) {
      return res.status(403).json({
        message: 'You may only request cover for yourself unless you are an administrator.',
      });
    }

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end || end < start) {
      return res.status(400).json({ message: 'Invalid startDate or endDate.' });
    }

    if (hasPortalAdminAccess(req) && actor?.empId !== absentEmpId) {
      const accessErr = assertCrewAccess(req, actor, crew);
      if (accessErr) return res.status(403).json({ message: accessErr });
    }

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: delegateId }).select('-passwordHash'),
    ]);
    if (!absent) return res.status(404).json({ message: 'Absent employee not found.' });
    if (!cover) return res.status(404).json({ message: 'Delegate not found.' });

    if (!crewsMatch(absent.crew, crew)) {
      return res.status(400).json({ message: 'Absent employee must belong to the specified crew.' });
    }
    if (!crewsMatch(cover.crew, crew)) {
      return res.status(400).json({ message: 'Delegate must belong to the same crew.' });
    }
    if (absentEmpId === delegateId) {
      return res.status(400).json({ message: 'Delegate cannot be the same as the absent employee.' });
    }

    try {
      assertRolesMatchForCover(absent.role, cover.role);
    } catch (roleErr) {
      return res.status(roleErr.status || 400).json({ message: roleErr.message });
    }

    const doc = await createDelegationRecord({
      req,
      actor,
      absent,
      cover,
      crew,
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      leaveId,
      notes,
    });

    const populated = await populateDelegation(doc.toObject(), await loadEmployeeMap([absentEmpId, delegateId]));
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

exports.createDelegationForLeave = createDelegationRecord;

exports.listActingCover = exports.listDelegations = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const actor = await loadActor(req);
    const { crew, start, end, status, delegateEmpId, absentEmpId } = req.query;
    const filter = {};

    if (crew) filter.crew = String(crew).trim();
    if (status) filter.status = String(status).trim();
    if (delegateEmpId) filter.coverEmpId = String(delegateEmpId).trim();
    if (absentEmpId) filter.absentEmpId = String(absentEmpId).trim();

    if (start || end) {
      const startStr = start ? fmtDate(parseDateOnly(start) || new Date()) : '1970-01-01';
      const endStr = end ? fmtDate(parseDateOnly(end) || new Date()) : '2099-12-31';
      filter.startDate = { $lte: endStr };
      filter.endDate = { $gte: startStr };
    }

    const isAdmin = isSuperAdmin(req) || hasPortalAdminAccess(req);
    if (!isAdmin) {
      if (!actor?.empId) {
        return res.status(403).json({ message: 'Employee session is incomplete.' });
      }
      filter.$or = [{ coverEmpId: actor.empId }, { absentEmpId: actor.empId }];
    } else if (!isSuperAdmin(req)) {
      if (!actor?.crew) {
        return res.status(403).json({ message: 'Crew administrators must belong to a crew.' });
      }
      if (crew && !crewsMatch(actor.crew, crew)) {
        return res.status(403).json({ message: 'You may only list delegations for your own crew.' });
      }
      if (!crew) {
        filter.crew = String(actor.crew).trim();
      }
    }

    const docs = await ActingAssignment.find(filter).sort({ startDate: -1 }).lean();
    const empIds = docs.flatMap((d) => [d.absentEmpId, d.coverEmpId]);
    const byId = await loadEmployeeMap(empIds);
    const data = await Promise.all(docs.map((d) => populateDelegation(d, byId)));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDelegationInbox = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor?.empId) {
      return res.status(400).json({ message: 'Employee session is incomplete.' });
    }
    const docs = await ActingAssignment.find({
      coverEmpId: actor.empId,
      status: 'pending',
    })
      .sort({ requestedAt: 1 })
      .lean();
    const byId = await loadEmployeeMap(docs.flatMap((d) => [d.absentEmpId, d.coverEmpId]));
    const data = await Promise.all(docs.map((d) => populateDelegation(d, byId)));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveDelegation = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const doc = await ActingAssignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Delegation request not found.' });
    if (doc.status !== 'pending') {
      return res.status(400).json({ message: `Delegation is already ${doc.status}.` });
    }
    if (actor?.empId !== doc.coverEmpId && !isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the designated delegate may approve this request.' });
    }

    doc.status = 'approved';
    doc.respondedAt = new Date();
    await doc.save();

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: doc.absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: doc.coverEmpId }).select('-passwordHash'),
    ]);

    await logRosterEvent({
      action: 'DELEGATION_APPROVED',
      actor,
      target: absent || { empId: doc.absentEmpId },
      summary: `${cover?.name || doc.coverEmpId} approved cover for ${absent?.name || doc.absentEmpId} (${doc.startDate} – ${doc.endDate})`,
      metadata: { delegationId: String(doc._id) },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.DELEGATION_APPROVED,
      targetType: 'employee',
      targetId: doc.absentEmpId,
      targetName: absent?.name || doc.absentEmpId,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });

    if (absent) {
      try {
        await notifyAbsentDelegationResponse({ absent, delegate: cover, doc, approved: true });
      } catch (err) {
        console.warn('[delegation] absent notify failed:', err.message);
      }
      try {
        await createLeavePushNotification(
          absent.empId,
          'delegation_approved',
          `${cover?.name || doc.coverEmpId} approved your cover request (${doc.startDate} → ${doc.endDate}).`,
          doc.leaveId || ''
        );
      } catch (err) {
        console.warn('[delegation] push notify failed:', err.message);
      }
    }

    const populated = await populateDelegation(
      doc.toObject(),
      await loadEmployeeMap([doc.absentEmpId, doc.coverEmpId])
    );
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.declineDelegation = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const doc = await ActingAssignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Delegation request not found.' });
    if (doc.status !== 'pending') {
      return res.status(400).json({ message: `Delegation is already ${doc.status}.` });
    }
    if (actor?.empId !== doc.coverEmpId && !isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the designated delegate may decline this request.' });
    }

    doc.status = 'declined';
    doc.respondedAt = new Date();
    await doc.save();

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: doc.absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: doc.coverEmpId }).select('-passwordHash'),
    ]);

    await logRosterEvent({
      action: 'DELEGATION_DECLINED',
      actor,
      target: absent || { empId: doc.absentEmpId },
      summary: `${cover?.name || doc.coverEmpId} declined cover for ${absent?.name || doc.absentEmpId}`,
      metadata: { delegationId: String(doc._id) },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.DELEGATION_DECLINED,
      targetType: 'employee',
      targetId: doc.absentEmpId,
      targetName: absent?.name || doc.absentEmpId,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });

    if (absent) {
      try {
        await notifyAbsentDelegationResponse({ absent, delegate: cover, doc, approved: false });
      } catch (err) {
        console.warn('[delegation] absent notify failed:', err.message);
      }
      try {
        await createLeavePushNotification(
          absent.empId,
          'delegation_declined',
          `${cover?.name || doc.coverEmpId} declined your cover request (${doc.startDate} → ${doc.endDate}).`,
          doc.leaveId || ''
        );
      } catch (err) {
        console.warn('[delegation] push notify failed:', err.message);
      }
    }

    const populated = await populateDelegation(
      doc.toObject(),
      await loadEmployeeMap([doc.absentEmpId, doc.coverEmpId])
    );
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.patchDelegation = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const doc = await ActingAssignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Delegation request not found.' });

    if (!hasPortalAdminAccess(req) && !isSuperAdmin(req)) {
      return res.status(403).json({
        message: 'Only administrators may update cover assignments.',
      });
    }

    const accessErr = isSuperAdmin(req) ? null : assertCrewAccess(req, actor, doc.crew);
    if (accessErr) return res.status(403).json({ message: accessErr });

    const { coverEmpId, delegateEmpId, startDate, endDate, notes, status } = req.body || {};
    const before = doc.toObject ? doc.toObject() : { ...doc };

    if (status === 'cancelled') {
      if (isApprovedDelegation(doc)) {
        await doc.deleteOne();
      } else {
        doc.status = 'cancelled';
        doc.respondedAt = new Date();
        await doc.save();
      }
      await logAction({
        actor,
        action: AUDIT_ACTIONS.DELEGATION_CANCELLED,
        targetType: 'employee',
        targetId: doc.absentEmpId,
        targetName: before.absentEmpId,
        before,
        after: null,
        req,
      });
      return res.json({ success: true, message: 'Cover assignment cancelled.' });
    }

    const nextCoverId = coverEmpId || delegateEmpId;
    if (nextCoverId && nextCoverId !== doc.coverEmpId) {
      const [absent, cover] = await Promise.all([
        AdminUser.findOne({ empId: doc.absentEmpId }).select('-passwordHash'),
        AdminUser.findOne({ empId: nextCoverId }).select('-passwordHash'),
      ]);
      if (!absent) return res.status(404).json({ message: 'Absent employee not found.' });
      if (!cover) return res.status(404).json({ message: 'Cover person not found.' });
      try {
        assertRolesMatchForCover(absent.role, cover.role);
      } catch (roleErr) {
        return res.status(roleErr.status || 400).json({ message: roleErr.message });
      }
      doc.coverEmpId = nextCoverId;
      doc.coverFromCrew = String(cover.crew || '').trim();
    }

    if (startDate) {
      const start = parseDateOnly(startDate);
      if (!start) return res.status(400).json({ message: 'Invalid startDate.' });
      doc.startDate = fmtDate(start);
    }
    if (endDate) {
      const end = parseDateOnly(endDate);
      if (!end) return res.status(400).json({ message: 'Invalid endDate.' });
      doc.endDate = fmtDate(end);
    }
    if (doc.endDate < doc.startDate) {
      return res.status(400).json({ message: 'endDate must be on or after startDate.' });
    }
    if (notes !== undefined) {
      doc.notes = String(notes || '').trim();
    }

    await doc.save();

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: doc.absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: doc.coverEmpId }).select('-passwordHash'),
    ]);

    await logRosterEvent({
      action: 'DELEGATION_UPDATED',
      actor,
      target: absent || { empId: doc.absentEmpId },
      summary: `${actor?.name || 'Admin'} updated cover for ${absent?.name || doc.absentEmpId} → ${cover?.name || doc.coverEmpId} (${doc.startDate} – ${doc.endDate})`,
      metadata: { delegationId: String(doc._id) },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.DELEGATION_UPDATED,
      targetType: 'employee',
      targetId: doc.absentEmpId,
      targetName: absent?.name || doc.absentEmpId,
      before,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });

    const populated = await populateDelegation(
      doc.toObject(),
      await loadEmployeeMap([doc.absentEmpId, doc.coverEmpId])
    );
    res.json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

exports.deleteActingCover = exports.cancelDelegation = async (req, res) => {
  try {
    const actor = await loadActor(req);
    const doc = await ActingAssignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Delegation request not found.' });

    const isOwner = actor?.empId === doc.absentEmpId || actor?.empId === doc.coverEmpId;
    if (!hasPortalAdminAccess(req) && !isOwner && !isSuperAdmin(req)) {
      return res.status(403).json({ message: 'You may not cancel this delegation.' });
    }

    const accessErr = hasPortalAdminAccess(req) ? assertCrewAccess(req, actor, doc.crew) : null;
    if (accessErr) return res.status(403).json({ message: accessErr });

    const wasApproved = isApprovedDelegation(doc);

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: doc.absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: doc.coverEmpId }).select('-passwordHash'),
    ]);

    if (wasApproved) {
      await doc.deleteOne();
      await logAction({
        actor,
        action: AUDIT_ACTIONS.ACTING_COVER_DELETED,
        targetType: 'employee',
        targetId: doc.absentEmpId,
        targetName: absent?.name || doc.absentEmpId,
        before: doc.toObject ? doc.toObject() : { ...doc },
        after: null,
        req,
      });
    } else {
      doc.status = 'cancelled';
      doc.respondedAt = new Date();
      await doc.save();
      await logAction({
        actor,
        action: AUDIT_ACTIONS.DELEGATION_CANCELLED,
        targetType: 'employee',
        targetId: doc.absentEmpId,
        targetName: absent?.name || doc.absentEmpId,
        before: doc.toObject ? doc.toObject() : { ...doc },
        after: null,
        req,
      });
    }

    await logRosterEvent({
      action: wasApproved ? 'ACTING_COVER_CLEARED' : 'DELEGATION_CANCELLED',
      actor,
      target: absent || { empId: doc.absentEmpId, name: doc.absentEmpId },
      summary: `${actor?.name || 'User'} cancelled cover for ${absent?.name || doc.absentEmpId}`,
      metadata: { coverName: cover?.name },
    });

    res.json({ success: true, message: 'Delegation cancelled.' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.assignmentsForRange = assignmentsForRange;

async function createApprovedConflictDelegation({
  req,
  actor,
  absent,
  cover,
  crew,
  startDate,
  endDate,
  conflictKey,
  notes,
}) {
  const roleAtTime = String(absent.role || '').trim();
  const roleKey = resolveAbsentRole(roleAtTime) || roleSlugFromLabel(roleAtTime);
  const coverFromCrew = String(cover.crew || '').trim();

  const overlapFilter = {
    absentEmpId: absent.empId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };
  const overlap = await ActingAssignment.findOne(overlapFilter);
  if (overlap) {
    overlap.status = 'cancelled';
    overlap.respondedAt = new Date();
    await overlap.save();
  }

  const now = new Date();
  const doc = await ActingAssignment.create({
    absentEmpId: absent.empId,
    coverEmpId: cover.empId,
    role: roleKey,
    roleAtTime,
    crew: String(crew).trim(),
    coverFromCrew,
    startDate,
    endDate,
    leaveId: null,
    conflictKey: String(conflictKey || '').trim(),
    source: 'conflict_resolution',
    status: 'approved',
    requestedBy: req.user?.id || null,
    requestedAt: now,
    respondedAt: now,
    createdBy: req.user?.id || null,
    notes: String(notes || '').trim(),
  });

  const crossCrewNote = crewsMatch(coverFromCrew, crew)
    ? ''
    : ` (cross-crew from ${coverFromCrew})`;

  await logRosterEvent({
    action: 'CONFLICT_DELEGATION_RESOLVED',
    actor,
    target: absent,
    summary: `${actor?.name || 'Admin'} assigned ${cover.name} to cover ${absent.name} for crew ${crew} ${startDate} – ${endDate}${crossCrewNote}`,
    metadata: {
      absentEmpId: absent.empId,
      coverEmpId: cover.empId,
      crew,
      coverFromCrew,
      startDate,
      endDate,
      conflictKey: conflictKey || '',
      delegationId: String(doc._id),
    },
  });
  await logAction({
    actor,
    action: AUDIT_ACTIONS.CONFLICT_DELEGATION_RESOLVED,
    targetType: 'employee',
    targetId: absent.empId,
    targetName: absent.name,
    after: doc.toObject ? doc.toObject() : doc,
    req,
  });

  return doc;
}

exports.resolveConflictDelegation = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({
        message: 'Only portal administrators may resolve schedule conflicts by delegation.',
      });
    }

    const actor = await loadActor(req);
    const {
      absentEmpId,
      coverEmpId,
      delegateEmpId,
      crew,
      startDate,
      endDate,
      conflictKey,
      notes,
    } = req.body || {};
    const delegateId = coverEmpId || delegateEmpId;

    if (!absentEmpId || !delegateId || !crew || !startDate || !endDate) {
      return res.status(400).json({
        message: 'absentEmpId, coverEmpId, crew, startDate, and endDate are required.',
      });
    }

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end || end < start) {
      return res.status(400).json({ message: 'Invalid startDate or endDate.' });
    }

    const accessErr = assertCrewAccess(req, actor, crew);
    if (accessErr) return res.status(403).json({ message: accessErr });

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: delegateId }).select('-passwordHash'),
    ]);
    if (!absent) return res.status(404).json({ message: 'Absent employee not found.' });
    if (!cover) return res.status(404).json({ message: 'Delegate not found.' });

    if (isGeneralCrew(absent.crew) || isGeneralCrew(crew)) {
      return res.status(400).json({
        message: 'General crew members are not included in schedule conflict rules.',
      });
    }

    if (!crewsMatch(absent.crew, crew)) {
      return res.status(400).json({ message: 'Absent employee must belong to the specified crew.' });
    }
    if (absentEmpId === delegateId) {
      return res.status(400).json({ message: 'Delegate cannot be the same as the absent employee.' });
    }

    try {
      assertRolesMatchForCover(absent.role, cover.role);
    } catch (roleErr) {
      return res.status(roleErr.status || 400).json({ message: roleErr.message });
    }

    const doc = await createApprovedConflictDelegation({
      req,
      actor,
      absent,
      cover,
      crew,
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      conflictKey,
      notes,
    });

    const populated = await populateDelegation(
      doc.toObject(),
      await loadEmployeeMap([absentEmpId, delegateId])
    );
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

function dateInLeaveRange(dateStr, leave) {
  const d = String(dateStr).slice(0, 10);
  const start = leave?.start ? fmtDate(leave.start) : '';
  const end = leave?.end ? fmtDate(leave.end) : '';
  return start && end && d >= start && d <= end;
}

const { resolveEmployeeShift } = require('../services/shiftScheduleService');
const { normalizeLeaveType, isAnnualLeaveType } = require('../constants/leaveTypes');

exports.getCoverSuggestions = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        message: 'Only the designated super administrator may view cover suggestions.',
      });
    }

    const dateStr = String(req.query.date || '').slice(0, 10);
    const crew = String(req.query.crew || '').trim();
    const role = String(req.query.role || '').trim();
    const shift = req.query.shift ? String(req.query.shift).trim().toUpperCase() : undefined;

    if (!dateStr || !crew || !role) {
      return res.status(400).json({ message: 'date, crew, and role query parameters are required.' });
    }

    const AdminConfig = require('../models/AdminConfig');
    const ActingAssignment = require('../models/ActingAssignment');
    const { loadStaffingRosterEmployees } = require('../utils/rosterEmployeeLoad');
    const config = await AdminConfig.findOne().select('shiftCycleBaseDate').lean();
    const baseDate = config?.shiftCycleBaseDate || '2026-01-01';

    const employees = await loadStaffingRosterEmployees();

    const actingAssignments = await ActingAssignment.find({
      status: 'approved',
      startDate: { $lte: dateStr },
      endDate: { $gte: dateStr },
    }).lean();

    const { candidates, meta } = buildCoverSuggestions(employees, {
      date: dateStr,
      crew,
      role,
      shift,
      baseDate,
      actingAssignments,
    });

    if (meta?.error) {
      return res.status(400).json({ message: meta.error });
    }

    res.json({ success: true, data: candidates, meta });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.postCoverSuggestionsBatch = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        message: 'Only the designated super administrator may view cover suggestions.',
      });
    }

    const queries = Array.isArray(req.body?.queries) ? req.body.queries : [];
    if (!queries.length) {
      return res.status(400).json({ message: 'queries array is required.' });
    }

    const AdminConfig = require('../models/AdminConfig');
    const ActingAssignment = require('../models/ActingAssignment');
    const { loadStaffingRosterEmployees } = require('../utils/rosterEmployeeLoad');
    const config = await AdminConfig.findOne().select('shiftCycleBaseDate').lean();
    const baseDate = config?.shiftCycleBaseDate || '2026-01-01';

    const employees = await loadStaffingRosterEmployees();

    const results = [];
    for (const q of queries.slice(0, 20)) {
      const dateStr = String(q.date || '').slice(0, 10);
      const crew = String(q.crew || '').trim();
      const role = String(q.role || '').trim();
      const shift = q.shift ? String(q.shift).trim().toUpperCase() : undefined;

      const actingAssignments = await ActingAssignment.find({
        status: 'approved',
        startDate: { $lte: dateStr },
        endDate: { $gte: dateStr },
      }).lean();

      const { candidates, meta } = buildCoverSuggestions(employees, {
        date: dateStr,
        crew,
        role,
        shift,
        baseDate,
        actingAssignments,
      });

      results.push({ query: { date: dateStr, crew, role, shift }, candidates, meta });
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOrgOverlay = async (req, res) => {
  try {
    const dateStr = String(req.query.date || fmtDate()).slice(0, 10);
    const crew = String(req.query.crew || '').trim();

    const AdminConfig = require('../models/AdminConfig');
    const config = await AdminConfig.findOne().select('shiftCycleBaseDate').lean();
    const baseDate = config?.shiftCycleBaseDate || '2026-01-01';

    const userFilter = crew ? { crew } : {};
    const employees = await AdminUser.find(userFilter)
      .select('empId name crew role leaves')
      .lean();

    const onLeave = [];
    for (const emp of employees) {
      const shift = resolveEmployeeShift(emp, dateStr, { baseDate });
      if (!shift.onLeave) continue;
      const leaveType = normalizeLeaveType(shift.leaveType || 'Planned');
      onLeave.push({
        empId: emp.empId,
        name: emp.name,
        leaveType,
        isAnnualLeave: isAnnualLeaveType(leaveType),
        isBankLeave: leaveType === 'Bank Leave',
        isPlannedLeave: leaveType === 'Planned',
        start: (emp.leaves || []).find((lv) => dateInLeaveRange(dateStr, lv))?.start,
        end: (emp.leaves || []).find((lv) => dateInLeaveRange(dateStr, lv))?.end,
      });
    }

    const delegationFilter = {
      status: 'approved',
      startDate: { $lte: dateStr },
      endDate: { $gte: dateStr },
    };
    if (crew) delegationFilter.crew = crew;

    const delegations = await ActingAssignment.find(delegationFilter).lean();
    const empIds = [
      ...new Set(delegations.flatMap((d) => [d.absentEmpId, d.coverEmpId]).filter(Boolean)),
    ];
    const employeeMap = await loadEmployeeMap(empIds);

    const overlays = delegations.map((d) => ({
      absentEmpId: d.absentEmpId,
      absentName: employeeMap.get(d.absentEmpId)?.name || d.absentEmpId,
      coverEmpId: d.coverEmpId,
      coverName: employeeMap.get(d.coverEmpId)?.name || d.coverEmpId,
      roleLabel: assignmentRoleLabel(d),
      startDate: d.startDate,
      endDate: d.endDate,
    }));

    res.json({
      date: dateStr,
      crew: crew || null,
      onLeave,
      delegations: overlays,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
