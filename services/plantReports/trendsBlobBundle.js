const fs = require('fs');
const path = require('path');

const BUNDLED_DIR = path.join(__dirname, '../../data/trends-blobs');

const KIND_TO_FILE = {
  daily_ops: 'daily_ops.json',
  water: 'water.json',
  hrsg: 'hrsg.json',
  fg_filter: 'fg_filter.json',
  air_intake: 'air_intake.json',
  environment: 'environment.json',
};

const memory = new Map();

function bundledPath(kind) {
  const file = KIND_TO_FILE[kind];
  if (!file) return null;
  return path.join(BUNDLED_DIR, file);
}

function readBundledRaw(kind) {
  const filePath = bundledPath(kind);
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    const stat = fs.statSync(filePath);
    const cached = memory.get(kind);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.raw;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const raw = JSON.parse(text);
    memory.set(kind, { mtimeMs: stat.mtimeMs, raw });
    return raw;
  } catch (err) {
    console.warn(`[trends-blob-bundle] read failed for ${kind}:`, err.message);
    return null;
  }
}

function listBundledKinds() {
  return Object.keys(KIND_TO_FILE).filter((kind) => {
    const filePath = bundledPath(kind);
    return filePath && fs.existsSync(filePath);
  });
}

function hasBundledTrends() {
  return listBundledKinds().length > 0;
}

module.exports = {
  BUNDLED_DIR,
  KIND_TO_FILE,
  bundledPath,
  readBundledRaw,
  listBundledKinds,
  hasBundledTrends,
};
