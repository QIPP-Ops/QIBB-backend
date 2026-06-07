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

const SIX_BLOB_REPORT_KINDS = new Set([
  'daily_ops',
  'water',
  'hrsg',
  'fg_filter',
  'air_inlet_filter',
  'environment',
]);

const DERIVED_FROM_DAILY_OPS = new Set(['energy', 'timers_counters']);

function recordsFromBundleKind(kind) {
  const { buildTrendsBundleFromSixBlobs } = require('../../plantReports/buildTrendsBundleFromSixBlobs');
  const { payload } = buildTrendsBundleFromSixBlobs();
  const seriesByKey = payload?.seriesByKey ?? {};
  const metrics = payload?.metrics ?? [];
  const records = [];

  for (const [metricKey, series] of Object.entries(seriesByKey)) {
    const meta = metrics.find((m) => m.metricKey === metricKey);
    const label = meta?.label ?? metricKey;
    const category = meta?.category ?? '';
    const key = metricKey.toLowerCase();
    const text = `${key} ${label}`.toLowerCase();

    let include = false;
    if (kind === 'daily_ops') {
      include = category === 'daily_ops' || key.startsWith('daily_op') || /timer sheet|plant load|mwh|mfeqh/.test(text);
    } else if (kind === 'water') {
      include = category.startsWith('water') || category === 'tanks' || /water|consumpt|production|tank|gr-|sw |dm /.test(text);
    } else if (kind === 'hrsg') {
      include = category === 'hrsg_chemistry' || /hrsg|bfw|condensate|drum|steam|ph|conduct/.test(text);
    } else if (kind === 'fg_filter') {
      include = category === 'fg_filter' || (/filter|fg sep|bp spread/.test(text) && !/air|intake|p1c/.test(text));
    } else if (kind === 'air_inlet_filter') {
      include = category === 'air_intake' || /air|intake|p1c|pulse air/.test(text);
    } else if (kind === 'environment') {
      include = category === 'environment' || /emission|stack|ambient|outfall|nox|sox/.test(text);
    } else if (kind === 'energy') {
      include = /mwh|load|generation|heat rate|efficiency|mw\b/.test(text) && !/mfeqh|timer|counter/.test(text);
    } else if (kind === 'timers_counters') {
      include = /mfeqh|timer|counter|starts|trips/.test(text);
    }

    if (!include) continue;

    for (const row of series) {
      const date = String(row.date ?? '').slice(0, 10);
      const value = Number(row.value ?? row[metricKey]);
      if (!date || !Number.isFinite(value)) continue;
      records.push({ date, metric: label, value });
    }
  }

  return records;
}

router.get('/records', validateKindQuery, (req, res) => {
  try {
    const kind = req.reportKind;

    if (SIX_BLOB_REPORT_KINDS.has(kind) || DERIVED_FROM_DAILY_OPS.has(kind)) {
      let data = recordsFromBundleKind(kind);
      data = filterRecords(data, {
        from: req.query.from,
        to: req.query.to,
        metric: req.query.metric,
      });
      if (!data.length && DERIVED_FROM_DAILY_OPS.has(kind)) {
        return res.json({
          kind,
          count: 0,
          data: [],
          message: `No ${kind} metrics in six-blob bundle (derived from daily_ops when present).`,
        });
      }
      return res.json({ kind, count: data.length, data, source: 'six-blob-bundle' });
    }

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
    if (SIX_BLOB_REPORT_KINDS.has(kind) || DERIVED_FROM_DAILY_OPS.has(kind)) {
      const metrics = [...new Set(recordsFromBundleKind(kind).map((row) => row.metric))].sort();
      return res.json({ kind, metrics, source: 'six-blob-bundle' });
    }
    const metrics = [...new Set(readKind(kind).map((row) => row.metric))].sort();
    return res.json({ kind, metrics });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/latest-date', validateKindQuery, (req, res) => {
  try {
    const kind = req.reportKind;
    const dates =
      SIX_BLOB_REPORT_KINDS.has(kind) || DERIVED_FROM_DAILY_OPS.has(kind)
        ? recordsFromBundleKind(kind).map((row) => row.date).filter(Boolean)
        : readKind(kind).map((row) => row.date).filter(Boolean);
    const latestDate = dates.length > 0 ? dates.reduce((max, d) => (d > max ? d : max)) : null;
    return res.json({ kind, latestDate, source: SIX_BLOB_REPORT_KINDS.has(kind) || DERIVED_FROM_DAILY_OPS.has(kind) ? 'six-blob-bundle' : undefined });
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
