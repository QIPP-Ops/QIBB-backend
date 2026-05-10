const TrendsSnapshot = require('../models/TrendsSnapshot');
const { syncAllReports } = require('../services/sharepointService');
const {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
} = require('../services/reportParser');

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
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await TrendsSnapshot.find({ createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .select('createdAt water energy dailyOps');

    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching history', error: err.message });
  }
};

// ─── POST /api/trends/sync — trigger manual sync from SharePoint ──────────────

exports.syncFromSharePoint = async (req, res) => {
  try {
    const data = await syncAllReports();
    const snapshot = new TrendsSnapshot(data);
    await snapshot.save();
    res.json({ message: 'Sync complete', snapshot });
  } catch (err) {
    res.status(500).json({ message: 'Sync failed', error: err.message });
  }
};

// ─── POST /api/trends/upload — manual file upload fallback ───────────────────

exports.uploadReport = async (req, res) => {
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

    res.json({ message: `${type} report parsed and saved`, data: parsed });
  } catch (err) {
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
};