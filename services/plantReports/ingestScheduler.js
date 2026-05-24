const { runPlantIngestion } = require('./runIngestion');
const { blobIngestConfigured } = require('./blobReports');

const INTERVAL_MS = Math.max(
  15 * 60 * 1000,
  parseInt(process.env.PLANT_INGEST_INTERVAL_MS || String(30 * 60 * 1000), 10)
);

let timer = null;
let running = false;

function ingestEnabled() {
  return blobIngestConfigured() || Boolean(process.env.PLANT_REPORTS_DIR?.trim());
}

async function tick() {
  if (running || !ingestEnabled()) return;
  running = true;
  try {
    const result = await runPlantIngestion();
    if (result.ok) {
      console.log(
        `[plant-ingest] ${result.ingestSource} · ${result.filesProcessed}/${result.filesScanned} files · ${result.pointsUpserted} points`
      );
    }
  } catch (err) {
    console.error('[plant-ingest] failed:', err.message);
  } finally {
    running = false;
  }
}

function startPlantIngestScheduler() {
  if (!ingestEnabled()) {
    console.warn(
      '[plant-ingest] Blob/local ingest disabled — set BLOB_SAS_URL, AZURE_STORAGE_CONNECTION_STRING, or PLANT_REPORTS_DIR'
    );
    return;
  }
  const { getBlobAccessInfo } = require('./blobReports');
  const blobInfo = getBlobAccessInfo();
  const src = blobIngestConfigured()
    ? `Azure Blob container ${blobInfo.container} (${blobInfo.mode})`
    : 'local PLANT_REPORTS_DIR';
  console.log(`[plant-ingest] source=${src} · every ${INTERVAL_MS / 60000} minutes`);
  setTimeout(tick, 5000);
  timer = setInterval(tick, INTERVAL_MS);
}

function stopPlantIngestScheduler() {
  if (timer) clearInterval(timer);
}

module.exports = { startPlantIngestScheduler, stopPlantIngestScheduler, runPlantIngestion: tick };
