const MetricLimit = require('../models/MetricLimit');

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
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteMetricLimit = async (req, res) => {
  try {
    const { metricKey } = req.params;
    await MetricLimit.deleteOne({ metricKey });
    res.json({ message: 'Metric limit removed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
