const { blobIngestConfigured, getBlobAccessInfo } = require('./blobReports');

/** Local folder ingest is dev-only; production uses Azure Blob report container. */
function allowLocalFolderIngest() {
  return process.env.ALLOW_LOCAL_FOLDER_INGEST === '1';
}

function assertBlobIngestConfigured() {
  if (!blobIngestConfigured()) {
    throw new Error(
      'Azure Blob ingest not configured. Set AZURE_STORAGE_CONNECTION_STRING, BLOB_SAS_URL, or BLOB_STORAGE_ACCOUNT + BLOB_SAS_TOKEN.'
    );
  }
}

/**
 * @returns {'blob'|'local'|null}
 */
function resolveIngestSource(options = {}) {
  if (blobIngestConfigured()) return 'blob';
  const root = options.reportsRoot || process.env.PLANT_REPORTS_DIR?.trim();
  if (allowLocalFolderIngest() && root) return 'local';
  return null;
}

function ingestSourceLabel(source) {
  if (source === 'blob') {
    const info = getBlobAccessInfo();
    return `blob:${info.account || 'configured'}/${info.container}`;
  }
  if (source === 'local') {
    return `local:${process.env.PLANT_REPORTS_DIR || ''}`;
  }
  return '';
}

module.exports = {
  allowLocalFolderIngest,
  assertBlobIngestConfigured,
  resolveIngestSource,
  ingestSourceLabel,
  blobIngestConfigured,
};
