const path = require('path');
const {
  listAllExcelBlobs,
  downloadBlobBuffer,
  blobIngestConfigured,
} = require('../services/plantReports/blobReports');
const { previewWorkbookBuffer } = require('../services/plantReports/workbookPreview');
const FileMapping = require('../models/FileMapping');
const { mappingCoversFile } = require('../services/plantReports/fileMappingService');

exports.listBlobFiles = async (req, res) => {
  try {
    if (!blobIngestConfigured()) {
      return res.status(503).json({
        message: 'Blob storage not configured. Set BLOB_SAS_URL or AZURE_STORAGE_CONNECTION_STRING.',
      });
    }

    const maxAgeDays = parseInt(req.query.maxAgeDays || '3650', 10);
    const q = String(req.query.q || '').trim().toLowerCase();

    const [blobs, mappings] = await Promise.all([
      listAllExcelBlobs({ maxAgeDays }),
      FileMapping.find().select('filenamePattern name').lean(),
    ]);

    let files = blobs.map((b) => ({
      name: b.name,
      filename: b.filename || path.basename(b.name),
      lastModified: b.lastModified,
      size: b.size,
      mapped: mappingCoversFile(mappings, b.filename || b.name),
    }));

    if (q) {
      files = files.filter(
        (f) =>
          f.filename.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.previewBlobFile = async (req, res) => {
  try {
    if (!blobIngestConfigured()) {
      return res.status(503).json({ message: 'Blob storage not configured.' });
    }

    const filename = decodeURIComponent(
      String(req.query.filename || req.params.filename || '').trim()
    );
    if (!filename) return res.status(400).json({ message: 'filename query parameter is required.' });

    const buffer = await downloadBlobBuffer(filename);
    const preview = await previewWorkbookBuffer(buffer);
    res.json({
      success: true,
      data: {
        filename,
        ...preview,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
