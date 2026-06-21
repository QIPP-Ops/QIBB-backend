const crypto = require('crypto');
const path = require('path');
const { getR2Config, isR2Configured } = require('../config/r2');

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip', '.rar', '.7z', '.tar', '.gz',
  '.mp4', '.mov', '.mp3', '.wav', '.json', '.xml',
]);

let s3Client = null;

function loadAwsSdk() {
  // Lazy load so Jest and cold starts without R2 deps do not fail at require time.
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

function isAllowedFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext && ALLOWED_EXTENSIONS.has(ext)) return true;
  const mime = String(file.mimetype || '').toLowerCase();
  return mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')
    || mime.includes('pdf') || mime.includes('officedocument') || mime.includes('msword')
    || mime.includes('spreadsheet') || mime.includes('presentation') || mime.includes('zip')
    || mime.includes('text/') || mime.includes('json') || mime.includes('xml');
}

function buildObjectKey(roomId, userId, fileName) {
  const safe = sanitizeFileName(fileName);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `rooms/${roomId}/${userId}/${stamp}-${rand}-${safe}`;
}

async function uploadChatFile({ roomId, userId, file }) {
  if (!isR2Configured()) {
    throw Object.assign(new Error('File storage is not configured.'), { status: 503 });
  }
  const cfg = getR2Config();
  if (!file || !file.buffer) {
    throw Object.assign(new Error('No file provided.'), { status: 400 });
  }
  if (file.size > cfg.maxFileBytes) {
    throw Object.assign(new Error(`File exceeds ${cfg.maxFileBytes / (1024 * 1024)} MB limit.`), { status: 413 });
  }
  if (!isAllowedFile(file)) {
    throw Object.assign(new Error('File type not allowed.'), { status: 415 });
  }
  const key = buildObjectKey(roomId, userId, file.originalname);
  const { PutObjectCommand } = loadAwsSdk();
  await getClient().send(
    new PutObjectCommand({
      Bucket: cfg.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
    })
  );
  return {
    key,
    fileName: sanitizeFileName(file.originalname),
    mimeType: file.mimetype || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const cfg = getR2Config();
  if (cfg.publicUrl) {
    return `${cfg.publicUrl}/${key}`;
  }
  const { GetObjectCommand, getSignedUrl } = loadAwsSdk();
  const command = new GetObjectCommand({ Bucket: cfg.bucketName, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn });
}

module.exports = {
  uploadChatFile,
  getSignedDownloadUrl,
  isAllowedFile,
  isR2Configured,
};
