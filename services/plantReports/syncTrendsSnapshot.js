const path = require('path');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { listReportBlobs, downloadBlobBuffer } = require('./blobReports');
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
    match: (name) => /water_consumption|daily_water/i.test(name),
    parse: parseWaterConsumption,
  },
  {
    field: 'energy',
    match: (name) => /energy|energy-produced|energy_produced/i.test(name),
    parse: parseEnergyReport,
  },
  {
    field: 'chemistry',
    match: (name) => /ro-hrsg|ro hrsg/i.test(name),
    parse: parseROHRSGReport,
  },
  {
    field: 'dailyOps',
    match: (name) => /daily operation report/i.test(name),
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
    try {
      const buf = await downloadBlobBuffer(hit.name);
      payload[picker.field] = await picker.parse(buf);
      picked.push({ field: picker.field, file: hit.name });
    } catch (err) {
      console.warn(`[trends-snapshot] skip ${hit.name}:`, err.message);
    }
  }

  if (!Object.keys(payload).length) {
    return {
      ok: false,
      message: 'No matching report filenames for trends snapshot (water, energy, daily ops, etc.)',
      blobsScanned: blobs.length,
    };
  }

  const snapshot = new TrendsSnapshot(payload);
  await snapshot.save();

  try {
    const { appendFromTrendsSnapshot } = require('../chemistryHistoryService');
    await appendFromTrendsSnapshot(snapshot);
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
