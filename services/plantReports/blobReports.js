const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { classifyReport } = require('./excelUtils');

const EXCEL_EXT = new Set(['.xlsx', '.xlsm', '.xls']);
const CONTAINER = process.env.BLOB_CONTAINER_NAME || 'report';

function getBlobServiceClient() {
  const sasUrl = process.env.BLOB_SAS_URL?.trim();
  if (!sasUrl) {
    throw new Error('BLOB_SAS_URL is not configured');
  }
  return new BlobServiceClient(sasUrl);
}

function isExcelBlob(name) {
  return EXCEL_EXT.has(path.extname(name).toLowerCase());
}

/**
 * List Excel blobs in container `report`, newest first.
 */
async function listReportBlobs(options = {}) {
  const { maxAgeDays = 14, prefix = '' } = options;
  const client = getBlobServiceClient();
  const container = client.getContainerClient(CONTAINER);
  const minTime = Date.now() - maxAgeDays * 86400000;

  const blobs = [];
  for await (const item of container.listBlobsFlat({ prefix: prefix || undefined })) {
    if (!item.name || !isExcelBlob(item.name)) continue;
    const kind = classifyReport(path.basename(item.name));
    if (kind === 'other') continue;
    const modified = item.properties?.lastModified
      ? new Date(item.properties.lastModified).getTime()
      : 0;
    if (modified && modified < minTime) continue;
    blobs.push({
      name: item.name,
      lastModified: item.properties?.lastModified || null,
      size: item.properties?.contentLength || 0,
    });
  }

  blobs.sort((a, b) => {
    const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return tb - ta;
  });

  return blobs;
}

async function downloadBlobBuffer(blobName) {
  const client = getBlobServiceClient();
  const container = client.getContainerClient(CONTAINER);
  const res = await container.getBlobClient(blobName).download();
  const chunks = [];
  for await (const chunk of res.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function blobIngestConfigured() {
  return Boolean(process.env.BLOB_SAS_URL?.trim());
}

module.exports = {
  CONTAINER,
  listReportBlobs,
  downloadBlobBuffer,
  blobIngestConfigured,
};
