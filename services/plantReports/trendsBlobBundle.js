const fs = require('fs');
const os = require('os');
const path = require('path');

/** Read-only seed blobs shipped in the deploy package (wwwroot on Azure). */
const SEED_DIR = path.join(__dirname, '../../data/trends-blobs');

const KIND_TO_FILE = {
  daily_ops: 'daily_ops.json',
  water: 'water.json',
  hrsg: 'hrsg.json',
  fg_filter: 'fg_filter.json',
  air_intake: 'air_intake.json',
  environment: 'environment.json',
};

const memory = new Map();
let resolvedWritableDir = null;

function resetTrendsBlobsDir() {
  resolvedWritableDir = null;
}

function isAzureAppService() {
  return Boolean(
    process.env.WEBSITE_SITE_NAME ||
      process.env.WEBSITE_INSTANCE_ID ||
      process.env.WEBSITE_RUN_FROM_PACKAGE
  );
}

function isDirWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writable directory for synced qipp-data blobs.
 * Azure: set TRENDS_BLOBS_DIR=/home/data/trends-blobs or PLANT_TRENDS_CACHE_DIR=/home/data.
 */
function getTrendsBlobsWritableDir() {
  if (resolvedWritableDir) return resolvedWritableDir;

  if (process.env.TRENDS_BLOBS_DIR) {
    resolvedWritableDir = path.resolve(process.env.TRENDS_BLOBS_DIR);
    return resolvedWritableDir;
  }

  if (process.env.PLANT_TRENDS_CACHE_DIR) {
    resolvedWritableDir = path.join(path.resolve(process.env.PLANT_TRENDS_CACHE_DIR), 'trends-blobs');
    return resolvedWritableDir;
  }

  const homeData = path.join(process.env.HOME || '/home', 'data', 'trends-blobs');
  const tmpFallback = path.join(os.tmpdir(), 'qibb-trends-blobs');
  const candidates = isAzureAppService()
    ? [homeData, tmpFallback]
    : [SEED_DIR, homeData, tmpFallback];

  for (const dir of candidates) {
    if (isDirWritable(dir)) {
      resolvedWritableDir = dir;
      break;
    }
  }

  if (!resolvedWritableDir) {
    resolvedWritableDir = tmpFallback;
    fs.mkdirSync(resolvedWritableDir, { recursive: true });
  }

  if (resolvedWritableDir !== SEED_DIR) {
    console.log(
      `[trends-blob-bundle] writable dir: ${resolvedWritableDir} (seed: ${SEED_DIR})`
    );
  }

  return resolvedWritableDir;
}


function listKindsInDir(dir) {
  return Object.keys(KIND_TO_FILE).filter((kind) => {
    const filePath = path.join(dir, KIND_TO_FILE[kind]);
    return fs.existsSync(filePath);
  });
}

function seedWritableBlobsIfNeeded() {
  const writable = getTrendsBlobsWritableDir();
  if (writable === SEED_DIR) return;
  fs.mkdirSync(writable, { recursive: true });
  if (listKindsInDir(writable).length > 0) return;

  for (const fileName of Object.values(KIND_TO_FILE)) {
    const seedPath = path.join(SEED_DIR, fileName);
    const targetPath = path.join(writable, fileName);
    if (fs.existsSync(seedPath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(seedPath, targetPath);
    }
  }
}

function resolveBlobPath(kind) {
  seedWritableBlobsIfNeeded();
  const file = KIND_TO_FILE[kind];
  if (!file) return null;

  const writablePath = path.join(getTrendsBlobsWritableDir(), file);
  if (fs.existsSync(writablePath)) return writablePath;

  const seedPath = path.join(SEED_DIR, file);
  if (fs.existsSync(seedPath)) return seedPath;

  return writablePath;
}

function bundledPath(kind) {
  return resolveBlobPath(kind);
}

function readBundledRaw(kind) {
  const filePath = resolveBlobPath(kind);
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
  seedWritableBlobsIfNeeded();
  const writableKinds = listKindsInDir(getTrendsBlobsWritableDir());
  if (writableKinds.length) return writableKinds;
  return listKindsInDir(SEED_DIR);
}

function hasBundledTrends() {
  return listBundledKinds().length > 0;
}

function getTrendsBlobDirs() {
  return {
    writableDir: getTrendsBlobsWritableDir(),
    seedDir: SEED_DIR,
  };
}

const api = {
  SEED_DIR,
  KIND_TO_FILE,
  getTrendsBlobsWritableDir,
  getTrendsBlobDirs,
  resetTrendsBlobsDir,
  bundledPath,
  resolveBlobPath,
  readBundledRaw,
  listBundledKinds,
  hasBundledTrends,
  seedWritableBlobsIfNeeded,
};

/** Primary dir used by sync + status — writable on Azure (lazy getter). */
Object.defineProperty(api, 'BUNDLED_DIR', {
  enumerable: true,
  get() {
    return getTrendsBlobsWritableDir();
  },
});

module.exports = api;
