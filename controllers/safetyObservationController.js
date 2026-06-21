const SafetyObservation = require('../models/SafetyObservation');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const { isPlantManagerUser } = require('../services/plantManagerService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

function currentMonthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function canReviewObservations(req, user) {
  return isSuperAdmin(req) || isPlantManagerUser(user);
}

function observationRow(doc) {
  return {
    id: String(doc._id),
    empId: doc.empId,
    employeeName: doc.employeeName || '',
    crew: doc.crew || '',
    title: doc.title,
    description: doc.description || '',
    location: doc.location || '',
    beforePhoto: doc.beforePhoto || '',
    afterPhoto: doc.afterPhoto || '',
    status: doc.status || 'pending',
    reviewNotes: doc.reviewNotes || '',
    observationMonth: doc.observationMonth,
    createdAt: doc.createdAt || null,
    reviewedAt: doc.reviewedAt || null,
  };
}

exports.submitObservation = async (req, res) => {
  try {
    const user = await AdminUser.findById(req.user?.id).select('empId name crew').lean();
    if (!user?.empId) return res.status(400).json({ message: 'Employee session is incomplete.' });

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title is required.' });

    const doc = await SafetyObservation.create({
      empId: user.empId,
      employeeName: user.name || '',
      crew: user.crew || '',
      title,
      description: String(req.body?.description || '').trim(),
      location: String(req.body?.location || '').trim(),
      beforePhoto: String(req.body?.beforePhoto || '').trim(),
      afterPhoto: String(req.body?.afterPhoto || '').trim(),
      observationMonth: currentMonthKey(),
    });

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SAFETY_OBSERVATION_SUBMITTED,
      targetType: 'safety_observation',
      targetId: String(doc._id),
      targetName: doc.title,
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
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const rows = await SafetyObservation.find({ empId, observationMonth: month })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ observations: rows.map(observationRow), month, minimum: 2 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listPendingReview = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    if (!canReviewObservations(req, actor)) {
      return res.status(403).json({ message: 'Only super administrators or the plant manager may review observations.' });
    }
    const rows = await SafetyObservation.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
    res.json({ observations: rows.map(observationRow) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reviewObservation = async (req, res) => {
  try {
    const actor = await AdminUser.findById(req.user?.id).select('-passwordHash').lean();
    if (!canReviewObservations(req, actor)) {
      return res.status(403).json({ message: 'Only super administrators or the plant manager may review observations.' });
    }
    const status = String(req.body?.status || '').trim();
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be approved or rejected.' });
    }
    const doc = await SafetyObservation.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Observation not found.' });
    doc.status = status;
    doc.reviewNotes = String(req.body?.reviewNotes || '').trim();
    doc.reviewedBy = req.user?.id || null;
    doc.reviewedAt = new Date();
    await doc.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SAFETY_OBSERVATION_REVIEWED,
      targetType: 'safety_observation',
      targetId: String(doc._id),
      targetName: doc.title,
      after: doc.toObject(),
      req,
    });

    res.json({ success: true, observation: observationRow(doc) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getMonthlyCompliance = async (req, res) => {
  try {
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const crew = String(req.query.crew || '').trim();
    const filter = { observationMonth: month, status: { $in: ['pending', 'approved'] } };
    if (crew) filter.crew = crew;

    const rows = await SafetyObservation.aggregate([
      { $match: filter },
      { $group: { _id: '$empId', count: { $sum: 1 }, name: { $first: '$employeeName' }, crew: { $first: '$crew' } } },
    ]);

    const summary = rows.map((r) => ({
      empId: r._id,
      name: r.name || r._id,
      crew: r.crew || '',
      count: r.count,
      metMinimum: r.count >= 2,
    }));

    res.json({ month, minimum: 2, employees: summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.sendReminders = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const month = String(req.body?.month || currentMonthKey()).slice(0, 7);
    const employees = await AdminUser.find({ isActive: { $ne: false }, hiddenFromLeaveTimesheet: { $ne: true } })
      .select('empId name crew email')
      .lean();
    const counts = await SafetyObservation.aggregate([
      { $match: { observationMonth: month, status: { $in: ['pending', 'approved'] } } },
      { $group: { _id: '$empId', count: { $sum: 1 } } },
    ]);
    const countByEmp = new Map(counts.map((c) => [c._id, c.count]));
    const needsReminder = employees.filter((e) => (countByEmp.get(e.empId) || 0) < 2);
    res.json({
      month,
      reminded: needsReminder.length,
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
