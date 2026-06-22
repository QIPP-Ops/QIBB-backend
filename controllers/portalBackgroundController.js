const {
  PORTAL_BACKGROUND_SECTION_KEYS,
  PORTAL_BACKGROUND_SECTION_LABELS,
  PLANT_IMAGE_PATHS,
} = require('../constants/portalBackgroundSections');
const {
  getPortalBackgroundsMap,
  setPortalBackground,
  clearPortalBackground,
  uploadPortalBackgroundImage,
} = require('../services/portalBackgroundService');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

exports.getPortalBackgrounds = async (req, res) => {
  try {
    const backgrounds = await getPortalBackgroundsMap();
    res.json({
      backgrounds,
      sections: PORTAL_BACKGROUND_SECTION_KEYS.map((key) => ({
        key,
        label: PORTAL_BACKGROUND_SECTION_LABELS[key] || key,
      })),
      plantImages: PLANT_IMAGE_PATHS,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error reading portal backgrounds', error: err.message });
  }
};

exports.patchPortalBackground = async (req, res) => {
  try {
    const sectionKey = String(req.params.sectionKey || '').trim();
    const imageUrl = req.body?.imageUrl ?? req.body?.url;
    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl is required.' });
    }

    const updated = await setPortalBackground(sectionKey, imageUrl);
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PORTAL_BACKGROUND_CHANGED,
      targetType: 'settings',
      targetId: `portalBackground:${sectionKey}`,
      targetName: PORTAL_BACKGROUND_SECTION_LABELS[sectionKey] || sectionKey,
      after: { sectionKey, imageUrl: updated.imageUrl },
      req,
    });

    res.json(updated);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: status === 500 ? 'Error updating portal background' : err.message,
      error: err.message,
    });
  }
};

exports.deletePortalBackground = async (req, res) => {
  try {
    const sectionKey = String(req.params.sectionKey || '').trim();
    const result = await clearPortalBackground(sectionKey);
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PORTAL_BACKGROUND_CHANGED,
      targetType: 'settings',
      targetId: `portalBackground:${sectionKey}`,
      targetName: PORTAL_BACKGROUND_SECTION_LABELS[sectionKey] || sectionKey,
      after: { sectionKey, cleared: true },
      req,
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: status === 500 ? 'Error clearing portal background' : err.message,
      error: err.message,
    });
  }
};

exports.uploadPortalBackground = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const uploaded = await uploadPortalBackgroundImage({
      userId: String(req.user?._id || req.user?.id || 'admin'),
      file: req.file,
    });
    res.json(uploaded);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: status === 500 ? 'Error uploading image' : err.message,
      error: err.message,
    });
  }
};
