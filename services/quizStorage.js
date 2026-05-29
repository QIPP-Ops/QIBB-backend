const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');

const LOCAL_ROOT = path.join(__dirname, '../data/quizzes');
const BLOB_PREFIX = 'quizzes';

function ensureLocalDir(quizId) {
  const dir = path.join(LOCAL_ROOT, String(quizId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function blobConfigured() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const sas = process.env.BLOB_SAS_URL?.trim();
  const account = process.env.BLOB_STORAGE_ACCOUNT?.trim();
  const token = process.env.BLOB_SAS_TOKEN?.trim();
  return Boolean(conn || sas || (account && token));
}

function getBlobContainer() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  const containerName = process.env.QUIZ_BLOB_CONTAINER || process.env.BLOB_CONTAINER_NAME || 'report';
  if (conn) {
    const service = BlobServiceClient.fromConnectionString(conn);
    return service.getContainerClient(containerName);
  }
  const sasUrl = process.env.BLOB_SAS_URL?.trim();
  if (sasUrl) {
    try {
      const parsed = new URL(sasUrl);
      const seg = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
      if (seg === containerName) {
        const { ContainerClient } = require('@azure/storage-blob');
        return new ContainerClient(sasUrl);
      }
    } catch {
      /* account SAS */
    }
    const service = new BlobServiceClient(sasUrl);
    return service.getContainerClient(containerName);
  }
  const account = process.env.BLOB_STORAGE_ACCOUNT?.trim();
  const token = process.env.BLOB_SAS_TOKEN?.trim();
  if (account && token) {
    const t = token.startsWith('?') ? token : `?${token}`;
    const url = `https://${account}.blob.core.windows.net/${containerName}${t}`;
    const service = new BlobServiceClient(url);
    return service.getContainerClient(containerName);
  }
  throw new Error('Blob storage not configured');
}

async function saveQuizHtml(quizId, buffer) {
  if (blobConfigured()) {
    const container = getBlobContainer();
    const blobName = `${BLOB_PREFIX}/${quizId}/content.html`;
    const block = container.getBlockBlobClient(blobName);
    await block.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'text/html; charset=utf-8' },
    });
    return `blob:${blobName}`;
  }
  const dir = ensureLocalDir(quizId);
  const filePath = path.join(dir, 'content.html');
  fs.writeFileSync(filePath, buffer);
  return `local:${quizId}/content.html`;
}

async function savePrizeImage(quizId, buffer, mimeType) {
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/webp'
        ? 'webp'
        : mimeType === 'image/gif'
          ? 'gif'
          : 'jpg';
  if (blobConfigured()) {
    const container = getBlobContainer();
    const blobName = `${BLOB_PREFIX}/${quizId}/prize.${ext}`;
    const block = container.getBlockBlobClient(blobName);
    await block.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: mimeType || 'image/jpeg' },
    });
    return `blob:${blobName}`;
  }
  const dir = ensureLocalDir(quizId);
  const filePath = path.join(dir, `prize.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return `local:${quizId}/prize.${ext}`;
}

async function readStorage(key) {
  if (!key) throw new Error('Missing storage key');
  if (key.startsWith('blob:')) {
    const blobName = key.slice(5);
    const container = getBlobContainer();
    const block = container.getBlockBlobClient(blobName);
    const dl = await block.downloadToBuffer();
    return dl;
  }
  if (key.startsWith('local:')) {
    const rel = key.slice(6);
    const filePath = path.join(LOCAL_ROOT, rel);
    if (!fs.existsSync(filePath)) throw new Error('Quiz file not found');
    return fs.readFileSync(filePath);
  }
  throw new Error('Unknown storage key');
}

async function deleteQuizFiles(quizId, keys = []) {
  if (blobConfigured()) {
    try {
      const container = getBlobContainer();
      for (const key of keys) {
        if (!key?.startsWith('blob:')) continue;
        await container.getBlockBlobClient(key.slice(5)).deleteIfExists();
      }
      const prefix = `${BLOB_PREFIX}/${quizId}/`;
      for await (const item of container.listBlobsFlat({ prefix })) {
        if (item.name) await container.getBlockBlobClient(item.name).deleteIfExists();
      }
    } catch (err) {
      console.warn('[quiz-storage] blob delete:', err.message);
    }
  }
  const localDir = path.join(LOCAL_ROOT, String(quizId));
  if (fs.existsSync(localDir)) {
    fs.rmSync(localDir, { recursive: true, force: true });
  }
}

/** Serve prize image bytes with mime for authenticated routes. */
async function readPrizeImage(key) {
  return readStorage(key);
}

module.exports = {
  saveQuizHtml,
  savePrizeImage,
  readStorage,
  readPrizeImage,
  deleteQuizFiles,
  blobConfigured,
};
