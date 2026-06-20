const OrgLayout = require('../models/OrgLayout');
const AdminUser = require('../models/AdminUser');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { isSuperAdmin, hasPortalAdminAccess } = require('../middleware/superAdmin');
const { resolveCrewOpsLayoutNodes } = require('../utils/orgLayoutSanitize');

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

function crewMatchQuery(crewId) {
  if (crewId === 'General') {
    return { $or: [{ crew: 'General' }, { crew: 'G' }, { crew: /^crew\s*general$/i }] };
  }
  if (crewId === 'plant') return {};
  return {
    $or: [
      { crew: crewId },
      { crew: `Crew ${crewId}` },
      { crew: new RegExp(`^crew\\s*${crewId}$`, 'i') },
    ],
  };
}

async function memberByIdForCrew(crewId) {
  if (!crewId || crewId === 'plant' || crewId === 'General') return new Map();
  const rows = await AdminUser.find(crewMatchQuery(crewId))
    .select('empId role crew name')
    .lean();
  const map = new Map();
  rows.forEach((row) => {
    const id = String(row.empId || '').trim();
    if (id) map.set(id, row);
  });
  return map;
}

async function sanitizeCrewOpsNodes(crewId, nodes) {
  if (!nodes?.length || crewId === 'General' || crewId === 'plant') return nodes;
  const memberById = await memberByIdForCrew(crewId);
  if (!memberById.size) return nodes;
  return resolveCrewOpsLayoutNodes(memberById, nodes);
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
    const nodes = await sanitizeCrewOpsNodes(crewId, doc.nodes || []);
    res.json({
      crewId: doc.crewId,
      manual: Boolean(doc.manual),
      nodes,
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

    const nodes = await sanitizeCrewOpsNodes(crewId, sanitizeNodes(req.body?.nodes));
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
