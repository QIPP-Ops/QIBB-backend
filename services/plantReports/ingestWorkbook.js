const path = require('path');
const ExcelJS = require('exceljs');
const { classifyReport, inferDateFromFilename } = require('./excelUtils');
const { findBestMappingForFile } = require('./fileMappingService');
const { parseMappedWorkbook } = require('./parseMappedWorkbook');
const { getParserForFilename } = require('./parsers/parserRegistry');

function noParserResult(sourceName, reportDate, kind) {
  return {
    points: [],
    highlights: [],
    skipped: true,
    kind: kind || 'unknown',
    reportDate: reportDate || null,
    noParserMatch: true,
  };
}

async function ingestWorkbookFromBuffer(buffer, sourceName, options = {}) {
  const rel = sourceName.replace(/\\/g, '/');
  const reportDate =
    options.reportDate ||
    inferDateFromFilename(sourceName, options.lastModified || options.fallbackDate);
  const kind = classifyReport(path.basename(sourceName));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const mapping = await findBestMappingForFile(path.basename(sourceName));
  if (mapping) {
    const points = parseMappedWorkbook(wb, mapping, reportDate, rel);
    return {
      points,
      highlights: [],
      skipped: false,
      kind: 'mapped',
      reportDate,
      mappingId: String(mapping._id),
      mappingName: mapping.name,
    };
  }

  const parser = getParserForFilename(path.basename(sourceName));
  if (parser) {
    const res = parser.parse({ wb, filename: path.basename(sourceName), sourceFile: rel });
    return {
      points: res.points || [],
      highlights: res.highlights || [],
      skipped: Boolean(res.skipped),
      kind: res.kind || kind,
      reportDate: res.reportDate || reportDate,
      parserId: parser.id,
      parserPattern: parser.pattern,
    };
  }

  return noParserResult(rel, reportDate, kind);
}

async function ingestWorkbook(filePath, reportsRoot) {
  const rel = path.relative(reportsRoot, filePath);
  const reportDate = inferDateFromFilename(filePath);
  const kind = classifyReport(path.basename(filePath));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const parser = getParserForFilename(path.basename(filePath));
  if (parser) {
    const res = parser.parse({ wb, filename: path.basename(filePath), sourceFile: rel });
    return {
      points: res.points || [],
      highlights: res.highlights || [],
      skipped: Boolean(res.skipped),
      kind: res.kind || kind,
      reportDate: res.reportDate || reportDate,
      parserId: parser.id,
      parserPattern: parser.pattern,
    };
  }

  return noParserResult(rel, reportDate, kind);
}

module.exports = { ingestWorkbook, ingestWorkbookFromBuffer };
