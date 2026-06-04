const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');

const { readKind } = require('../jsonStore');
const { VALID_KINDS } = require('../schema');
const getParser = require('../registry');
const importFile = require('../runImport');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only .xlsx and .xls files are allowed'));
  },
});

function validateKindQuery(req, res, next) {
  const kind = req.query.kind;
  if (!kind || !VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Invalid or missing kind' });
  }
  req.reportKind = kind;
  return next();
}

function filterRecords(data, { from, to, metric }) {
  return data.filter((row) => {
    if (from && row.date < from) {
      return false;
    }
    if (to && row.date > to) {
      return false;
    }
    if (metric && row.metric !== metric) {
      return false;
    }
    return true;
  });
}

router.get('/records', validateKindQuery, (req, res) => {
  try {
    const kind = req.reportKind;
    let data = readKind(kind);
    data = filterRecords(data, {
      from: req.query.from,
      to: req.query.to,
      metric: req.query.metric,
    });
    return res.json({ kind, count: data.length, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/metrics', validateKindQuery, (req, res) => {
  try {
    const kind = req.reportKind;
    const metrics = [...new Set(readKind(kind).map((row) => row.metric))].sort();
    return res.json({ kind, metrics });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/latest-date', validateKindQuery, (req, res) => {
  try {
    const kind = req.reportKind;
    const dates = readKind(kind)
      .map((row) => row.date)
      .filter(Boolean);
    const latestDate = dates.length > 0 ? dates.reduce((max, d) => (d > max ? d : max)) : null;
    return res.json({ kind, latestDate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = path.basename(String(req.file.originalname || 'upload.xlsx'));
    const safeName = filename.replace(/[^\w.\-() ]+/g, '_');
    tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${safeName}`);

    fs.writeFileSync(tempFilePath, req.file.buffer);

    if (!getParser(filename)) {
      return res.status(400).json({ error: 'No parser found for this file' });
    }

    const result = await importFile(tempFilePath);

    if (!result) {
      return res.status(400).json({ error: 'File parsed but no data extracted' });
    }

    return res.json({
      success: true,
      kind: result.kind,
      count: result.data.length,
      filename,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (tempFilePath) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
});

router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  return next();
});

module.exports = router;
