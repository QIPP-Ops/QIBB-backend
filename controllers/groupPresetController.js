const AdminConfig = require('../models/AdminConfig');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');
const { isSuperAdmin } = require('../middleware/superAdmin');
const { notifyPersonnelChanges } = require('../services/personnelNotifyService');

const DEFAULT_GROUP_PRESETS = [
  'GR #1 - 2',
  'GR #3 - 4',
  'GR #5 - 6',
  'BOP',
  'LAB',
  'Operation',
  'PTW',
];

async function getOrCreateConfig() {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = new AdminConfig();
    await config.save();
  }
  if (!Array.isArray(config.groupPresets) || !config.groupPresets.length) {
    config.groupPresets = [...DEFAULT_GROUP_PRESETS];
    await config.save();
  }
  return config;
}

exports.listGroupPresets = async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json({ presets: config.groupPresets || DEFAULT_GROUP_PRESETS });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.saveGroupPresets = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the super administrator may edit group presets.' });
    }
    const presets = Array.isArray(req.body?.presets) ? req.body.presets : null;
    if (!presets?.length) {
      return res.status(400).json({ message: 'presets array is required.' });
    }
    const cleaned = [...new Set(presets.map((p) => String(p || '').trim()).filter(Boolean))];
    const config = await getOrCreateConfig();
    config.groupPresets = cleaned;
    await config.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.GROUP_PRESETS_UPDATED,
      targetType: 'admin_config',
      targetId: String(config._id),
      targetName: 'groupPresets',
      after: { presets: cleaned },
      req,
    });

    res.json({ presets: cleaned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.assignEmployeeGroup = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    const AdminUser = require('../models/AdminUser');
    const empId = String(req.params.empId || '').trim();
    const groupLabel = String(req.body?.groupLabel || '').trim();
    if (!empId) return res.status(400).json({ message: 'empId is required.' });

    const target = await AdminUser.findOne({ empId });
    if (!target) return res.status(404).json({ message: 'Employee not found.' });

    const actor = await AdminUser.findById(req.user?.id).select('crew role name').lean();
    if (!isSuperAdmin(req)) {
      const actorCrew = String(actor?.crew || '').trim();
      if (actorCrew && target.crew && actorCrew !== target.crew) {
        return res.status(403).json({ message: 'Shift in Charge may only assign groups within their crew.' });
      }
    }

    const before = target.opsGroupLabel || '';
    target.opsGroupLabel = groupLabel;
    await target.save();

    if (req.body?.notify !== false && groupLabel !== before) {
      await notifyPersonnelChanges({
        user: target,
        actor: req.user,
        before: { opsGroupLabel: before },
        after: { opsGroupLabel: groupLabel },
        fields: ['opsGroupLabel'],
        req,
      }).catch(() => {});
    }

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.EMPLOYEE_GROUP_ASSIGNED,
      targetType: 'employee',
      targetId: empId,
      targetName: target.name,
      before: { opsGroupLabel: before },
      after: { opsGroupLabel: groupLabel },
      req,
    });

    res.json({ success: true, empId, opsGroupLabel: groupLabel });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
