const path = require('path');
const fs = require('fs');

const { validatePayload, VALID_KINDS } = require('./schema');

const DATA_DIR = process.env.PLANT_REPORTS_V3_DIR
  || (process.env.HOME ? path.join(process.env.HOME, 'data-v3') : null)
  || path.join(__dirname, '../../data');

function kindFilePath(kind) {
  return path.join(DATA_DIR, `${kind}.json`);
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    return null;
  }
  const { date, metric, value } = point;
  return { date, metric, value };
}

function sortData(data) {
  return [...data].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    if (a.metric !== b.metric) {
      return a.metric < b.metric ? -1 : 1;
    }
    return 0;
  });
}

function loadKind(kind) {
  const filePath = kindFilePath(kind);

  if (!fs.existsSync(filePath)) {
    return { kind, data: [] };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw || raw.trim().length === 0) {
    return { kind, data: [] };
  }

  return JSON.parse(raw);
}

function readKind(kind) {
  const payload = loadKind(kind);
  return Array.isArray(payload.data) ? payload.data : [];
}

function saveKind(kind, payload) {
  const sanitized = {
    kind,
    data: (payload.data || []).map((point) => normalizePoint(point)).filter(Boolean),
  };

  const result = validatePayload(sanitized);
  if (!result.valid) {
    throw new Error(JSON.stringify(result.errors));
  }

  const filePath = kindFilePath(kind);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');

  return sanitized;
}

function mergeKind(kind, incomingData) {
  const existing = loadKind(kind);
  const byKey = new Map();

  for (const point of existing.data || []) {
    const normalized = normalizePoint(point);
    if (!normalized) continue;
    byKey.set(`${normalized.date}\0${normalized.metric}`, normalized);
  }

  for (const point of incomingData || []) {
    const normalized = normalizePoint(point);
    if (!normalized) continue;
    byKey.set(`${normalized.date}\0${normalized.metric}`, normalized);
  }

  const merged = {
    kind,
    data: sortData([...byKey.values()]),
  };

  saveKind(kind, merged);
  return merged;
}

function listKinds() {
  return VALID_KINDS;
}

module.exports = {
  loadKind,
  readKind,
  saveKind,
  mergeKind,
  listKinds,
};
