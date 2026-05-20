function redactPassword(uri) {
  if (!uri || typeof uri !== 'string') return '(missing)';
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@');
  } catch {
    return '(unparseable)';
  }
}

function parseMongoUri(uri) {
  const out = {
    rawRedacted: redactPassword(uri),
    host: null,
    database: null,
    isCosmos: false,
    hints: [],
  };
  if (!uri || typeof uri !== 'string') {
    out.hints.push('MONGODB_URI is not set.');
    return out;
  }
  try {
    const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    out.host = u.hostname || null;
    const pathDb = (u.pathname || '').replace(/^\//, '').split('?')[0];
    out.database = pathDb || null;
    out.isCosmos = (out.host || '').toLowerCase().includes('cosmos.azure.com');
    if (out.isCosmos) {
      out.hints.push(
        'Cosmos: database name in the URI path must match your Cosmos database. Wrong path causes "does not represent any resource".'
      );
    }
    if (!out.database) {
      out.hints.push('No database in URI — add /yourDbName before query params.');
    }
  } catch {
    out.hints.push('Could not parse MONGODB_URI.');
  }
  return out;
}

function classifyMongoError(err) {
  const msg = err?.message ? String(err.message) : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('does not represent any resource') || lower.includes('requested uri')) {
    return {
      source: 'database',
      summary:
        'Cosmos rejected the request URL — check MONGODB_URI database name (path after host).',
      detail: msg,
    };
  }
  if (lower.includes('authentication failed') || lower.includes('bad auth')) {
    return { source: 'database', summary: 'MongoDB auth failed.', detail: msg };
  }
  return { source: 'database', summary: 'Database error', detail: msg };
}

module.exports = { parseMongoUri, redactPassword, classifyMongoError };
