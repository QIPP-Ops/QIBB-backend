const path = require('path');
const ExcelJS = require('exceljs');
const { classifyReport, inferDateFromFilename } = require('./excelUtils');
const { parseWaterWorkbook } = require('./parsers/waterConsumption');
const { parseRoHrsgWorkbook } = require('./parsers/roHrsg');
const { parseDailyOperationWorkbook } = require('./parsers/dailyOperation');
const { parseGtFilterWorkbook } = require('./parsers/gtFilters');
const { parseShiftReportWorkbook } = require('./parsers/shiftReport');
const { parseEnvironmentWorkbook } = require('./parsers/environment');

async function ingestWorkbookFromBuffer(buffer, sourceName) {
  const rel = sourceName.replace(/\\/g, '/');
  const reportDate = inferDateFromFilename(sourceName);
  const kind = classifyReport(path.basename(sourceName));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  return parseWorkbook(wb, rel, reportDate, kind);
}

async function ingestWorkbook(filePath, reportsRoot) {
  const rel = path.relative(reportsRoot, filePath);
  const reportDate = inferDateFromFilename(filePath);
  const kind = classifyReport(path.basename(filePath));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

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
