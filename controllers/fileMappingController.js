const FileMapping = require('../models/FileMapping');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

function validateMappingBody(body) {
  const { name, filenamePattern, dateCell, orientation, headerRow, metrics } = body || {};
  if (!name?.trim()) return 'name is required';
  if (!filenamePattern?.trim()) return 'filenamePattern is required';
  if (!dateCell?.trim()) return 'dateCell is required';
  if (orientation && !['row', 'column'].includes(orientation)) return 'orientation must be row or column';
  if (!Array.isArray(metrics) || !metrics.length) return 'at least one metric mapping is required';
  for (const m of metrics) {
    if (!m.nameCellRef?.trim() || !m.valueCellRef?.trim()) {
      return 'each metric requires nameCellRef and valueCellRef';
    }
  }
  return null;
}

exports.listFileMappings = async (req, res) => {
  try {
    const rows = await FileMapping.find().sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createFileMapping = async (req, res) => {
  try {
    const errMsg = validateMappingBody(req.body);
    if (errMsg) return res.status(400).json({ message: errMsg });

    const doc = await FileMapping.create({
      name: req.body.name.trim(),
      filenamePattern: req.body.filenamePattern.trim(),
      orientation: req.body.orientation || 'row',
      dateCell: req.body.dateCell.trim().toUpperCase(),
      headerRow: parseInt(req.body.headerRow, 10) || 1,
      metrics: (req.body.metrics || []).map((m) => ({
        nameCellRef: String(m.nameCellRef).trim().toUpperCase(),
        valueCellRef: String(m.valueCellRef).trim().toUpperCase(),
        displayName: String(m.displayName || '').trim(),
      })),
      createdBy: req.user?.id || null,
    });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.FILE_MAPPING_CREATED,
      targetType: 'file_mapping',
      targetId: doc._id?.toString(),
      targetName: doc.name,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFileMapping = async (req, res) => {
  try {
    const errMsg = validateMappingBody(req.body);
    if (errMsg) return res.status(400).json({ message: errMsg });

    const previous = await FileMapping.findById(req.params.id).lean();
    const doc = await FileMapping.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: req.body.name.trim(),
          filenamePattern: req.body.filenamePattern.trim(),
          orientation: req.body.orientation || 'row',
          dateCell: req.body.dateCell.trim().toUpperCase(),
          headerRow: parseInt(req.body.headerRow, 10) || 1,
          metrics: (req.body.metrics || []).map((m) => ({
            nameCellRef: String(m.nameCellRef).trim().toUpperCase(),
            valueCellRef: String(m.valueCellRef).trim().toUpperCase(),
            displayName: String(m.displayName || '').trim(),
          })),
        },
      },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Mapping not found.' });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.FILE_MAPPING_UPDATED,
      targetType: 'file_mapping',
      targetId: doc._id?.toString(),
      targetName: doc.name,
      before: previous,
      after: doc.toObject ? doc.toObject() : doc,
      req,
    });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteFileMapping = async (req, res) => {
  try {
    const doc = await FileMapping.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Mapping not found.' });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.FILE_MAPPING_DELETED,
      targetType: 'file_mapping',
      targetId: doc._id?.toString(),
      targetName: doc.name,
      before: doc.toObject ? doc.toObject() : doc,
      req,
    });
    res.json({ success: true, message: 'Mapping deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
