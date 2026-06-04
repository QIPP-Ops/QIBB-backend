const TrendsSnapshot = require('../models/TrendsSnapshot');
const { blobIngestConfigured } = require('../services/plantReports/blobReports');
const { syncTrendsSnapshotFromBlob } = require('../services/plantReports/syncTrendsSnapshot');
const { runPlantIngestion } = require('../services/plantReports/runIngestion');
const {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
} = require('../reportParser');

// ─── GET /api/trends — latest snapshot ───────────────────────────────────────

exports.getLatestTrends = async (req, res) => {
  try {
    const latest = await TrendsSnapshot.findOne().sort({ createdAt: -1 });
    if (!latest) return res.status(404).json({ message: 'No trends data yet.' });
    res.json(latest);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching trends', error: err.message });
  }
};

// ─── GET /api/trends/history?days=30 ─────────────────────────────────────────

exports.getTrendsHistory = async (req, res) => {
  try {
    const fromStr = String(req.query.from || '').trim().slice(0, 10);
    const toStr = String(req.query.to || '').trim().slice(0, 10);
    let createdAtFilter;

    if (fromStr && toStr) {
      createdAtFilter = {
        $gte: new Date(`${fromStr}T00:00:00.000Z`),
        $lte: new Date(`${toStr}T23:59:59.999Z`),
      };
    } else {
      const days = Math.min(parseInt(req.query.days, 10) || 365, 1825);
      const since = new Date();
      since.setDate(since.getDate() - days);
      createdAtFilter = { $gte: since };
    }

    const snapshots = await TrendsSnapshot.find({ createdAt: createdAtFilter })
      .sort({ createdAt: 1 })
      .limit(2000)
      .select('createdAt water energy dailyOps chemistry');

    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching history', error: err.message });
  }
};

// ─── POST /api/trends/sync — trigger manual sync from SharePoint ──────────────

exports.syncFromSharePoint = async (_req, res) => {
  return res.status(410).json({
    message: 'SharePoint trends sync removed. Use POST /api/trends/sync-blob.',
  });
};

/** Sync KPI trends visuals + plant metrics from Azure Blob container `report` */
exports.syncFromBlob = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  if (!blobIngestConfigured()) {
    return res.status(400).json({
      message: 'Blob not configured. Set BLOB_SAS_URL or AZURE_STORAGE_CONNECTION_STRING on the API.',
    });
  }
  try {
    const forceAll = req.query.forceAll === '1' || req.body?.forceAll === true;
    const ingest = await runPlantIngestion({ forceAll });
    const snapshot = ingest.trendsSnapshot || (await syncTrendsSnapshotFromBlob());
    res.json({
      message: 'Blob sync complete',
      ingest,
      trendsSnapshot: snapshot,
    });
  } catch (err) {
    res.status(500).json({ message: 'Blob sync failed', error: err.message });
  }
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