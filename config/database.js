/**
 * MongoDB connection URI (MongoDB Atlas).
 * Appends MONGODB_DB_NAME when the URI has no database path (Atlas default is "test").
 */
function normalizeDbName(name) {
  return String(name || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

/**
 * @returns {string} database segment already present in URI, or '' if missing/empty
 */
function existingDbSegment(baseWithoutQuery) {
  const afterScheme = baseWithoutQuery.replace(/^mongodb(\+srv)?:\/\//i, '');
  const slashIdx = afterScheme.indexOf('/');
  if (slashIdx < 0) return '';
  return afterScheme.slice(slashIdx + 1).trim();
}

function getMongoUri() {
  const raw = (process.env.COSMOS_URI || process.env.MONGODB_URI || '').trim();
  return resolveMongoUri(raw, process.env.MONGODB_DB_NAME || 'QIPP');
}

/**
 * Normalize any Mongo URI to include the database path when missing (e.g. host/?query → host/QIPP?query).
 * Used by migrate scripts and getMongoUri().
 */
function resolveMongoUri(rawUri, dbNameOverride) {
  const raw = String(rawUri || '').trim();
  if (!raw) return '';

  const dbName = normalizeDbName(dbNameOverride || process.env.MONGODB_DB_NAME || 'QIPP');
  if (!dbName) return raw;

  const encodedDb = encodeURIComponent(dbName);
  const qIdx = raw.indexOf('?');
  const base = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = qIdx >= 0 ? raw.slice(qIdx) : '';

  const existingDb = existingDbSegment(base);
  if (existingDb) return raw;

  if (base.endsWith('/')) {
    return `${base}${encodedDb}${query}`;
  }

  return `${base}/${encodedDb}${query}`;
}

function getDatabaseNameFromUri(rawUri) {
  const raw = String(rawUri || '').trim();
  if (!raw) return '';
  const qIdx = raw.indexOf('?');
  const base = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const segment = existingDbSegment(base);
  if (segment) return segment.split('/')[0];
  return normalizeDbName(process.env.MONGODB_DB_NAME || 'QIPP');
}

module.exports = {
  getMongoUri,
  resolveMongoUri,
  normalizeDbName,
  existingDbSegment,
  getDatabaseNameFromUri,
};
