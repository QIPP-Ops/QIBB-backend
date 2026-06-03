const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { flattenNestedSnapshot } = require('../chemistryHistoryService');

const WATER_SERIES_DEFS = [
  { key: 'totalGrConsumption', label: 'Total GR consumption', pick: (w) => num(w?.totalGrConsumption) },
  { key: 'swProduction', label: 'SW production', pick: (w) => num(w?.swProduction) },
  { key: 'swConsumption', label: 'SW consumption', pick: (w) => num(w?.swConsumption) },
  { key: 'dmProduction', label: 'DM production', pick: (w) => num(w?.dmProduction) },
  { key: 'dmConsumption', label: 'DM consumption', pick: (w) => num(w?.dmConsumption) },
  { key: 'tankST1', label: 'Tank ST-1 level', pick: (w) => num(w?.tankLevels?.ST1) },
  { key: 'tankST2', label: 'Tank ST-2 level', pick: (w) => num(w?.tankLevels?.ST2) },
  { key: 'tankDT1', label: 'Tank DT-1 level', pick: (w) => num(w?.tankLevels?.DT1) },
  { key: 'tankDT2', label: 'Tank DT-2 level', pick: (w) => num(w?.tankLevels?.DT2) },
];

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function snapDate(snap) {
  const raw = snap.createdAt;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchSnapshotsForRange(from, to) {
  const since = new Date(`${from}T00:00:00.000Z`);
  const until = new Date(`${to}T23:59:59.999Z`);
  return TrendsSnapshot.find({ createdAt: { $gte: since, $lte: until } })
    .sort({ createdAt: 1 })
    .limit(2000)
    .select('createdAt water chemistry')
    .lean();
}

function patternsFromDef(def) {
  return (def.metricSeries || [])
    .map((s) => s.keyPattern || s.key)
    .filter(Boolean)
    .map((p) => new RegExp(p, 'i'));
}

function keyMatchesPatterns(key, patterns) {
  if (!patterns.length) return true;
  return patterns.some((re) => re.test(key));
}

function chemistryKeysFromSnapshot(snap) {
  const chem = snap.chemistry;
  if (!chem) return [];
  const keys = [];
  for (const row of flattenNestedSnapshot(chem.ro, 'RO')) {
    if (row.parameterKey && Number.isFinite(row.value)) {
      keys.push({
        key: row.parameterKey,
        label: row.tankName || row.parameterKey,
        value: row.value,
      });
    }
  }
  for (const row of flattenNestedSnapshot(chem.hrsg, 'HRSG')) {
    if (row.parameterKey && Number.isFinite(row.value)) {
      keys.push({
        key: row.parameterKey,
        label: row.tankName || row.parameterKey,
        value: row.value,
      });
    }
  }
  return keys;
}

function buildChemistrySeries(snapshots, patterns, maxKeys = 6) {
  const keyMeta = new Map();
  for (const snap of snapshots) {
    for (const { key, label } of chemistryKeysFromSnapshot(snap)) {
      if (!keyMatchesPatterns(key, patterns)) continue;
      if (!keyMeta.has(key)) keyMeta.set(key, label);
      if (keyMeta.size >= maxKeys) break;
    }
    if (keyMeta.size >= maxKeys) break;
  }
  const keys = [...keyMeta.keys()].slice(0, maxKeys);
  if (!keys.length) return { keys: [], labels: {}, series: [] };

  const byDate = {};
  for (const snap of snapshots) {
    const date = snapDate(snap);
    if (!date) continue;
    if (!byDate[date]) byDate[date] = { date };
    for (const row of chemistryKeysFromSnapshot(snap)) {
      if (!keys.includes(row.key)) continue;
      byDate[date][row.key] = row.value;
    }
  }
  const series = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const labels = Object.fromEntries(keys.map((k) => [k, keyMeta.get(k) || k]));
  return { keys, labels, series };
}

function buildWaterSeries(snapshots, patterns, maxKeys = 8) {
  const defs = WATER_SERIES_DEFS.filter(
    (d) => !patterns.length || keyMatchesPatterns(d.key, patterns) || keyMatchesPatterns(d.label, patterns)
  ).slice(0, maxKeys);
  if (!defs.length && patterns.length) {
    return { keys: [], labels: {}, series: [] };
  }
  const useDefs = defs.length ? defs : WATER_SERIES_DEFS.slice(0, maxKeys);
  const keys = useDefs.map((d) => d.key);
  const byDate = {};
  for (const snap of snapshots) {
    const date = snapDate(snap);
    const w = snap.water;
    if (!date || !w) continue;
    if (!byDate[date]) byDate[date] = { date };
    for (const def of useDefs) {
      const value = def.pick(w);
      if (value != null) byDate[date][def.key] = value;
    }
  }
  const series = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const labels = Object.fromEntries(useDefs.map((d) => [d.key, d.label]));
  return { keys, labels, series };
}

async function buildChemistryWaterPanel(def, from, to) {
  const snapshots = await fetchSnapshotsForRange(from, to);
  const patterns = patternsFromDef(def);
  const maxKeys = def.maxKeys || 6;
  const panelId = def.panelId || '';

  let built;
  if (panelId.includes('water') || def.category === 'water') {
    built = buildWaterSeries(snapshots, patterns, maxKeys);
  } else if (panelId.includes('hrsg') || panelId === 'home_chem_hrsg') {
    built = buildChemistrySeries(
      snapshots,
      patterns.length ? patterns : [/hrsg|conductivity|silica/i],
      maxKeys
    );
  } else if (panelId.includes('ro') || panelId === 'home_chem_ro' || panelId === 'chemistry') {
    built = buildChemistrySeries(
      snapshots,
      patterns.length ? patterns : [/ro|permeate|recovery|chlor|ph|conduct|silica/i],
      maxKeys
    );
  } else {
    const chem = buildChemistrySeries(snapshots, patterns, maxKeys);
    const water = buildWaterSeries(snapshots, patterns, maxKeys);
    const keys = [...new Set([...chem.keys, ...water.keys])].slice(0, maxKeys);
    const labels = { ...water.labels, ...chem.labels };
    const byDate = {};
    for (const row of [...chem.series, ...water.series]) {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date };
      Object.assign(byDate[row.date], row);
    }
    built = {
      keys,
      labels,
      series: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  return {
    id: def.panelId,
    title: def.title,
    description: def.description || '',
    chartType: def.chartType,
    category: def.category,
    unit: def.unit || '',
    theme: def.theme || 'default',
    metricKeys: built.keys,
    labels: built.labels,
    series: built.series,
    summary: built.series.length && built.keys.length
      ? panelSummaryFromSeries(built.series, built.keys[0])
      : null,
    dataSource: 'chemistry_water',
  };
}

function panelSummaryFromSeries(series, primaryKey) {
  const vals = series
    .map((row) => row[primaryKey])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return null;
  const latest = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const first = vals[0];
  const changePct = first ? ((latest - first) / Math.abs(first)) * 100 : 0;
  return { latest, target: avg, changePct, min: Math.min(...vals), max: Math.max(...vals) };
}

module.exports = {
  buildChemistryWaterPanel,
  fetchSnapshotsForRange,
};
