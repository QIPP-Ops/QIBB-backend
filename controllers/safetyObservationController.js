const crypto = require('crypto');
const multer = require('multer');
const SafetyObservation = require('../models/SafetyObservation');
const SafetyCaseCounter = require('../models/SafetyCaseCounter');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const { isPlantManagerUser } = require('../services/plantManagerService');
const { isCrewAdminFor } = require('../services/chatAccessService');
const { uploadSafetyFile, SAFETY_MAX_BYTES } = require('../services/safetyFileService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const {
  SAFETY_CATEGORIES,
  RISK_CATEGORIES,
  POTENTIAL_CAUSES,
  HOW_REVEALED_OPTIONS,
  RESPONSIBLE_DEPARTMENTS,
  PROJECT_STATUS_OPTIONS,
  DEFAULT_LOCATION,
  DEFAULT_REPORTED_BY_COMPANY,
  DEFAULT_RESPONSIBLE_DEPARTMENT,
  DEFAULT_REPORTED_BY_DEPARTMENT,
  MONTHLY_MINIMUM,
  INCENTIVE_TIERS,
  flattenRiskCategories,
} = require('../constants/safetyObservationOptions');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SAFETY_MAX_BYTES },
});

const COUNTABLE_STATUSES = ['registered', 'pending_review', 'approved', 'pending', 'closed'];
const REVIEW_STATUSES = ['registered', 'pending_review', 'pending'];

function currentMonthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeysBack(count, from = new Date()) {
  const keys = [];
  const d = new Date(from);
  for (let i = 0; i < count; i += 1) {
    keys.unshift(currentMonthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return keys;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeStatus(status) {
  if (status === 'pending') return 'registered';
  return status || 'registered';
}

function isOverdue(doc) {
  if (!doc?.dueDate) return false;
  const due = new Date(doc.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const closed = ['closed', 'approved'].includes(normalizeStatus(doc.status));
  return !closed && due < new Date();
}

async function nextCaseNumber() {
  const year = new Date().getFullYear();
  const counter = await SafetyCaseCounter.findOneAndUpdate(
    { year },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `SO-${year}-${String(counter.seq).padStart(5, '0')}`;
}

function appendLog(doc, actor, action, detail = '') {
  doc.processingLog = doc.processingLog || [];
  doc.processingLog.push({
    id: newId(),
    at: new Date(),
    actorId: String(actor?.id || actor?._id || ''),
    actorName: actor?.name || '',
    action,
    detail,
  });
}

function canReviewAll(req, user) {
  return isSuperAdmin(req) || isPlantManagerUser(user);
}

function canReviewCrew(user, crew) {
  if (!user) return false;
  if (isPlantManagerUser(user)) return true;
  return isCrewAdminFor(user, crew);
}

function canAccessObservation(actor, doc, req) {
  if (!actor || !doc) return false;
  if (canReviewAll(req, actor)) return true;
  if (String(doc.empId) === String(actor.empId)) return true;
  if (canReviewCrew(actor, doc.crew)) return true;
  const actorCrew = String(actor.crew || '').trim().toLowerCase();
  const docCrew = String(doc.crew || '').trim().toLowerCase();
  return actorCrew && actorCrew === docCrew;
}

function observationRow(doc) {
  const status = normalizeStatus(doc.status);
  return {
    id: String(doc._id),
    caseNumber: doc.caseNumber || '',
    empId: doc.empId,
    employeeName: doc.employeeName || '',
    crew: doc.crew || '',
    categories: doc.categories || [],
    observedAt: doc.observedAt || doc.createdAt || null,
    location: doc.location || '',
    title: doc.title,
    description: doc.description || '',
    riskCategories: doc.riskCategories || [],
    potentialCauses: doc.potentialCauses || [],
    stopWorkAuthority: Boolean(doc.stopWorkAuthority),
    howRevealed: doc.howRevealed || '',
    workProcess: doc.workProcess || '',
    responsibleDepartment: doc.responsibleDepartment || '',
    reportedByDepartment: doc.reportedByDepartment || '',
    reportedByCompany: doc.reportedByCompany || '',
    projectStatus: doc.projectStatus || '',
    contactPerson: doc.contactPerson || '',
    immediateActionTaken: doc.immediateActionTaken || '',
    dueDate: doc.dueDate || null,
    beforePhoto: doc.beforePhoto || '',
    afterPhoto: doc.afterPhoto || '',
    attachments: doc.attachments || [],
    comments: doc.comments || [],
    actions: doc.actions || [],
    links: doc.links || [],
    processingLog: doc.processingLog || [],
    status,
    overdue: isOverdue(doc),
    reviewNotes: doc.reviewNotes || '',
    observationMonth: doc.observationMonth,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    reviewedAt: doc.reviewedAt || null,
  };
}

function parseStringArray(val) {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      return val.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  return [];
}

function validateCategories(categories) {
  const invalid = categories.filter((c) => !SAFETY_CATEGORIES.includes(c));
  if (!categories.length) return 'At least one category is required.';
  if (invalid.length) return `Invalid categories: ${invalid.join(', ')}`;
  return null;
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 59, 999);
  return d;
}

exports.getOptions = async (_req, res) => {
  res.json({
    categories: SAFETY_CATEGORIES,
    riskCategories: RISK_CATEGORIES,
    riskCategoriesFlat: flattenRiskCategories(),
    potentialCauses: POTENTIAL_CAUSES,
    howRevealed: HOW_REVEALED_OPTIONS,
    responsibleDepartments: RESPONSIBLE_DEPARTMENTS,
    projectStatus: PROJECT_STATUS_OPTIONS,
    defaults: {
      location: DEFAULT_LOCATION,
      reportedByCompany: DEFAULT_REPORTED_BY_COMPANY,
      responsibleDepartment: DEFAULT_RESPONSIBLE_DEPARTMENT,
      reportedByDepartment: DEFAULT_REPORTED_BY_DEPARTMENT,
    },
    monthlyMinimum: MONTHLY_MINIMUM,
    incentiveTiers: INCENTIVE_TIERS,
    maxFileMb: SAFETY_MAX_BYTES / (1024 * 1024),
  });
};

exports.submitObservation = async (req, res) => {
  try {
    const user = await AdminUser.findById(req.user?.id).select('empId name crew department').lean();
    if (!user?.empId) return res.status(400).json({ message: 'Employee session is incomplete.' });

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    if (title.length > 4000) return res.status(400).json({ message: 'Title must be 4000 characters or fewer.' });

    const description = String(req.body?.description || req.body?.caseDescription || '').trim();
    if (description.length > 8000) {
      return res.status(400).json({ message: 'Case description must be 8000 characters or fewer.' });
    }

    const categories = parseStringArray(req.body?.categories || req.body?.category);
    const catErr = validateCategories(categories);
    if (catErr) return res.status(400).json({ message: catErr });

    const observedAt = req.body?.observedAt || req.body?.dateTime
      ? new Date(req.body.observedAt || req.body.dateTime)
      : new Date();
    if (Number.isNaN(observedAt.getTime())) {
      return res.status(400).json({ message: 'Invalid date and time.' });
    }

    const caseNumber = await nextCaseNumber();
    const doc = await SafetyObservation.create({
      caseNumber,
      empId: user.empId,
      employeeName: user.name || '',
      crew: user.crew || '',
      categories,
      observedAt,
      location: String(req.body?.location || DEFAULT_LOCATION).trim(),
      title,
      description,
      riskCategories: parseStringArray(req.body?.riskCategories || req.body?.riskCategory),
      potentialCauses: parseStringArray(req.body?.potentialCauses || req.body?.potentialCause),
      stopWorkAuthority: Boolean(req.body?.stopWorkAuthority),
      howRevealed: String(req.body?.howRevealed || '').trim(),
      workProcess: String(req.body?.workProcess || '').trim(),
      responsibleDepartment: String(
        req.body?.responsibleDepartment || DEFAULT_RESPONSIBLE_DEPARTMENT
      ).trim(),
      reportedByDepartment: String(
        req.body?.reportedByDepartment || user.department || DEFAULT_REPORTED_BY_DEPARTMENT
      ).trim(),
      reportedByCompany: String(req.body?.reportedByCompany || DEFAULT_REPORTED_BY_COMPANY).trim(),
      projectStatus: String(req.body?.projectStatus || '').trim(),
      contactPerson: String(req.body?.contactPerson || '').trim(),
      immediateActionTaken: String(req.body?.immediateActionTaken || '').trim(),
      dueDate: req.body?.dueDate ? new Date(req.body.dueDate) : defaultDueDate(),
      beforePhoto: String(req.body?.beforePhoto || '').trim(),
      afterPhoto: String(req.body?.afterPhoto || '').trim(),
      status: 'registered',
      observationMonth: currentMonthKey(observedAt),
      processingLog: [{
        id: newId(),
        at: new Date(),
        actorId: String(req.user?.id || ''),
        actorName: user.name || '',
        action: 'registered',
        detail: `Case ${caseNumber} registered`,
      }],
    });

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SAFETY_OBSERVATION_SUBMITTED,
      targetType: 'safety_observation',
      targetId: String(doc._id),
      targetName: doc.caseNumber,
      after: doc.toObject(),
      req,
    });

    res.status(201).json({ success: true, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listMyObservations = async (req, res) => {
  try {
    const empId = String(req.user?.empId || '').trim();
    if (!empId) return res.status(400).json({ message: 'Employee session is incomplete.' });
    const all = String(req.query.all || '').toLowerCase() === 'true';
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const filter = all ? { empId } : { empId, observationMonth: month };
    const rows = await SafetyObservation.find(filter).sort({ createdAt: -1 }).lean();
    const monthCount = rows.filter((r) => {
      if (r.observationMonth !== month) return false;
      return COUNTABLE_STATUSES.includes(normalizeStatus(r.status));
    }).length;
    res.json({
      observations: rows.map(observationRow),
      month,
      minimum: MONTHLY_MINIMUM,
      monthCount,
      metMinimum: monthCount >= MONTHLY_MINIMUM,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getByCaseNumber = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const caseNumber = String(req.params.caseNumber || '').trim().toUpperCase();
    const doc = await SafetyObservation.findOne({ caseNumber }).lean();
    if (!doc) return res.status(404).json({ message: 'Case not found.' });
    if (!canAccessObservation(actor, doc, req)) {
      return res.status(403).json({ message: 'You do not have access to this case.' });
    }
    res.json({ observation: observationRow(doc) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Case not found.' });
    if (!canAccessObservation(actor, doc, req)) {
      return res.status(403).json({ message: 'You do not have access to this case.' });
    }
    res.json({ observation: observationRow(doc) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Case not found.' });
    if (!canAccessObservation(actor, doc, req)) {
      return res.status(403).json({ message: 'You do not have access to this case.' });
    }
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Comment text is required.' });
    const comment = {
      id: newId(),
      authorId: String(actor._id),
      authorName: actor.name || '',
      text,
      createdAt: new Date(),
    };
    doc.comments.push(comment);
    appendLog(doc, actor, 'comment_added', text.slice(0, 120));
    await doc.save();
    res.status(201).json({ success: true, comment, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.addAction = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Case not found.' });
    if (!canAccessObservation(actor, doc, req)) {
      return res.status(403).json({ message: 'You do not have access to this case.' });
    }
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Action text is required.' });
    const action = {
      id: newId(),
      text,
      createdBy: String(actor._id),
      createdByName: actor.name || '',
      createdAt: new Date(),
      completed: false,
    };
    doc.actions.push(action);
    appendLog(doc, actor, 'action_added', text.slice(0, 120));
    await doc.save();
    res.status(201).json({ success: true, action, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.addLink = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Case not found.' });
    if (!canAccessObservation(actor, doc, req)) {
      return res.status(403).json({ message: 'You do not have access to this case.' });
    }
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ message: 'Link URL is required.' });
    const link = {
      id: newId(),
      url,
      label: String(req.body?.label || url).trim(),
      createdBy: String(actor._id),
      createdByName: actor.name || '',
      createdAt: new Date(),
    };
    doc.links.push(link);
    appendLog(doc, actor, 'link_added', url);
    await doc.save();
    res.status(201).json({ success: true, link, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.patchObservation = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Case not found.' });
    const isOwner = String(doc.empId) === String(actor?.empId);
    const isReviewer = canReviewCrew(actor, doc.crew) || canReviewAll(req, actor);
    if (!isOwner && !isReviewer) {
      return res.status(403).json({ message: 'Not allowed to update this case.' });
    }

    if (req.body?.afterPhoto !== undefined) {
      doc.afterPhoto = String(req.body.afterPhoto || '').trim();
      appendLog(doc, actor, 'after_photo_updated');
    }
    if (req.body?.beforePhoto !== undefined && isOwner) {
      doc.beforePhoto = String(req.body.beforePhoto || '').trim();
      appendLog(doc, actor, 'before_photo_updated');
    }
    if (req.body?.status === 'closed' && (isOwner || isReviewer)) {
      if (!doc.beforePhoto || !doc.afterPhoto) {
        return res.status(400).json({
          message: 'Before and after photos are required to close a case.',
        });
      }
      doc.status = 'closed';
      appendLog(doc, actor, 'closed');
    }

    await doc.save();
    res.json({ success: true, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.uploadAttachment = [
  upload.single('file'),
  async (req, res) => {
    try {
      const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
      const doc = await SafetyObservation.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Case not found.' });
      if (!canAccessObservation(actor, doc, req)) {
        return res.status(403).json({ message: 'You do not have access to this case.' });
      }
      if (!req.file) return res.status(400).json({ message: 'No file provided.' });

      const kind = String(req.body?.kind || 'file');
      const uploaded = await uploadSafetyFile({
        caseNumber: doc.caseNumber,
        userId: String(actor._id),
        file: req.file,
      });

      const attachment = {
        id: newId(),
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        uploadedBy: String(actor._id),
        uploadedByName: actor.name || '',
        uploadedAt: new Date(),
        kind: ['before_photo', 'after_photo', 'file'].includes(kind) ? kind : 'file',
      };

      doc.attachments.push(attachment);
      if (kind === 'before_photo') doc.beforePhoto = uploaded.url;
      if (kind === 'after_photo') doc.afterPhoto = uploaded.url;
      appendLog(doc, actor, 'attachment_uploaded', uploaded.fileName);
      await doc.save();

      res.status(201).json({ success: true, attachment, observation: observationRow(doc) });
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
];

exports.listPendingReview = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const canAll = canReviewAll(req, actor);
    const canCrew = canReviewCrew(actor, actor?.crew);
    if (!canAll && !canCrew) {
      return res.status(403).json({
        message: 'Only crew administrators, operation manager, or super admin may review observations.',
      });
    }
    const filter = { status: { $in: REVIEW_STATUSES } };
    if (!canAll) filter.crew = actor.crew;
    const rows = await SafetyObservation.find(filter).sort({ createdAt: 1 }).lean();
    res.json({ observations: rows.map(observationRow) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reviewObservation = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Observation not found.' });
    const canAll = canReviewAll(req, actor);
    const canCrew = canReviewCrew(actor, doc.crew);
    if (!canAll && !canCrew) {
      return res.status(403).json({ message: 'Not allowed to review this observation.' });
    }

    const status = String(req.body?.status || '').trim();
    const allowed = ['approved', 'rejected', 'pending_review', 'closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` });
    }
    if (status === 'closed' && (!doc.beforePhoto || !doc.afterPhoto)) {
      return res.status(400).json({
        message: 'Before and after photos are required to close a case.',
      });
    }

    doc.status = status;
    doc.reviewNotes = String(req.body?.reviewNotes || '').trim();
    doc.reviewedBy = req.user?.id || null;
    doc.reviewedAt = new Date();
    appendLog(doc, actor, `review_${status}`, doc.reviewNotes);
    await doc.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SAFETY_OBSERVATION_REVIEWED,
      targetType: 'safety_observation',
      targetId: String(doc._id),
      targetName: doc.caseNumber,
      after: doc.toObject(),
      req,
    });

    res.json({ success: true, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteObservation = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Observation not found.' });
    const canAll = canReviewAll(req, actor);
    const canCrew = canReviewCrew(actor, doc.crew);
    if (!canAll && !canCrew) {
      return res.status(403).json({ message: 'Not allowed to delete this observation.' });
    }
    await doc.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getMonthlyCompliance = async (req, res) => {
  try {
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const crew = String(req.query.crew || '').trim();
    const filter = { observationMonth: month, status: { $in: COUNTABLE_STATUSES } };
    if (crew) filter.crew = crew;

    const rows = await SafetyObservation.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$empId',
          count: { $sum: 1 },
          name: { $first: '$employeeName' },
          crew: { $first: '$crew' },
        },
      },
    ]);

    const summary = rows.map((r) => ({
      empId: r._id,
      name: r.name || r._id,
      crew: r.crew || '',
      count: r.count,
      metMinimum: r.count >= MONTHLY_MINIMUM,
    }));

    res.json({ month, minimum: MONTHLY_MINIMUM, employees: summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getIncentivesSummary = async (req, res) => {
  try {
    const empId = String(req.query.empId || req.user?.empId || '').trim();
    if (!empId) return res.status(400).json({ message: 'Employee ID required.' });

    const actor = await AdminUser.findById(req.user?.id).select('empId').lean();
    const canAll = canReviewAll(req, actor) || hasPortalAdminAccess(req);
    if (!canAll && empId !== actor?.empId) {
      return res.status(403).json({ message: 'Not allowed.' });
    }

    const months3 = monthKeysBack(3);
    const rows = await SafetyObservation.aggregate([
      {
        $match: {
          empId,
          observationMonth: { $in: months3 },
          status: { $in: COUNTABLE_STATUSES },
        },
      },
      { $group: { _id: '$observationMonth', count: { $sum: 1 } } },
    ]);
    const countByMonth = new Map(rows.map((r) => [r._id, r.count]));
    const monthlyCounts = months3.map((m) => ({ month: m, count: countByMonth.get(m) || 0 }));

    const currentMonthCount = countByMonth.get(months3[months3.length - 1]) || 0;

    const tiers = INCENTIVE_TIERS.map((tier) => {
      const recent = months3.slice(-tier.consecutiveMonths);
      const eligible = recent.every((m) => (countByMonth.get(m) || 0) >= tier.threshold);
      const progress = Math.min(
        100,
        Math.round(
          (currentMonthCount / tier.threshold) * 100
        )
      );
      return {
        ...tier,
        eligible,
        progress,
        currentMonthCount,
      };
    });

    res.json({
      empId,
      monthlyCounts,
      currentMonthCount,
      tiers,
      badges: tiers.filter((t) => t.eligible).map((t) => t.id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.sendReminders = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    if (!hasPortalAdminAccess(req) && !canReviewCrew(actor, actor?.crew)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }

    const month = String(req.body?.month || currentMonthKey()).slice(0, 7);
    const crewFilter = canReviewAll(req, actor)
      ? String(req.body?.crew || '').trim()
      : String(actor.crew || '').trim();

    const userQuery = { isActive: { $ne: false }, hiddenFromLeaveTimesheet: { $ne: true } };
    if (crewFilter) userQuery.crew = crewFilter;

    const employees = await AdminUser.find(userQuery).select('_id empId name crew email').lean();
    const counts = await SafetyObservation.aggregate([
      { $match: { observationMonth: month, status: { $in: COUNTABLE_STATUSES } } },
      { $group: { _id: '$empId', count: { $sum: 1 } } },
    ]);
    const countByEmp = new Map(counts.map((c) => [c._id, c.count]));
    const needsReminder = employees.filter((e) => (countByEmp.get(e.empId) || 0) < MONTHLY_MINIMUM);

    const { notifySafetyObservationReminder } = require('../services/notificationService');
    let notified = 0;
    for (const e of needsReminder) {
      try {
        await notifySafetyObservationReminder({
          recipientUserId: e._id,
          empId: e.empId,
          name: e.name,
          count: countByEmp.get(e.empId) || 0,
          month,
        });
        notified += 1;
      } catch (err) {
        console.warn('[safety] reminder failed:', e.empId, err.message);
      }
    }

    res.json({
      month,
      reminded: needsReminder.length,
      notified,
      employees: needsReminder.map((e) => ({
        empId: e.empId,
        name: e.name,
        count: countByEmp.get(e.empId) || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyCompliance = async (req, res) => {
  try {
    const empId = String(req.user?.empId || '').trim();
    if (!empId) return res.status(400).json({ message: 'Employee session is incomplete.' });
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const count = await SafetyObservation.countDocuments({
      empId,
      observationMonth: month,
      status: { $in: COUNTABLE_STATUSES },
    });
    res.json({
      month,
      count,
      minimum: MONTHLY_MINIMUM,
      metMinimum: count >= MONTHLY_MINIMUM,
      remaining: Math.max(0, MONTHLY_MINIMUM - count),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
