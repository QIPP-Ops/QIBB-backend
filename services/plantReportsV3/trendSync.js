const { loadKind, listKinds } = require('./jsonStore');

function toPoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    return null;
  }
  const { date, metric, value } = point;
  if (typeof date !== 'string' || typeof metric !== 'string') {
    return null;
  }
  return { date, metric, value };
}

function listAvailableMetrics(kind) {
  const payload = loadKind(kind);
  const metrics = new Set();

  for (const point of payload.data || []) {
    const normalized = toPoint(point);
    if (normalized) {
      metrics.add(normalized.metric);
    }
  }

  return [...metrics].sort();
}

function listAllMetrics() {
  const out = {};
  for (const kind of listKinds()) {
    out[kind] = listAvailableMetrics(kind);
  }
  return out;
}

function previewKindData(kind, options = {}) {
  const { metric, dateFrom, dateTo, limit } = options;
  const payload = loadKind(kind);

  let rows = (payload.data || []).map(toPoint).filter(Boolean);

  if (metric) {
    rows = rows.filter((p) => p.metric === metric);
  }
  if (dateFrom) {
    rows = rows.filter((p) => p.date >= dateFrom);
  }
  if (dateTo) {
    rows = rows.filter((p) => p.date <= dateTo);
  }

  if (typeof limit === 'number' && limit > 0) {
    rows = rows.slice(-limit);
  }

  return rows;
}

function syncKindToTrends(kind, writeFn) {
  if (typeof writeFn !== 'function') {
    throw new Error('writeFn must be a function');
  }

  const payload = loadKind(kind);
  let synced = 0;

  for (const point of payload.data || []) {
    const normalized = toPoint(point);
    if (!normalized) continue;
    writeFn(normalized);
    synced += 1;
  }

  return { kind, synced };
}

function syncAllKindsToTrends(writeFn) {
  return listKinds().map((kind) => syncKindToTrends(kind, writeFn));
}

module.exports = {
  listAvailableMetrics,
  listAllMetrics,
  previewKindData,
  syncKindToTrends,
  syncAllKindsToTrends,
};
