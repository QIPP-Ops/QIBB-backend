const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
const fs = require('fs');
const os = require('os');
const importFile = require('./runImport');

const CONTAINER_NAME = 'report';
const POLL_INTERVAL_MS = 7200000;

const NAME_KEYWORDS = [
  'water',
  'energy',
  'environment',
  'environment report',
  'operation',
  'fg-filter',
  'fg_filter',
  'fgfilter',
  'fg filter',
  'fuel-gas',
  'fuel_gas',
  'air-intake',
  'air_intake',
  'air intake',
  'air-inlet',
  'air_inlet',
  'air inlet',
  'timers',
  'timer',
  'counter',
  'hrsg',
  'ro-hrsg',
  'ro hrsg',
];

const processedSet = new Set();

function createBlobServiceClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString);
  }

  const sasUrl = process.env.BLOB_SAS_URL?.trim();
  if (sasUrl) {
    return new BlobServiceClient(sasUrl);
  }

  return null;
}

function isAcceptedBlob(blobName) {
  const lower = String(blobName || '').toLowerCase();
  const ext = path.extname(lower);
  if (ext !== '.xlsx' && ext !== '.xls') {
    return false;
  }
  return NAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function blobTrackingKey(blobName, lastModified) {
  const iso =
    lastModified instanceof Date
      ? lastModified.toISOString()
      : new Date(lastModified).toISOString();
  return `${blobName}|${iso}`;
}

async function poll(blobServiceClient) {
  let checked = 0;
  let imported = 0;

  try {
    const container = blobServiceClient.getContainerClient(CONTAINER_NAME);

    for await (const item of container.listBlobsFlat()) {
      if (!item.name) {
        continue;
      }
      if (!isAcceptedBlob(item.name)) {
        console.log(`[azureSync] Rejected blob: ${item.name}`);
        continue;
      }

      checked += 1;

      const lastModified = item.properties?.lastModified;
      const key = blobTrackingKey(item.name, lastModified);

      if (processedSet.has(key)) {
        continue;
      }

      const safeName = path.basename(item.name).replace(/[^\w.\-() ]+/g, '_');
      const tempFilePath = path.join(os.tmpdir(), `${safeName}-${Date.now()}`);

      try {
        const blockBlob = container.getBlockBlobClient(item.name);
        const buffer = await blockBlob.downloadToBuffer();
        fs.writeFileSync(tempFilePath, buffer);

        const result = await importFile(tempFilePath);

        if (result && result.data.length > 0) {
          processedSet.add(key);
          imported += 1;
          console.log(
            `Synced ${item.name} → ${result.kind} (${result.data.length} records)`,
          );
        } else {
          console.log(`Skipped ${item.name} (no parser or no data)`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Azure sync error for ${item.name}: ${message}`);
      } finally {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch {
          /* ignore cleanup errors */
        }
      }
    }

    console.log(
      `Poll complete. Checked ${checked} blobs, imported ${imported} new files.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Azure sync poll failed: ${message}`);
  }
}

async function listAllContainerBlobs() {
  const blobServiceClient = createBlobServiceClient();
  if (!blobServiceClient) {
    throw new Error(
      'Blob storage not configured (AZURE_STORAGE_CONNECTION_STRING or BLOB_SAS_URL required)',
    );
  }

  const container = blobServiceClient.getContainerClient(CONTAINER_NAME);
  const names = [];

  for await (const item of container.listBlobsFlat()) {
    if (item.name) {
      names.push(item.name);
    }
  }

  names.sort((a, b) => a.localeCompare(b));
  const totalCount = names.length;
  const truncated = totalCount > 1000;

  return {
    container: CONTAINER_NAME,
    totalCount,
    truncated,
    blobs: truncated ? names.slice(0, 500) : names,
  };
}

module.exports = function startAzureSync() {
  const blobServiceClient = createBlobServiceClient();

  if (!blobServiceClient) {
    console.log(
      'Azure sync disabled: no storage credentials found (AZURE_STORAGE_CONNECTION_STRING or BLOB_SAS_URL required)',
    );
    return;
  }

  const runPoll = () => {
    poll(blobServiceClient).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Azure sync poll failed: ${message}`);
    });
  };

  runPoll();
  setInterval(runPoll, POLL_INTERVAL_MS);

  console.log(
    `Azure sync started — polling every 2 hours. Container: ${CONTAINER_NAME}`,
  );
};

module.exports.isAcceptedBlob = isAcceptedBlob;
module.exports.listAllContainerBlobs = listAllContainerBlobs;
module.exports.NAME_KEYWORDS = NAME_KEYWORDS;
