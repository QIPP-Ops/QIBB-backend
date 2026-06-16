/**
 * MongoDB connection URI (Cosmos DB API or MongoDB Atlas).
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
  if (!raw) return '';

  const dbName = normalizeDbName(process.env.MONGODB_DB_NAME || 'QIPP');
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

module.exports = { getMongoUri, normalizeDbName, existingDbSegment };
