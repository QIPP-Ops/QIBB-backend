const crypto = require('crypto');
const path = require('path');
const { getR2Config, isR2Configured } = require('../config/r2');
const { isAllowedFile } = require('./chatFileService');

const SAFETY_MAX_MB = parseInt(process.env.SAFETY_MAX_FILE_MB || '50', 10);
const SAFETY_MAX_BYTES = Math.max(1, SAFETY_MAX_MB) * 1024 * 1024;

let s3Client = null;

function loadAwsSdk() {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return { S3Client, PutObjectCommand, GetObjectCommand, getSignedUrl };
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

function buildObjectKey(caseNumber, userId, fileName) {
  const safe = sanitizeFileName(fileName);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const caseSlug = String(caseNumber || 'draft').replace(/[^a-zA-Z0-9-]/g, '_');
  return `safety/${caseSlug}/${userId}/${stamp}-${rand}-${safe}`;
}

function fileToBase64DataUrl(file) {
  const mime = file.mimetype || 'application/octet-stream';
  const b64 = file.buffer.toString('base64');
  return `data:${mime};base64,${b64}`;
}

async function uploadSafetyFile({ caseNumber, userId, file }) {
  if (!file || !file.buffer) {
    throw Object.assign(new Error('No file provided.'), { status: 400 });
  }
  if (file.size > SAFETY_MAX_BYTES) {
    throw Object.assign(new Error(`File exceeds ${SAFETY_MAX_MB} MB limit.`), { status: 413 });
  }
  if (!isAllowedFile(file)) {
    throw Object.assign(new Error('File type not allowed.'), { status: 415 });
  }

  const fileName = sanitizeFileName(file.originalname);
  const mimeType = file.mimetype || 'application/octet-stream';

  if (isR2Configured()) {
    const cfg = getR2Config();
    const key = buildObjectKey(caseNumber, userId, file.originalname);
    const { PutObjectCommand } = loadAwsSdk();
    await getClient().send(
      new PutObjectCommand({
        Bucket: cfg.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: mimeType,
      })
    );
    let url = '';
    if (cfg.publicUrl) {
      url = `${cfg.publicUrl}/${key}`;
    } else {
      const { GetObjectCommand, getSignedUrl } = loadAwsSdk();
      url = await getSignedUrl(
        getClient(),
        new GetObjectCommand({ Bucket: cfg.bucketName, Key: key }),
        { expiresIn: 3600 * 24 * 7 }
      );
    }
    return {
      storageKey: key,
      url,
      fileName,
      mimeType,
      sizeBytes: file.size,
      storage: 'r2',
    };
  }

  return {
    storageKey: '',
    url: fileToBase64DataUrl(file),
    fileName,
    mimeType,
    sizeBytes: file.size,
    storage: 'base64',
  };
}

module.exports = {
  uploadSafetyFile,
  SAFETY_MAX_BYTES,
  SAFETY_MAX_MB,
};
