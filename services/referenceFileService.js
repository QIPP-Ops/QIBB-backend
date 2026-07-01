const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getR2Config, isR2Configured } = require('../config/r2');

const REFERENCE_MAX_MB = parseInt(process.env.REFERENCE_MAX_FILE_MB || '25', 10);
const REFERENCE_MAX_BYTES = Math.max(1, REFERENCE_MAX_MB) * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);

const LOCAL_ROOT = path.join(__dirname, '../uploads/references');

let s3Client = null;

function loadAwsSdk() {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, getSignedUrl };
}

function getClient() {
  if (s3Client) return s3Client;
  const { S3Client } = loadAwsSdk();
  const cfg = getR2Config();
  s3Client = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return s3Client;
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || 'file'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
}

function isAllowedReferenceFile(file) {
  if (!file) return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true;
  const mime = String(file.mimetype || '').toLowerCase();
  return (
    mime === 'application/pdf'
    || mime === 'application/msword'
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function buildObjectKey(itemId, fileName) {
  const safe = sanitizeFileName(fileName);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `references/${itemId}/${stamp}-${rand}-${safe}`;
}

function mongoFileKey(itemId) {
  return `mongo:${itemId}:file`;
}

function localFileKey(itemId, fileName) {
  return `local:${itemId}/${sanitizeFileName(fileName)}`;
}

function ensureLocalDir(itemId) {
  const dir = path.join(LOCAL_ROOT, String(itemId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readLocalFile(relPath) {
  const filePath = path.join(LOCAL_ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error('Reference file not found'), { status: 404 });
  }
  return fs.readFileSync(filePath);
}

function deleteLocalFiles(itemId) {
  const dir = path.join(LOCAL_ROOT, String(itemId));
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function buildFileUrl(itemId) {
  return `/api/training/references/files/${itemId}`;
}

async function uploadReferenceFile({ itemId, file }) {
  if (!itemId) {
    throw Object.assign(new Error('Item id is required.'), { status: 400 });
  }
  if (!file || !file.buffer) {
    throw Object.assign(new Error('No file provided.'), { status: 400 });
  }
  if (file.size > REFERENCE_MAX_BYTES) {
    throw Object.assign(
      new Error(`File exceeds ${REFERENCE_MAX_MB} MB limit.`),
      { status: 413 }
    );
  }
  if (!isAllowedReferenceFile(file)) {
    throw Object.assign(
      new Error('File type not allowed. Use PDF, DOC, or DOCX.'),
      { status: 415 }
    );
  }

  const fileName = sanitizeFileName(file.originalname);
  const mimeType = file.mimetype || 'application/octet-stream';
  const fileUrl = buildFileUrl(itemId);

  if (isR2Configured()) {
    const cfg = getR2Config();
    const key = buildObjectKey(itemId, file.originalname);
    const { PutObjectCommand } = loadAwsSdk();
    await getClient().send(
      new PutObjectCommand({
        Bucket: cfg.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: mimeType,
      })
    );
    return {
      storageKey: key,
      fileUrl,
      fileName,
      mimeType,
      fileData: null,
      storage: 'r2',
    };
  }

  const storageKey = mongoFileKey(itemId);
  return {
    storageKey,
    fileUrl,
    fileName,
    mimeType,
    fileData: file.buffer,
    storage: 'mongo',
  };
}

async function readReferenceFile({ storageKey, fileData }) {
  if (!storageKey && !fileData?.length) {
    throw Object.assign(new Error('Reference file not available'), { status: 404 });
  }

  if (fileData?.length) {
    return Buffer.from(fileData);
  }

  if (storageKey.startsWith('mongo:')) {
    throw Object.assign(new Error('Reference file not found'), { status: 404 });
  }

  if (storageKey.startsWith('local:')) {
    return readLocalFile(storageKey.slice(6));
  }

  if (isR2Configured()) {
    const cfg = getR2Config();
    const { GetObjectCommand } = loadAwsSdk();
    const response = await getClient().send(
      new GetObjectCommand({ Bucket: cfg.bucketName, Key: storageKey })
    );
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  throw Object.assign(new Error('Reference file not found'), { status: 404 });
}

async function deleteReferenceFile({ storageKey }) {
  if (!storageKey) return;

  if (storageKey.startsWith('local:')) {
    const itemId = storageKey.slice(6).split('/')[0];
    if (itemId) deleteLocalFiles(itemId);
    return;
  }

  if (storageKey.startsWith('mongo:')) {
    return;
  }

  if (isR2Configured()) {
    const cfg = getR2Config();
    const { DeleteObjectCommand } = loadAwsSdk();
    await getClient().send(
      new DeleteObjectCommand({ Bucket: cfg.bucketName, Key: storageKey })
    );
  }
}

module.exports = {
  uploadReferenceFile,
  readReferenceFile,
  deleteReferenceFile,
  isAllowedReferenceFile,
  buildFileUrl,
  REFERENCE_MAX_BYTES,
  REFERENCE_MAX_MB,
  ensureLocalDir,
  readLocalFile,
  deleteLocalFiles,
  mongoFileKey,
  localFileKey,
};
