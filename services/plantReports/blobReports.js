const path = require('path');
const { BlobServiceClient, ContainerClient } = require('@azure/storage-blob');
const { classifyReport } = require('./excelUtils');

const EXCEL_EXT = new Set(['.xlsx', '.xlsm', '.xls']);
const CONTAINER = process.env.BLOB_CONTAINER_NAME || 'report';

function resolveBlobSasUrl() {
  const direct = process.env.BLOB_SAS_URL?.trim();
  if (direct) return direct;
  const account = process.env.BLOB_STORAGE_ACCOUNT?.trim();
  const sas = process.env.BLOB_SAS_TOKEN?.trim();
  const container = process.env.BLOB_CONTAINER_NAME || CONTAINER;
  if (account && sas) {
    const token = sas.startsWith('?') ? sas : `?${sas}`;
    return `https://${account}.blob.core.windows.net/${container}${token}`;
  }
  return '';
}

/**
 * Azure portal often provides a container SAS like:
 *   https://account.blob.core.windows.net/report?sv=...
 * Using BlobServiceClient + getContainerClient('report') on that URL fails (404).
 * Detect container-in-path SAS and use ContainerClient directly.
 */
function getReportContainerClient() {
  const containerName = process.env.BLOB_CONTAINER_NAME || CONTAINER;

  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (conn) {
    const service = BlobServiceClient.fromConnectionString(conn);
    return {
      container: service.getContainerClient(containerName),
      accessMode: 'connection_string',
    };
  }

  const sasUrl = resolveBlobSasUrl();
  if (!sasUrl) {
    throw new Error(
      'Configure AZURE_STORAGE_CONNECTION_STRING, BLOB_SAS_URL (container or account SAS), or BLOB_STORAGE_ACCOUNT + BLOB_SAS_TOKEN'
    );
  }

  try {
    const parsed = new URL(sasUrl);
    const pathSeg = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const firstSegment = pathSeg.split('/').filter(Boolean)[0];
    if (firstSegment && (firstSegment === containerName || pathSeg === containerName)) {
      return { container: new ContainerClient(sasUrl), accessMode: 'container_sas' };
    }
  } catch {
    /* fall through to account SAS */
  }

  const service = new BlobServiceClient(sasUrl);
  return {
    container: service.getContainerClient(containerName),
    accessMode: 'account_sas',
  };
}

function isExcelBlob(name) {
  return EXCEL_EXT.has(path.extname(name).toLowerCase());
}

/**
 * List Excel blobs in container `report`, newest first.
 */
async function listReportBlobs(options = {}) {
  const defaultAge = parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10);
  const { maxAgeDays = defaultAge, prefix = '' } = options;
  const { container } = getReportContainerClient();
  const minTime = Date.now() - maxAgeDays * 86400000;

  const blobs = [];
  for await (const item of container.listBlobsFlat({ prefix: prefix || undefined })) {
    if (!item.name || !isExcelBlob(item.name)) continue;
    const kind = classifyReport(path.basename(item.name));
    if (kind === 'other') continue;
    const modified = item.properties?.lastModified
      ? new Date(item.properties.lastModified).getTime()
      : 0;
    if (modified > 0 && modified < minTime) continue;
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
  const timeoutMs = parseInt(process.env.BLOB_DOWNLOAD_TIMEOUT_MS || '120000', 10);
  const { container } = getReportContainerClient();

  const downloadTask = (async () => {
    const res = await container.getBlobClient(blobName).download();
    const chunks = [];
    for await (const chunk of res.readableStreamBody) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  })();

  let timer;
  const timeoutTask = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Blob download timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([downloadTask, timeoutTask]);
  } finally {
    clearTimeout(timer);
  }
}

function blobIngestConfigured() {
  return Boolean(
    process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || resolveBlobSasUrl()
  );
}

function getBlobAccessInfo() {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING?.trim()) {
    return { configured: true, mode: 'connection_string', container: CONTAINER };
  }
  const sas = resolveBlobSasUrl();
  if (!sas) return { configured: false, mode: 'none', container: CONTAINER };
  try {
    const parsed = new URL(sas);
    const pathSeg = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const first = pathSeg.split('/').filter(Boolean)[0];
    if (first === CONTAINER) {
      return { configured: true, mode: 'container_sas', container: CONTAINER };
    }
  } catch {
    /* ignore */
  }
  return { configured: true, mode: 'account_sas', container: CONTAINER };
}

module.exports = {
  CONTAINER,
  listReportBlobs,
  downloadBlobBuffer,
  blobIngestConfigured,
  resolveBlobSasUrl,
  getBlobAccessInfo,
  getReportContainerClient,
};
