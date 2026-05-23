const ChemistryHistory = require('../models/ChemistryHistory');

function flattenReadings(block) {
  if (!block) return [];
  if (Array.isArray(block)) return block;
  if (Array.isArray(block.readings)) return block.readings;
  return [];
}

function slugSegment(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]/g, '');
}

function buildParameterKey(prefix, path, paramKey) {
  const paramSlug = slugSegment(paramKey).toLowerCase();
  const pathParts = path.map(slugSegment).filter(Boolean);
  if (!pathParts.length) return `${prefix}_${paramSlug}`;
  return `${prefix}_${pathParts.join('_')}_${paramSlug}`;
}

/** Flatten nested RO/HRSG snapshot objects (dafTank, condensate/ST10, etc.). */
function flattenNestedSnapshot(block, prefix, path = []) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return [];

  const docs = [];
  for (const [key, val] of Object.entries(block)) {
    if (val == null || typeof val !== 'object' || Array.isArray(val)) continue;

    const scalars = Object.entries(val).filter(([, v]) => Number.isFinite(Number(v)));
    const paramLike = /^(ph|sc|turbidity|cl|orp|cc|dissolved|silica|iron|phosphate)/i.test(
      Object.keys(val).join(' ')
    );

    if (scalars.length && paramLike) {
      for (const [pk, pv] of scalars) {
        const value = Number(pv);
        if (!Number.isFinite(value)) continue;
        docs.push({
          parameterKey: buildParameterKey(prefix, [...path, key], pk),
          tankName: key,
          value,
          unit: '',
        });
      }
    } else {
      const nextPath = key === 'condensate' ? path : [...path, key];
      docs.push(...flattenNestedSnapshot(val, prefix, nextPath));
    }
  }
  return docs;
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
  const addBlock = (prefix, block) => {
    for (const r of flattenReadings(block)) {
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
    for (const row of flattenNestedSnapshot(block, prefix)) {
      docs.push({
        parameterKey: row.parameterKey,
        tankName: row.tankName || prefix,
        value: row.value,
        unit: row.unit,
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
  buildParameterKey,
};
