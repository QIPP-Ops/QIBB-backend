const path = require('path');
const crypto = require('crypto');
const { getSetting, setSetting } = require('./systemSettingsService');
const { getR2Config, isR2Configured } = require('../config/r2');
const {
  isValidPortalBackgroundSectionKey,
  isAllowedBackgroundImageUrl,
  normalizeBackgroundEntry,
  normalizeStyleFields,
  isValidObjectFit,
} = require('../constants/portalBackgroundSections');

const PORTAL_BACKGROUNDS_KEY = 'portalBackgrounds';
const PORTAL_BG_UPLOADS_KEY = 'portalBackgroundUploads';
const PORTAL_BG_MAX_MB = parseInt(process.env.PORTAL_BG_MAX_FILE_MB || '3', 10);
const PORTAL_BG_MAX_BYTES = Math.max(1, PORTAL_BG_MAX_MB) * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

let s3Client = null;

function loadAwsSdk() {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  } = require('@aws-sdk/client-s3');
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

function entryImageUrl(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  return String(entry.imageUrl || '').trim();
}

async function getPortalBackgroundsMap() {
  const value = await getSetting(PORTAL_BACKGROUNDS_KEY, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isValidPortalBackgroundSectionKey(key)) continue;
    const normalized = normalizeBackgroundEntry(raw);
    if (normalized) out[key] = normalized;
  }
  return out;
}

async function setPortalBackground(sectionKey, payload) {
  if (!isValidPortalBackgroundSectionKey(sectionKey)) {
    throw Object.assign(new Error('Invalid portal background section.'), { status: 400 });
  }

  const imageUrl = String(payload?.imageUrl ?? payload?.url ?? '').trim();
  if (!isAllowedBackgroundImageUrl(imageUrl)) {
    throw Object.assign(new Error('Image URL or path is not allowed.'), { status: 400 });
  }

  const entry = { imageUrl };
  const style = normalizeStyleFields(payload);
  if (style.objectFit && !isValidObjectFit(style.objectFit)) {
    throw Object.assign(new Error('Invalid objectFit value.'), { status: 400 });
  }
  Object.assign(entry, style);

  const map = await getPortalBackgroundsMap();
  map[sectionKey] = entry;
  await setSetting(PORTAL_BACKGROUNDS_KEY, map);
  return { sectionKey, ...entry };
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

function normalizeUploadEntry(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const url = String(item.url || '').trim();
  if (!id || !url || !isAllowedBackgroundImageUrl(url)) return null;
  return {
    id,
    url,
    fileName: String(item.fileName || 'upload').trim() || 'upload',
    mimeType: String(item.mimeType || 'image/jpeg').trim() || 'image/jpeg',
    sizeBytes: Number(item.sizeBytes) || 0,
    storage: item.storage === 'r2' ? 'r2' : 'base64',
    r2Key: item.r2Key ? String(item.r2Key).trim() : undefined,
    uploadedAt: item.uploadedAt || null,
    uploadedBy: item.uploadedBy ? String(item.uploadedBy) : undefined,
  };
}

async function getPortalBackgroundUploads() {
  const value = await getSetting(PORTAL_BG_UPLOADS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.map(normalizeUploadEntry).filter(Boolean);
}

async function addPortalBackgroundUpload(entry) {
  const normalized = normalizeUploadEntry(entry);
  if (!normalized) {
    throw Object.assign(new Error('Invalid upload entry.'), { status: 400 });
  }
  const list = await getPortalBackgroundUploads();
  list.unshift(normalized);
  await setSetting(PORTAL_BG_UPLOADS_KEY, list);
  return normalized;
}

async function clearSectionsUsingImageUrl(imageUrl) {
  const target = String(imageUrl || '').trim();
  if (!target) return [];
  const map = await getPortalBackgroundsMap();
  const clearedSections = [];
  for (const [key, entry] of Object.entries(map)) {
    if (entryImageUrl(entry) === target) {
      delete map[key];
      clearedSections.push(key);
    }
  }
  if (clearedSections.length) {
    await setSetting(PORTAL_BACKGROUNDS_KEY, map);
  }
  return clearedSections;
}

async function deletePortalBackgroundUpload(uploadId) {
  const id = String(uploadId || '').trim();
  if (!id) {
    throw Object.assign(new Error('Upload id is required.'), { status: 400 });
  }
  const list = await getPortalBackgroundUploads();
  const index = list.findIndex((item) => item.id === id);
  if (index === -1) {
    throw Object.assign(new Error('Upload not found.'), { status: 404 });
  }
  const [removed] = list.splice(index, 1);

  if (removed.storage === 'r2' && removed.r2Key && isR2Configured()) {
    const cfg = getR2Config();
    const { DeleteObjectCommand } = loadAwsSdk();
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: cfg.bucketName,
        Key: removed.r2Key,
      })
    );
  }

  await setSetting(PORTAL_BG_UPLOADS_KEY, list);
  const clearedSections = await clearSectionsUsingImageUrl(removed.url);

  return {
    deleted: true,
    uploadId: id,
    url: removed.url,
    clearedSections,
  };
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
  const uploadId = crypto.randomBytes(8).toString('hex');
  const uploadedAt = new Date().toISOString();

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
    return addPortalBackgroundUpload({
      id: uploadId,
      url,
      fileName,
      mimeType,
      sizeBytes: file.size,
      storage: 'r2',
      r2Key: key,
      uploadedAt,
      uploadedBy: userId,
    });
  }

  return addPortalBackgroundUpload({
    id: uploadId,
    url: fileToBase64DataUrl(file),
    fileName,
    mimeType,
    sizeBytes: file.size,
    storage: 'base64',
    uploadedAt,
    uploadedBy: userId,
  });
}

module.exports = {
  PORTAL_BACKGROUNDS_KEY,
  PORTAL_BG_UPLOADS_KEY,
  PORTAL_BG_MAX_BYTES,
  PORTAL_BG_MAX_MB,
  getPortalBackgroundsMap,
  getPortalBackgroundUploads,
  setPortalBackground,
  clearPortalBackground,
  uploadPortalBackgroundImage,
  deletePortalBackgroundUpload,
};
