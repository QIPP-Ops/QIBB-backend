const path = require('path');
const TrendsSnapshot = require('../../models/TrendsSnapshot');
const { listReportBlobs, downloadBlobBuffer } = require('./blobReports');
const { inferDateFromFilename } = require('./excelUtils');
const { assertBlobIngestConfigured } = require('./blobIngestPolicy');
const { BACKFILL_FIELD_PICKERS } = require('./snapshotPickers');

function reportDateFromBlob(blob) {
  return inferDateFromFilename(blob.name, blob.lastModified);
}

function dayBounds(reportDate) {
  const dayStart = new Date(`${reportDate}T12:00:00.000Z`);
  const dayEnd = new Date(`${reportDate}T23:59:59.999Z`);
  return { dayStart, dayEnd };
}

function yearStartIso() {
  return `${new Date().getFullYear()}-01-01`;
}

async function backfillTrendSnapshotsFromBlobs(options = {}) {
  assertBlobIngestConfigured();
  const maxAgeDays =
    options.maxAgeDays || parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10);
  const maxDays =
    options.maxDays || parseInt(process.env.TREND_BACKFILL_MAX_DAYS || '365', 10);
  const maxFiles = options.maxFiles || parseInt(process.env.TREND_BACKFILL_MAX_FILES || '400', 10);

  const blobs = await listReportBlobs({ maxAgeDays });
  if (!blobs.length) {
    return { ok: false, message: 'No blobs to backfill', daysProcessed: 0 };
  }

  const byDate = new Map();
  let scanned = 0;

  for (const blob of blobs) {
    if (scanned >= maxFiles) break;
    const base = path.basename(blob.name);
    const picker = BACKFILL_FIELD_PICKERS.find((p) => p.match(base));
    if (!picker) continue;
    scanned += 1;

    const reportDate = reportDateFromBlob(blob);
    if (!byDate.has(reportDate)) {
      byDate.set(reportDate, { reportDate, files: [], payload: {} });
    }
    const bucket = byDate.get(reportDate);
    if (!bucket.payload[picker.field]) {
      bucket.files.push({ field: picker.field, name: blob.name, blob });
    }
  }

  const jan1 = yearStartIso();
  const dates = [...byDate.keys()]
    .filter((d) => d >= jan1)
    .sort()
    .reverse()
    .slice(0, maxDays);
  const { appendFromTrendsSnapshot } = require('../chemistryHistoryService');

  let daysProcessed = 0;
  let snapshotsUpserted = 0;
  const errors = [];

  for (const reportDate of dates) {
    const bucket = byDate.get(reportDate);
    const payload = {};

    for (const { field, name, blob } of bucket.files) {
      const picker = BACKFILL_FIELD_PICKERS.find((p) => p.field === field);
      if (!picker) continue;
      try {
        const buf = await downloadBlobBuffer(blob.name);
        payload[field] = await picker.parse(buf, { reportDate });
      } catch (err) {
        if (errors.length < 8) errors.push(`${name}: ${err.message}`);
      }
    }

    if (!Object.keys(payload).length) continue;

    try {
      const { dayStart, dayEnd } = dayBounds(reportDate);
      let snap = await TrendsSnapshot.findOne({
        createdAt: { $gte: dayStart, $lte: dayEnd },
      });

      if (snap) {
        for (const [k, v] of Object.entries(payload)) {
          snap[k] = v;
        }
        snap.markModified('water');
        snap.markModified('energy');
        snap.markModified('dailyOps');
        snap.markModified('chemistry');
        await snap.save();
      } else {
        snap = new TrendsSnapshot(payload);
        snap.createdAt = dayStart;
        snap.updatedAt = dayStart;
        await snap.save();
      }

      await appendFromTrendsSnapshot(snap, dayStart);
      daysProcessed += 1;
      snapshotsUpserted += 1;
    } catch (err) {
      if (errors.length < 8) errors.push(`${reportDate}: ${err.message}`);
    }
  }

  return {
    ok: snapshotsUpserted > 0,
    daysProcessed,
    snapshotsUpserted,
    datesConsidered: dates.length,
    blobsScanned: scanned,
    errors,
  };
}

module.exports = { backfillTrendSnapshotsFromBlobs };
