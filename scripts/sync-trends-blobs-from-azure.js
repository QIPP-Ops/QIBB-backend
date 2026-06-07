#!/usr/bin/env node
/**
 * Download the six qipp-data container JSON blobs into data/trends-blobs/.
 * Requires AZURE_STORAGE_CONNECTION_STRING (or run on a machine with access).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');
const { BUNDLED_DIR, KIND_TO_FILE } = require('../services/plantReports/trendsBlobBundle');

const CONTAINER = 'qipp-data';

async function main() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!connectionString) {
    console.error('AZURE_STORAGE_CONNECTION_STRING is required.');
    process.exit(1);
  }

  fs.mkdirSync(BUNDLED_DIR, { recursive: true });
  const client = BlobServiceClient.fromConnectionString(connectionString);
  const container = client.getContainerClient(CONTAINER);

  let ok = 0;
  for (const [kind, fileName] of Object.entries(KIND_TO_FILE)) {
    const target = path.join(BUNDLED_DIR, fileName);
    try {
      const blob = container.getBlockBlobClient(fileName);
      const buffer = await blob.downloadToBuffer();
      fs.writeFileSync(target, buffer);
      console.log(`[sync:trends-blobs] ${kind} → ${target} (${buffer.length} bytes)`);
      ok += 1;
    } catch (err) {
      console.warn(`[sync:trends-blobs] ${kind} failed: ${err.message}`);
    }
  }

  console.log(`[sync:trends-blobs] wrote ${ok}/${Object.keys(KIND_TO_FILE).length} files`);
  process.exit(ok > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
