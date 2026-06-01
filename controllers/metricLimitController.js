const MetricLimit = require('../models/MetricLimit');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.listMetricLimits = async (req, res) => {
  try {
    const rows = await MetricLimit.find().sort({ metricKey: 1 }).lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.upsertMetricLimit = async (req, res) => {
  try {
    const {
      metricKey,
      label,
      unit,
      lowAlarm,
      lowWarning,
      highWarning,
      highAlarm,
      target,
    } = req.body || {};
    if (!metricKey) return res.status(400).json({ message: 'metricKey is required.' });

    const numOrNull = (v) => (v == null || v === '' ? null : Number(v));

    const previous = await MetricLimit.findOne({ metricKey: String(metricKey).trim() }).lean();
    const doc = await MetricLimit.findOneAndUpdate(
      { metricKey: String(metricKey).trim() },
      {
        $set: {
          label: label || '',
          unit: unit || '',
          lowAlarm: numOrNull(lowAlarm),
          lowWarning: numOrNull(lowWarning),
          highWarning: numOrNull(highWarning),
          highAlarm: numOrNull(highAlarm),
          target: numOrNull(target),
          updatedBy: req.user?.id || null,
        },
      },
      { upsert: true, new: true }
    );
    await logAction({
      actor: req.user,
      action: previous ? AUDIT_ACTIONS.METRIC_LIMIT_CHANGED : AUDIT_ACTIONS.METRIC_LIMIT_SET,
      targetType: 'metric_limit',
      targetId: doc.metricKey,
      targetName: doc.label || doc.metricKey,
      before: previous,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteMetricLimit = async (req, res) => {
  try {
    const { metricKey } = req.params;
    const previous = await MetricLimit.findOne({ metricKey }).lean();
    await MetricLimit.deleteOne({ metricKey });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.METRIC_LIMIT_CHANGED,
      targetType: 'metric_limit',
      targetId: metricKey,
      targetName: previous?.label || metricKey,
      before: previous,
      req,
    });
    res.json({ message: 'Metric limit removed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
