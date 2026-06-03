const { runPlantIngestion } = require('./runIngestion');
const { blobIngestConfigured, getBlobAccessInfo } = require('./blobReports');

const INTERVAL_MS = Math.max(
  15 * 60 * 1000,
  parseInt(process.env.PLANT_INGEST_INTERVAL_MS || String(15 * 60 * 1000), 10)
);

let timer = null;
let running = false;

async function tick() {
  if (running || !blobIngestConfigured()) return;
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
  if (!blobIngestConfigured()) {
    console.warn(
      '[plant-ingest] Scheduler disabled — configure AZURE_STORAGE_CONNECTION_STRING or BLOB_SAS_URL for blob ingest'
    );
    return;
  }
  const blobInfo = getBlobAccessInfo();
  console.log(
    `[plant-ingest] source=Azure Blob container ${blobInfo.container} (${blobInfo.mode}) · every ${INTERVAL_MS / 60000} minutes`
  );
  setTimeout(tick, 5000);
  timer = setInterval(tick, INTERVAL_MS);
}

function stopPlantIngestScheduler() {
  if (timer) clearInterval(timer);
}

module.exports = { startPlantIngestScheduler, stopPlantIngestScheduler, runPlantIngestion: tick };
