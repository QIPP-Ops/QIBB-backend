const TrendsSnapshot = require('../models/TrendsSnapshot');
const {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
} = require('../reportParser');

// ─── GET /api/trends — latest snapshot ───────────────────────────────────────

exports.getLatestTrends = async (_req, res) => {
  res.status(410).json({
    message:
      'TrendsSnapshot chemistry merge removed. Use GET /api/plant-data/trends-bundle (hrsg + water blobs).',
  });
};

// ─── GET /api/trends/history?days=30 ─────────────────────────────────────────

exports.getTrendsHistory = async (_req, res) => {
  res.status(410).json({
    message:
      'TrendsSnapshot history removed. Use GET /api/plant-data/trends-bundle for time series.',
  });
};

// ─── POST /api/trends/sync — trigger manual sync from SharePoint ──────────────

exports.syncFromSharePoint = async (_req, res) => {
  return res.status(410).json({
    message: 'SharePoint trends sync removed. Use POST /api/trends/sync-blob.',
  });
};

/** @deprecated Legacy Cosmos ingest — trends use six-blob bundle only. */
exports.syncFromBlob = async (_req, res) => {
  res.status(410).json({
    message:
      'Legacy blob ingest to Cosmos removed. Sync qipp-data JSON with npm run sync:trends-blobs.',
  });
};

// ─── POST /api/trends/upload — manual file upload fallback ───────────────────

exports.uploadReport = async (_req, res) => {
  return res.status(410).json({
    message: 'Manual trends upload removed. Reports ingest via Azure Blob container.',
  });
  try {
    const { type } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded.' });

    const buffer = file.buffer;
    let parsed = null;

    switch (type) {
      case 'water':    parsed = await parseWaterConsumption(buffer);     break;
      case 'energy':   parsed = await parseEnergyReport(buffer);         break;
      case 'chemistry': parsed = await parseROHRSGReport(buffer);        break;
      case 'dailyOps': parsed = await parseDailyOperationReport(buffer); break;
      case 'airFilter': parsed = await parseGtFilterDP(buffer, 'air');   break;
      case 'fgFilter':  parsed = await parseGtFilterDP(buffer, 'fuel');  break;
      default: return res.status(400).json({ message: `Unknown report type: ${type}` });
    }

    // Upsert into today's snapshot
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let snapshot = await TrendsSnapshot.findOne({ createdAt: { $gte: today } });
    if (!snapshot) snapshot = new TrendsSnapshot({});

    snapshot[type] = parsed;
    await snapshot.save();

    if (type === 'chemistry') {
      try {
        const { appendFromTrendsSnapshot } = require('../services/chemistryHistoryService');
        await appendFromTrendsSnapshot(snapshot);
      } catch (histErr) {
        console.warn('[trends-upload] chemistry history:', histErr.message);
      }
    }

    res.json({ message: `${type} report parsed and saved`, data: parsed });
  } catch (err) {
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
};