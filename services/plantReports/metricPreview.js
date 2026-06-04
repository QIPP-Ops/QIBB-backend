const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const {
  canonicalMetricKey,
  deriveDisplayNameFromKey,
  expandMetricKeysForQuery,
} = require('./metricKeys');

function isoDay(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findMetricDoc(requestedKey) {
  const ck = canonicalMetricKey(requestedKey);
  const exact = await PlantMetric.findOne({
    metricKey: { $regex: new RegExp(`^${escapeRegex(ck)}$`, 'i') },
  })
    .select('metricKey label displayName unit category')
    .lean();
  if (exact) return exact;

  const legacy = await PlantMetric.findOne({
    metricKey: { $regex: new RegExp(`^${escapeRegex(ck)}_day_?\\d+$`, 'i') },
  })
    .select('metricKey label displayName unit category')
    .lean();
  return legacy;
}

/**
 * Preview payload for Trend Studio metric picker.
 */
async function fetchMetricPreview(requestedKey) {
  const ck = canonicalMetricKey(requestedKey);
  if (!ck) return null;

  const queryKeys = expandMetricKeysForQuery([ck]);
  const keyClauses = queryKeys.map((k) => ({
    metricKey: { $regex: new RegExp(`^${escapeRegex(k)}$`, 'i') },
  }));
  keyClauses.push({
    metricKey: { $regex: new RegExp(`^${escapeRegex(ck)}_day_?\\d+$`, 'i') },
  });

  const [bounds, sample, totalPoints, metricDoc] = await Promise.all([
    PlantMetricPoint.aggregate([
      { $match: { $or: keyClauses } },
      {
        $group: {
          _id: null,
          firstDate: { $min: '$reportDate' },
          lastDate: { $max: '$reportDate' },
        },
      },
    ]),
    PlantMetricPoint.find({ $or: keyClauses })
      .sort({ reportDate: -1 })
      .limit(10)
      .select('reportDate value unit')
      .lean(),
    PlantMetricPoint.countDocuments({ $or: keyClauses }),
    findMetricDoc(ck),
  ]);

  const b = bounds[0] || {};
  const unit = metricDoc?.unit || sample.find((r) => r.unit)?.unit || '';
  const displayName =
    String(metricDoc?.displayName || metricDoc?.label || '').trim() ||
    deriveDisplayNameFromKey(ck);

  if (!metricDoc && totalPoints === 0) return null;

  return {
    metricKey: ck,
    displayName,
    unit,
    firstDate: isoDay(b.firstDate),
    lastDate: isoDay(b.lastDate),
    totalPoints,
    sample: sample
      .map((r) => ({
        date: isoDay(r.reportDate),
        value: r.value,
        unit: r.unit || unit,
      }))
      .reverse(),
  };
}

module.exports = { fetchMetricPreview };
