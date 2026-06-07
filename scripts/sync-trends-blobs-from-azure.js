#!/usr/bin/env node
/**
 * Download the six qipp-data container JSON blobs into data/trends-blobs/.
 * Requires AZURE_STORAGE_CONNECTION_STRING (or run on a machine with access).
 */
require('dotenv').config();
const { syncTrendsBlobsFromAzure } = require('../services/plantReports/syncTrendsBlobsService');

async function main() {
  try {
    const result = await syncTrendsBlobsFromAzure({
      onProgress: (state) => {
        if (state.label) console.log(`[sync:trends-blobs] ${state.label}`);
      },
    });
    console.log(
      `[sync:trends-blobs] wrote ${result.filesProcessed}/${result.filesTotal} files, ${result.metricsWritten} metrics`
    );
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
