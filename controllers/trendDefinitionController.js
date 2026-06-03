const TrendDefinition = require('../models/TrendDefinition');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.listTrendDefinitions = async (_req, res) => {
  try {
    const rows = await TrendDefinition.find().sort({ order: 1, panelId: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTrendDefinition = async (req, res) => {
  try {
    const row = await TrendDefinition.findOne({ panelId: req.params.panelId }).lean();
    if (!row) return res.status(404).json({ message: 'Trend definition not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createTrendDefinition = async (req, res) => {
  try {
    const existing = await TrendDefinition.findOne({ panelId: req.body.panelId });
    if (existing) {
      return res.status(409).json({ message: 'panelId already exists' });
    }
    const doc = await TrendDefinition.create(req.body);
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.TREND_DEFINITION_CREATED || 'trend_definition_created',
      targetType: 'trend_definition',
      targetId: doc.panelId,
      targetName: doc.title,
      after: { panelId: doc.panelId },
      req,
    }).catch(() => {});
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.patchTrendDefinition = async (req, res) => {
  try {
    const doc = await TrendDefinition.findOneAndUpdate(
      { panelId: req.params.panelId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Trend definition not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteTrendDefinition = async (req, res) => {
  try {
    const doc = await TrendDefinition.findOneAndDelete({ panelId: req.params.panelId });
    if (!doc) return res.status(404).json({ message: 'Trend definition not found' });
    res.json({ success: true, data: { panelId: doc.panelId } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
