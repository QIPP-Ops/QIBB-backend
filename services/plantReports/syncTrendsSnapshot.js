const path = require('path');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { listReportBlobs, downloadBlobBuffer } = require('./blobReports');
const { inferDateFromFilename } = require('./excelUtils');
const {
  matchesRoHrsgReport,
  matchesWaterReport,
  matchesEnergyReport,
  matchesDailyOpsReport,
} = require('./reportMatchers');
const {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
} = require('../reportParser');

/** Latest blob per report family → structured TrendsSnapshot for Reports → Trends page */
const PICKERS = [
  {
    field: 'water',
    match: matchesWaterReport,
    parse: parseWaterConsumption,
  },
  {
    field: 'energy',
    match: matchesEnergyReport,
    parse: parseEnergyReport,
  },
  {
    field: 'chemistry',
    match: matchesRoHrsgReport,
    parse: parseROHRSGReport,
  },
  {
    field: 'dailyOps',
    match: matchesDailyOpsReport,
    parse: parseDailyOperationReport,
  },
  {
    field: 'airFilterDP',
    match: (name) => /air intake filter/i.test(name),
    parse: (buf) => parseGtFilterDP(buf, 'air'),
  },
  {
    field: 'fgFilterDP',
    match: (name) => /fg filter|fg-filter/i.test(name),
    parse: (buf) => parseGtFilterDP(buf, 'fuel'),
  },
];

async function syncTrendsSnapshotFromBlob(options = {}) {
  const maxAgeDays = options.maxAgeDays || parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10);
  const blobs = await listReportBlobs({ maxAgeDays });
  if (!blobs.length) {
    return { ok: false, message: 'No Excel files found in blob container report' };
  }

  const payload = {};
  const picked = [];

  for (const picker of PICKERS) {
    const hit = blobs.find((b) => picker.match(path.basename(b.name)));
    if (!hit) continue;
    const reportDate = inferDateFromFilename(hit.name, hit.lastModified);
    try {
      const buf = await downloadBlobBuffer(hit.name);
      payload[picker.field] = await picker.parse(buf, { reportDate });
      picked.push({ field: picker.field, file: hit.name, reportDate });
    } catch (err) {
      console.warn(`[trends-snapshot] skip ${hit.name}:`, err.message);
    }
  }

  if (!Object.keys(payload).length) {
    return {
      ok: false,
      message: 'No matching report filenames for trends snapshot (water, energy, RO-HRSG, daily ops, etc.)',
      blobsScanned: blobs.length,
    };
  }

  const latestDate = picked.reduce((best, p) => {
    const d = p.reportDate || inferDateFromFilename(p.file);
    return !best || d > best ? d : best;
  }, null);
  const at = latestDate ? new Date(`${latestDate}T12:00:00.000Z`) : new Date();

  const dayStart = new Date(at);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(at);
  dayEnd.setUTCHours(23, 59, 59, 999);

  let snapshot = await TrendsSnapshot.findOne({
    createdAt: { $gte: dayStart, $lte: dayEnd },
  });
  if (snapshot) {
    Object.assign(snapshot, payload);
    snapshot.markModified('water');
    snapshot.markModified('energy');
    snapshot.markModified('dailyOps');
    snapshot.markModified('chemistry');
    await snapshot.save();
  } else {
    snapshot = new TrendsSnapshot(payload);
    snapshot.createdAt = at;
    snapshot.updatedAt = at;
    await snapshot.save();
  }

  try {
    const { appendFromTrendsSnapshot } = require('../chemistryHistoryService');
    await appendFromTrendsSnapshot(snapshot, at);
  } catch (err) {
    console.warn('[trends-snapshot] chemistry history:', err.message);
  }

  return {
    ok: true,
    snapshotId: snapshot._id,
    fields: Object.keys(payload),
    picked,
    blobsScanned: blobs.length,
  };
}

module.exports = { syncTrendsSnapshotFromBlob };
