const path = require('path');
const ExcelJS = require('exceljs');
const { classifyReport, inferDateFromFilename } = require('./excelUtils');
const { findBestMappingForFile } = require('./fileMappingService');
const { parseMappedWorkbook } = require('./parseMappedWorkbook');
const { getParserForFilename } = require('./parsers/parserRegistry');
const { parseWaterWorkbook } = require('./parsers/waterConsumption');
const { parseRoHrsgWorkbook } = require('./parsers/roHrsg');
const { parseDailyOperationWorkbook } = require('./parsers/dailyOperation');
const { parseGtFilterWorkbook } = require('./parsers/gtFilters');
const { parseShiftReportWorkbook } = require('./parsers/shiftReport');
const { parseEnvironmentWorkbook } = require('./parsers/environment');

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

  // Dedicated parser registry (most-specific filename match wins).
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

  return parseWorkbook(wb, rel, reportDate, kind);
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

  return parseWorkbook(wb, rel, reportDate, kind);
}

async function parseWorkbook(wb, rel, reportDate, kind) {

  let points = [];
  let highlights = [];

  switch (kind) {
    case 'water':
      points = parseWaterWorkbook(wb, reportDate, rel);
      break;
    case 'ro_hrsg':
      points = parseRoHrsgWorkbook(wb, reportDate, rel);
      break;
    case 'daily_ops':
      points = parseDailyOperationWorkbook(wb, reportDate, rel);
      break;
    case 'gt_fg_filter':
      points = parseGtFilterWorkbook(wb, reportDate, rel, 'fg');
      break;
    case 'gt_air_filter':
      points = parseGtFilterWorkbook(wb, reportDate, rel, 'air');
      break;
    case 'shift': {
      const res = parseShiftReportWorkbook(wb, reportDate, rel);
      points = res.points;
      highlights = res.highlights;
      break;
    }
    case 'environment':
      points = parseEnvironmentWorkbook(wb, reportDate, rel);
      break;
    default:
      return { points: [], highlights: [], skipped: true, kind };
  }

  return { points, highlights, skipped: false, kind, reportDate };
}

module.exports = { ingestWorkbook, ingestWorkbookFromBuffer };
