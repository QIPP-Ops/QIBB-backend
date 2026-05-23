const ChemistryHistory = require('../models/ChemistryHistory');

function flattenReadings(block) {
  if (!block) return [];
  if (Array.isArray(block)) return block;
  if (Array.isArray(block.readings)) return block.readings;
  return [];
}

function readingFields(r) {
  const parameter = String(r.parameter || r.Parameter || r.name || '').trim();
  if (!parameter) return null;
  const value = Number(r.value ?? r.Value);
  if (!Number.isFinite(value)) return null;
  return {
    parameter,
    value,
    unit: String(r.unit || r.Unit || '').trim(),
    tankName: String(r.location || r.tank || r.Tank || r.unit || '').trim(),
  };
}

async function appendFromTrendsSnapshot(snapshot) {
  if (!snapshot) return { inserted: 0 };
  const ts = snapshot.createdAt ? new Date(snapshot.createdAt) : new Date();
  const chem = snapshot.chemistry;
  if (!chem) return { inserted: 0 };

  const docs = [];
  const addBlock = (prefix, arr) => {
    for (const r of flattenReadings(arr)) {
      const parsed = readingFields(r);
      if (!parsed) continue;
      docs.push({
        parameterKey: `${prefix}_${parsed.parameter}`,
        tankName: parsed.tankName || prefix,
        value: parsed.value,
        unit: parsed.unit,
        timestamp: ts,
        source: 'trends_snapshot',
      });
    }
  };

  addBlock('RO', chem.ro);
  addBlock('HRSG', chem.hrsg);

  if (!docs.length) return { inserted: 0 };
  await ChemistryHistory.insertMany(docs, { ordered: false });
  return { inserted: docs.length };
}

async function getHistoryForParameter(parameterKey, opts = {}) {
  const limit = Math.min(parseInt(opts.limit, 10) || 500, 2000);
  const since = opts.since ? new Date(opts.since) : null;
  const filter = { parameterKey: String(parameterKey) };
  if (since && !Number.isNaN(since.getTime())) filter.timestamp = { $gte: since };

  return ChemistryHistory.find(filter).sort({ timestamp: 1 }).limit(limit).lean();
}

module.exports = {
  appendFromTrendsSnapshot,
  getHistoryForParameter,
};
