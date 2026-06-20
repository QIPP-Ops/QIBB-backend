const ActingAssignment = require('../models/ActingAssignment');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const { logRosterEvent } = require('../services/rosterAuditService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const {
  ROLE_LABELS,
  crewsMatch,
  resolveAbsentRole,
  isCoverEligibleRole,
  assignmentsForRange,
} = require('../services/actingCoverService');

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
    return 'Only administrators may manage acting cover assignments.';
  }
  const actorCrew = String(actor?.crew || '').trim();
  if (!crewsMatch(actorCrew, crew)) {
    return 'Crew administrators may only manage acting cover for their own crew.';
  }
  return null;
}

exports.createActingCover = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Only administrators may assign acting cover.' });
    }

    const {
      absentEmpId,
      coverEmpId,
      role,
      crew,
      startDate,
      endDate,
      notes,
    } = req.body || {};

    if (!absentEmpId || !coverEmpId || !role || !crew || !startDate || !endDate) {
      return res.status(400).json({
        message: 'absentEmpId, coverEmpId, role, crew, startDate, and endDate are required.',
      });
    }

    if (!['shift_in_charge', 'supervisor'].includes(role)) {
      return res.status(400).json({ message: 'role must be shift_in_charge or supervisor.' });
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
      AdminUser.findOne({ empId: coverEmpId }).select('-passwordHash'),
    ]);
    if (!absent) return res.status(404).json({ message: 'Absent employee not found.' });
    if (!cover) return res.status(404).json({ message: 'Cover employee not found.' });

    if (!crewsMatch(absent.crew, crew)) {
      return res.status(400).json({ message: 'Absent employee must belong to the specified crew.' });
    }
    if (!crewsMatch(cover.crew, crew)) {
      return res.status(400).json({ message: 'Cover person must belong to the same crew.' });
    }
    if (absentEmpId === coverEmpId) {
      return res.status(400).json({ message: 'Cover person cannot be the same as the absent employee.' });
    }

    const absentRole = resolveAbsentRole(absent.role);
    if (!absentRole) {
      return res.status(400).json({
        message: 'Acting cover can only be assigned when the absent employee is Shift in Charge or Supervisor.',
      });
    }
    if (role !== absentRole) {
      return res.status(400).json({
        message: `Role must match absent employee role (${ROLE_LABELS[absentRole]}).`,
      });
    }
    if (!isCoverEligibleRole(cover.role)) {
      return res.status(400).json({
        message: 'Cover person must be Shift in Charge, Supervisor, or Management.',
      });
    }

    const overlap = await ActingAssignment.findOne({
      absentEmpId,
      role,
      startDate: { $lte: fmtDate(end) },
      endDate: { $gte: fmtDate(start) },
    });
    if (overlap) {
      return res.status(409).json({
        message: 'An acting cover assignment already exists for this employee and period.',
      });
    }

    const doc = await ActingAssignment.create({
      absentEmpId,
      coverEmpId,
      role,
      crew: String(crew).trim(),
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      createdBy: req.user?.id || null,
      notes: String(notes || '').trim(),
    });

    await logRosterEvent({
      action: 'ACTING_COVER_SET',
      actor,
      target: absent,
      summary: `${actor?.name || 'Admin'} assigned ${cover.name} as acting ${ROLE_LABELS[role]} for ${absent.name} (${fmtDate(start)} – ${fmtDate(end)})`,
      metadata: {
        absentEmpId,
        coverEmpId,
        role,
        crew,
        startDate: fmtDate(start),
        endDate: fmtDate(end),
      },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.ACTING_COVER_CREATED,
      targetType: 'employee',
      targetId: absent.empId,
      targetName: absent.name,
      before: null,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });

    const populated = {
      ...doc.toObject(),
      absentName: absent.name,
      coverName: cover.name,
    };
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listActingCover = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const actor = await loadActor(req);
    const { crew, start, end } = req.query;
    const filter = {};

    if (crew) filter.crew = String(crew).trim();

    if (start || end) {
      const startStr = start ? fmtDate(parseDateOnly(start) || new Date()) : '1970-01-01';
      const endStr = end ? fmtDate(parseDateOnly(end) || new Date()) : '2099-12-31';
      filter.startDate = { $lte: endStr };
      filter.endDate = { $gte: startStr };
    }

    if (!isSuperAdmin(req) && hasPortalAdminAccess(req)) {
      if (!actor?.crew) {
        return res.status(403).json({ message: 'Crew administrators must belong to a crew.' });
      }
      if (crew && !crewsMatch(actor.crew, crew)) {
        return res.status(403).json({ message: 'You may only list acting cover for your own crew.' });
      }
      if (!crew) {
        filter.crew = String(actor.crew).trim();
      }
    } else if (!isSuperAdmin(req) && !hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Only administrators may view acting cover assignments.' });
    }

    const docs = await ActingAssignment.find(filter).sort({ startDate: -1 }).lean();
    const empIds = [...new Set(docs.flatMap((d) => [d.absentEmpId, d.coverEmpId]))];
    const employees = await AdminUser.find({ empId: { $in: empIds } })
      .select('empId name crew role')
      .lean();
    const byId = new Map(employees.map((e) => [e.empId, e]));

    const data = docs.map((d) => ({
      ...d,
      absentName: byId.get(d.absentEmpId)?.name || d.absentEmpId,
      coverName: byId.get(d.coverEmpId)?.name || d.coverEmpId,
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteActingCover = async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Only administrators may remove acting cover.' });
    }

    const doc = await ActingAssignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Acting cover assignment not found.' });

    const accessErr = assertCrewAccess(req, actor, doc.crew);
    if (accessErr) return res.status(403).json({ message: accessErr });

    const [absent, cover] = await Promise.all([
      AdminUser.findOne({ empId: doc.absentEmpId }).select('-passwordHash'),
      AdminUser.findOne({ empId: doc.coverEmpId }).select('-passwordHash'),
    ]);

    await doc.deleteOne();

    await logRosterEvent({
      action: 'ACTING_COVER_CLEARED',
      actor,
      target: absent || { empId: doc.absentEmpId, name: doc.absentEmpId },
      summary: `${actor?.name || 'Admin'} removed acting cover for ${absent?.name || doc.absentEmpId} (${doc.startDate} – ${doc.endDate})`,
      metadata: {
        absentEmpId: doc.absentEmpId,
        coverEmpId: doc.coverEmpId,
        role: doc.role,
        startDate: doc.startDate,
        endDate: doc.endDate,
      },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.ACTING_COVER_DELETED,
      targetType: 'employee',
      targetId: doc.absentEmpId,
      targetName: absent?.name || doc.absentEmpId,
      before: doc.toObject ? doc.toObject() : { ...doc },
      after: null,
      req,
      metadata: { coverName: cover?.name },
    });

    res.json({ success: true, message: 'Acting cover removed.' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.assignmentsForRange = assignmentsForRange;
