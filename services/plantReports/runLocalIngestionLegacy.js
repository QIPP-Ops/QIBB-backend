const fs = require('fs');
const path = require('path');
const { walkExcel } = require('./extractOpsHighlights');
const { classifyReport } = require('./excelUtils');
const { ingestWorkbook } = require('./ingestWorkbook');
const { getParserForFilename } = require('./parsers/parserRegistry');
const { processIngestResult } = require('./ingestProcessResult');

const MAX_FILES = parseInt(process.env.PLANT_INGEST_MAX_FILES || '800', 10);
const MAX_AGE_DAYS = parseInt(process.env.PLANT_INGEST_MAX_AGE_DAYS || '365', 10);

function selectLocalFiles(allFiles) {
  const minMtime = Date.now() - MAX_AGE_DAYS * 86400000;
  return allFiles
    .filter((f) => {
      const base = path.basename(f);
      const hasParser = Boolean(getParserForFilename(base));
      const kind = hasParser ? 'registry' : classifyReport(base);
      if (!hasParser && kind === 'other') return false;
      try {
        return fs.statSync(f).mtimeMs >= minMtime;
      } catch {
        return false;
      }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

/**
 * Dev-only local folder ingest (ALLOW_LOCAL_FOLDER_INGEST=1).
 */
async function runLocalIngestionLegacy(reportsRoot, forceAll) {
  const allFiles = walkExcel(reportsRoot);
  const files = forceAll
    ? allFiles
        .filter((f) => {
          const base = path.basename(f);
          return Boolean(getParserForFilename(base)) || classifyReport(base) !== 'other';
        })
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
        .slice(0, Math.max(MAX_FILES, 200))
    : selectLocalFiles(allFiles).slice(0, MAX_FILES);

  let pointsUpserted = 0;
  let highlightsUpserted = 0;
  let filesProcessed = 0;
  const byKind = {};

  for (const filePath of files) {
    try {
      const result = await ingestWorkbook(filePath, reportsRoot);
      const stats = await processIngestResult(result);
      if (result.skipped) continue;
      filesProcessed += 1;
      byKind[stats.kind] = (byKind[stats.kind] || 0) + 1;
      pointsUpserted += stats.pointsUpserted;
      highlightsUpserted += stats.highlightsUpserted;
    } catch (err) {
      console.warn(`[plant-ingest] skip ${path.basename(filePath)}:`, err.message);
    }
  }

  return {
    source: 'local',
    filesScanned: allFiles.length,
    filesProcessed,
    pointsUpserted,
    highlightsUpserted,
    byKind,
  };
}

module.exports = { runLocalIngestionLegacy };
