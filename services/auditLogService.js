const AuditLog = require('../models/AuditLog');
const { normCrew } = require('../utils/rosterRowSort');

const SENSITIVE_KEYS = [
  'password',
  'passwordhash',
  'token',
  'resettoken',
  'otphash',
  'authorization',
  'secret',
  'apikey',
  'access_token',
  'refresh_token',
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function extractCrewFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  return normCrew(payload.crew || '');
}

function sanitizeValue(input) {
  if (Array.isArray(input)) return input.map(sanitizeValue);
  if (!isObject(input)) return input ?? null;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const normalized = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => normalized.includes(s))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitizeValue(value);
    }
  }
  return out;
}

async function logAction({
  actor,
  action,
  targetType,
  targetId,
  targetName,
  before,
  after,
  req,
}) {
  try {
    const requestActor = req?.user || {};
    const resolvedActor = actor || requestActor;
    const actorEmail = String(resolvedActor?.email || '').trim().toLowerCase();
    const actorCrew = normCrew(resolvedActor?.crew || requestActor?.crew || '');
    const targetCrew =
      extractCrewFromPayload(after) || extractCrewFromPayload(before) || '';
    const actorName =
      String(resolvedActor?.name || resolvedActor?.displayName || resolvedActor?.email || '').trim() || 'System';

    AuditLog.create({
      timestamp: new Date(),
      actorEmail,
      actorCrew,
      actorName,
      action,
      targetType: targetType || '',
      targetId: targetId != null ? String(targetId) : '',
      targetName: targetName || '',
      targetCrew,
      before: sanitizeValue(before),
      after: sanitizeValue(after),
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '',
      userAgent: req?.get ? req.get('user-agent') || '' : req?.headers?.['user-agent'] || '',
    }).catch((error) => {
      console.error('Audit log write failed:', error.message);
    });
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

module.exports = { logAction, sanitizeValue };
