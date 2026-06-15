/**
 * MongoDB connection URI (Cosmos DB API or MongoDB Atlas).
 * Appends MONGODB_DB_NAME when the URI has no database path (Atlas default is "test").
 */
function getMongoUri() {
  const raw = (process.env.COSMOS_URI || process.env.MONGODB_URI || '').trim();
  if (!raw) return '';

  const dbName = (process.env.MONGODB_DB_NAME || 'QIPP').trim();
  if (!dbName) return raw;

  // mongodb+srv://user:pass@host/  or ...@host/db?options
  const hasDbPath = /mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(raw);
  if (hasDbPath) return raw;

  const separator = raw.includes('?') ? '' : '/';
  if (raw.endsWith('/')) {
    return `${raw}${encodeURIComponent(dbName)}`;
  }
  if (raw.includes('?')) {
    return raw.replace('?', `/${encodeURIComponent(dbName)}?`);
  }
  return `${raw}/${encodeURIComponent(dbName)}`;
}

module.exports = { getMongoUri };
