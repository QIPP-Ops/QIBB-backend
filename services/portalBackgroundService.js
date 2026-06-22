const path = require('path');
const crypto = require('crypto');
const { getSetting, setSetting } = require('./systemSettingsService');
const { getR2Config, isR2Configured } = require('../config/r2');
const {
  isValidPortalBackgroundSectionKey,
  isAllowedBackgroundImageUrl,
} = require('../constants/portalBackgroundSections');

const PORTAL_BACKGROUNDS_KEY = 'portalBackgrounds';
const PORTAL_BG_MAX_MB = parseInt(process.env.PORTAL_BG_MAX_FILE_MB || '3', 10);
const PORTAL_BG_MAX_BYTES = Math.max(1, PORTAL_BG_MAX_MB) * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

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

function isAllowedImageFile(file) {
  if (!file) return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext && IMAGE_EXTENSIONS.has(ext)) return true;
  return String(file.mimetype || '').toLowerCase().startsWith('image/');
}

function fileToBase64DataUrl(file) {
  const mime = file.mimetype || 'image/jpeg';
  const b64 = file.buffer.toString('base64');
  return `data:${mime};base64,${b64}`;
}

function buildObjectKey(userId, fileName) {
  const safe = sanitizeFileName(fileName);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `portal-backgrounds/${userId}/${stamp}-${rand}-${safe}`;
}

async function getPortalBackgroundsMap() {
  const value = await getSetting(PORTAL_BACKGROUNDS_KEY, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, url] of Object.entries(value)) {
    if (isValidPortalBackgroundSectionKey(key) && isAllowedBackgroundImageUrl(url)) {
      out[key] = String(url).trim();
    }
  }
  return out;
}

async function setPortalBackground(sectionKey, imageUrl) {
  if (!isValidPortalBackgroundSectionKey(sectionKey)) {
    throw Object.assign(new Error('Invalid portal background section.'), { status: 400 });
  }
  const url = String(imageUrl || '').trim();
  if (!isAllowedBackgroundImageUrl(url)) {
    throw Object.assign(new Error('Image URL or path is not allowed.'), { status: 400 });
  }
  const map = await getPortalBackgroundsMap();
  map[sectionKey] = url;
  await setSetting(PORTAL_BACKGROUNDS_KEY, map);
  return { sectionKey, imageUrl: url };
}

async function clearPortalBackground(sectionKey) {
  if (!isValidPortalBackgroundSectionKey(sectionKey)) {
    throw Object.assign(new Error('Invalid portal background section.'), { status: 400 });
  }
  const map = await getPortalBackgroundsMap();
  delete map[sectionKey];
  await setSetting(PORTAL_BACKGROUNDS_KEY, map);
  return { sectionKey, cleared: true };
}

async function uploadPortalBackgroundImage({ userId, file }) {
  if (!file || !file.buffer) {
    throw Object.assign(new Error('No file provided.'), { status: 400 });
  }
  if (file.size > PORTAL_BG_MAX_BYTES) {
    throw Object.assign(new Error(`Image exceeds ${PORTAL_BG_MAX_MB} MB limit.`), { status: 413 });
  }
  if (!isAllowedImageFile(file)) {
    throw Object.assign(new Error('Only image files are allowed.'), { status: 415 });
  }

  const fileName = sanitizeFileName(file.originalname);
  const mimeType = file.mimetype || 'image/jpeg';

  if (isR2Configured()) {
    const cfg = getR2Config();
    const key = buildObjectKey(userId, file.originalname);
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
        { expiresIn: 3600 * 24 * 365 }
      );
    }
    return { url, fileName, mimeType, sizeBytes: file.size, storage: 'r2' };
  }

  return {
    url: fileToBase64DataUrl(file),
    fileName,
    mimeType,
    sizeBytes: file.size,
    storage: 'base64',
  };
}

module.exports = {
  PORTAL_BACKGROUNDS_KEY,
  PORTAL_BG_MAX_BYTES,
  PORTAL_BG_MAX_MB,
  getPortalBackgroundsMap,
  setPortalBackground,
  clearPortalBackground,
  uploadPortalBackgroundImage,
};
