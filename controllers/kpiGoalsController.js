const AdminUser = require('../models/AdminUser');
const KpiFactor = require('../models/KpiFactor');
const { isSuperAdminUser } = require('../middleware/superAdmin');
const { logAction } = require('../services/auditLogService');
const { notifyKpiSubmitted, notifyKpiFinalized } = require('../services/notificationService');
const AUDIT_ACTIONS = require('../constants/auditActions');

function actorEmpId(req) {
  return String(req.user?.empId || '').trim();
}

function canEditEmployeeKpi(req, empId) {
  if (isSuperAdminUser(req)) return true;
  if (req.user?.role === 'admin' || req.user?.accessRole === 'admin') return true;
  return actorEmpId(req) === String(empId || '').trim();
}

exports.getMyKpiGoals = async (req, res) => {
  try {
    const empId = actorEmpId(req);
    if (!empId) return res.status(400).json({ message: 'Employee ID missing from session.' });
    const user = await AdminUser.findOne({ empId }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Personnel not found.' });
    res.json({
      success: true,
      data: {
        empId: user.empId,
        name: user.name,
        kpis: user.kpis || [],
        kpiSubmissionStatus: user.kpiSubmissionStatus || 'draft',
        kpiReviewNotes: user.kpiReviewNotes || '',
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.saveMyKpiGoals = async (req, res) => {
  try {
    const empId = actorEmpId(req);
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found.' });

    const { kpis } = req.body;
    if (!Array.isArray(kpis)) {
      return res.status(400).json({ message: 'kpis array required.' });
    }

    const totalWeight = kpis.reduce((sum, k) => sum + (Number(k.weight) || 0), 0);
    if (totalWeight > 100) {
      return res.status(400).json({ message: 'Total KPI weight cannot exceed 100%.' });
    }

    user.kpis = kpis.map((k) => ({
      title: String(k.title || '').trim(),
      description: String(k.description || '').trim(),
      weight: Math.min(100, Math.max(0, Number(k.weight) || 0)),
      progress: Math.min(100, Math.max(0, Number(k.progress) || 0)),
      locked: Boolean(k.locked),
      visible: k.visible !== false,
      targetDate: k.targetDate || null,
      _id: k._id || undefined,
    })).filter((k) => k.title);

    user.kpiSubmissionStatus = 'draft';
    await user.save();

    res.json({ success: true, data: { kpis: user.kpis, kpiSubmissionStatus: user.kpiSubmissionStatus } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.submitMyKpiGoals = async (req, res) => {
  try {
    const empId = actorEmpId(req);
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found.' });
    if (!user.kpis?.length) {
      return res.status(400).json({ message: 'Add at least one KPI goal before submitting.' });
    }
    user.kpiSubmissionStatus = 'submitted';
    user.kpiSubmittedAt = new Date();
    await user.save();
    try {
      await notifyKpiSubmitted({ employee: user.toObject ? user.toObject() : user });
    } catch (err) {
      console.error('[kpi] submit notification failed:', err.message);
    }
    res.json({ success: true, data: { kpiSubmissionStatus: user.kpiSubmissionStatus } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listEmployeeKpiSubmissions = async (req, res) => {
  try {
    const users = await AdminUser.find({ 'kpis.0': { $exists: true } })
      .select('empId name crew role kpis kpiSubmissionStatus kpiReviewNotes kpiSubmittedAt kpiReviewedAt')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reviewEmployeeKpi = async (req, res) => {
  try {
    const { empId } = req.params;
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found.' });

    const { kpiReviewNotes, kpis, status, finalize } = req.body;
    const prevStatus = user.kpiSubmissionStatus;
    if (kpiReviewNotes !== undefined) user.kpiReviewNotes = String(kpiReviewNotes);
    if (status === 'reviewed' || status === 'draft' || status === 'submitted' || status === 'rejected') {
      user.kpiSubmissionStatus = status === 'rejected' ? 'draft' : status;
      if (status === 'reviewed' || finalize) user.kpiReviewedAt = new Date();
    }
    if (finalize === true) {
      user.kpiSubmissionStatus = 'reviewed';
      user.kpiReviewedAt = new Date();
    }

    if (Array.isArray(kpis)) {
      user.kpis = kpis.map((k) => ({
        title: String(k.title || '').trim(),
        description: String(k.description || '').trim(),
        weight: Math.min(100, Math.max(0, Number(k.weight) || 0)),
        progress: Math.min(100, Math.max(0, Number(k.progress) || 0)),
        adminScore:
          k.adminScore !== undefined && k.adminScore !== null
            ? Math.min(100, Math.max(0, Number(k.adminScore) || 0))
            : undefined,
        locked: Boolean(k.locked),
        visible: k.visible !== false,
        targetDate: k.targetDate || null,
        _id: k._id || undefined,
      })).filter((k) => k.title);
    }

    await user.save();

    const finalized =
      (finalize === true || status === 'reviewed') && user.kpiSubmissionStatus === 'reviewed';
    if (finalized && prevStatus !== 'reviewed') {
      try {
        await notifyKpiFinalized({
          employee: user.toObject ? user.toObject() : user,
          reviewNotes: user.kpiReviewNotes,
        });
      } catch (err) {
        console.error('[kpi] finalize notification failed:', err.message);
      }
    }
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.KPI_FACTOR_CHANGED,
      targetType: 'employee',
      targetId: user._id?.toString(),
      targetName: user.name,
      after: { kpiSubmissionStatus: user.kpiSubmissionStatus },
      req,
    });

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.listKpiFactors = async (_req, res) => {
  try {
    const factors = await KpiFactor.find({ active: { $ne: false } }).sort({ order: 1, title: 1 }).lean();
    res.json({ success: true, data: factors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createKpiFactor = async (req, res) => {
  try {
    const factor = await KpiFactor.create(req.body);
    res.status(201).json({ success: true, data: factor });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateKpiFactor = async (req, res) => {
  try {
    const factor = await KpiFactor.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!factor) return res.status(404).json({ message: 'KPI factor not found.' });
    res.json({ success: true, data: factor });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteKpiFactor = async (req, res) => {
  try {
    const factor = await KpiFactor.findByIdAndUpdate(
      req.params.id,
      { $set: { active: false } },
      { new: true }
    );
    if (!factor) return res.status(404).json({ message: 'KPI factor not found.' });
    res.json({ success: true, data: factor });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.canEditEmployeeKpi = canEditEmployeeKpi;
