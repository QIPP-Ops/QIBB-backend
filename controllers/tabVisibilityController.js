const AdminUser = require('../models/AdminUser');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { isProtectedAccountEmail } = require('../utils/protectedAccounts');
const {
  PORTAL_TAB_KEYS,
  TAB_LABELS,
  mergeTabVisibility,
  resolveTabVisibilityForUser,
  sanitizeTabVisibilityPatch,
} = require('../utils/tabVisibility');

exports.getUserTabVisibility = async (req, res) => {
  try {
    const user = await AdminUser.findById(req.params.id)
      .select('name email tabVisibility')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      tabVisibility: resolveTabVisibilityForUser(user),
      tabKeys: PORTAL_TAB_KEYS,
      tabLabels: TAB_LABELS,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching tab visibility', error: err.message });
  }
};

exports.patchUserTabVisibility = async (req, res) => {
  try {
    const patch = sanitizeTabVisibilityPatch(req.body?.tabVisibility ?? req.body);
    if (!patch) {
      return res.status(400).json({ message: 'tabVisibility object with at least one tab key is required.' });
    }

    const user = await AdminUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (isProtectedAccountEmail(user.email)) {
      return res.status(403).json({ message: 'Tab visibility cannot be changed for the super-admin account.' });
    }

    const before = mergeTabVisibility(user.tabVisibility);
    const next = { ...before, ...patch };
    user.tabVisibility = next;
    await user.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.TAB_VISIBILITY_CHANGED,
      targetType: 'admin_user',
      targetId: user._id?.toString(),
      targetName: user.name,
      before,
      after: next,
      req,
    });

    res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      tabVisibility: resolveTabVisibilityForUser(user),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating tab visibility', error: err.message });
  }
};
