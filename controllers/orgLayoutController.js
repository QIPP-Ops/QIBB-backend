const OrgLayout = require('../models/OrgLayout');
const AdminUser = require('../models/AdminUser');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { isSuperAdmin, hasPortalAdminAccess } = require('../middleware/superAdmin');

const VALID_CREW_IDS = new Set(['A', 'B', 'C', 'D', 'General', 'S', 'plant']);

function normalizeCrewId(raw) {
  const id = String(raw || '').trim();
  if (!id) return '';
  const upper = id.toUpperCase();
  if (upper === 'GENERAL' || upper === 'G') return 'General';
  if (upper === 'PLANT') return 'plant';
  if (upper.startsWith('CREW')) {
    const letter = upper.replace(/^CREW\s*/i, '').trim();
    if (letter === 'GENERAL' || letter === 'G') return 'General';
    if (/^[A-F]$/.test(letter)) return letter;
  }
  if (/^[A-F]$/.test(upper)) return upper;
  if (VALID_CREW_IDS.has(id)) return id;
  return id;
}

function sanitizeSlotValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const empId = String(value).trim();
    return empId || null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const empIdRaw = value.empId;
    let empId = null;
    if (empIdRaw !== null && empIdRaw !== undefined && empIdRaw !== '') {
      empId = String(empIdRaw).trim() || null;
    }
    const role = value.role != null ? String(value.role).trim() : '';
    const groupLabel = value.groupLabel != null ? String(value.groupLabel).trim() : '';
    const parentSlotKey = value.parentSlotKey != null ? String(value.parentSlotKey).trim() : '';
    const directionRaw = value.direction != null ? String(value.direction).trim() : '';
    const direction =
      directionRaw === 'above' || directionRaw === 'below' || directionRaw === 'left' || directionRaw === 'right'
        ? directionRaw
        : '';
    const out = { empId };
    if (role) out.role = role;
    if (groupLabel) out.groupLabel = groupLabel;
    if (parentSlotKey) out.parentSlotKey = parentSlotKey;
    if (direction) out.direction = direction;
    return out;
  }
  return null;
}

function sanitizeSlots(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const slotKey = String(key || '').trim();
    if (!slotKey) continue;
    out[slotKey] = sanitizeSlotValue(value);
  }
  return out;
}

async function loadActor(req) {
  if (!req.user?.id) return null;
  return AdminUser.findById(req.user.id).select('-passwordHash');
}

exports.getOrgLayout = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const crewId = normalizeCrewId(req.params.crewId);
    if (!crewId) return res.status(400).json({ message: 'Invalid crew id.' });

    const doc = await OrgLayout.findOne({ crewId }).lean();
    if (!doc) {
      return res.json({ crewId, slots: {} });
    }

    res.json({
      crewId: doc.crewId,
      slots: sanitizeSlots(doc.slots),
      updatedAt: doc.updatedAt,
      updatedByEmail: doc.updatedByEmail || '',
      updatedByName: doc.updatedByName || '',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.patchOrgLayout = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        message: 'Only the designated super administrator may edit org layouts.',
      });
    }
    const crewId = normalizeCrewId(req.params.crewId);
    if (!crewId) return res.status(400).json({ message: 'Invalid crew id.' });

    const slots = sanitizeSlots(req.body?.slots);
    const actor = await loadActor(req);

    const before = await OrgLayout.findOne({ crewId }).lean();
    const doc = await OrgLayout.findOneAndUpdate(
      { crewId },
      {
        $set: {
          crewId,
          slots,
          updatedByEmail: actor?.email || req.user?.email || '',
          updatedByName: actor?.name || req.user?.email || 'Super Admin',
        },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    await logAction({
      actor,
      action: AUDIT_ACTIONS.ORG_LAYOUT_UPDATED,
      targetType: 'org_layout',
      targetId: crewId,
      targetName: crewId === 'plant' ? 'Plant org' : `Crew ${crewId}`,
      before,
      after: doc,
      req,
    });

    res.json({
      crewId: doc.crewId,
      slots: sanitizeSlots(doc.slots),
      updatedAt: doc.updatedAt,
      updatedByEmail: doc.updatedByEmail || '',
      updatedByName: doc.updatedByName || '',
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.resetOrgLayout = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({
        message: 'Only the designated super administrator may reset org layouts.',
      });
    }
    const crewId = normalizeCrewId(req.params.crewId);
    if (!crewId) return res.status(400).json({ message: 'Invalid crew id.' });

    const actor = await loadActor(req);
    const before = await OrgLayout.findOne({ crewId }).lean();
    await OrgLayout.deleteOne({ crewId });

    await logAction({
      actor,
      action: AUDIT_ACTIONS.ORG_LAYOUT_RESET,
      targetType: 'org_layout',
      targetId: crewId,
      targetName: crewId === 'plant' ? 'Plant org' : `Crew ${crewId}`,
      before,
      after: null,
      req,
    });

    res.json({ crewId, slots: {} });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
