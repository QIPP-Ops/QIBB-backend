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

function sanitizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((node, index) => ({
      empId: String(node?.empId || '').trim(),
      parentEmpId: String(node?.parentEmpId || '').trim(),
      x: Number.isFinite(Number(node?.x)) ? Number(node.x) : 0,
      y: Number.isFinite(Number(node?.y)) ? Number(node.y) : 0,
      order: Number.isFinite(Number(node?.order)) ? Number(node.order) : index,
    }))
    .filter((node) => node.empId);
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
      return res.json({ crewId, manual: false, nodes: [] });
    }
    res.json({
      crewId: doc.crewId,
      manual: Boolean(doc.manual),
      nodes: doc.nodes || [],
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

    const nodes = sanitizeNodes(req.body?.nodes);
    const manual = req.body?.manual !== false;
    const actor = await loadActor(req);

    const before = await OrgLayout.findOne({ crewId }).lean();
    const doc = await OrgLayout.findOneAndUpdate(
      { crewId },
      {
        $set: {
          crewId,
          manual,
          nodes,
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
      manual: Boolean(doc.manual),
      nodes: doc.nodes || [],
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

    res.json({ crewId, manual: false, nodes: [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
