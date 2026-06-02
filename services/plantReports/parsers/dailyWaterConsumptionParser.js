const path = require('path');
const { cellText } = require('../excelUtils');
const { parseNullableNumber, parseYearMonthFromFilename } = require('./common');

const PARSER_ID = 'dailyWaterConsumptionParser';

/** lowercase, spaces → _, strip non-alphanumeric (GR-1 CONSUMPT → gr1_consumpt) */
function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getUnitForMetric(name) {
  const n = String(name || '');
  if (/consumpt/i.test(n)) return 'm³';
  if (/prod/i.test(n)) return 'm³';
  if (/level/i.test(n)) return 'm³';
  if (/^detal/i.test(n)) return 'm³';
  return 'm³';
}

/** YYYY-MM-DD or YYYY-MM at filename start → { year, month } */
function parseYearMonthFromFilenameStart(filename) {
  const base = path.basename(String(filename || ''));
  const full = base.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (full) {
    return { year: parseInt(full[1], 10), month: parseInt(full[2], 10) };
  }
  const ym = base.match(/^(\d{4})[-_](\d{2})(?![0-9])/);
  if (ym) {
    return { year: parseInt(ym[1], 10), month: parseInt(ym[2], 10) };
  }
  return parseYearMonthFromFilename(filename);
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isFutureCalendarDay(year, month, day, now = new Date()) {
  const d = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d > today;
}

function getMasterSheet(wb) {
  if (!wb || !wb.worksheets) return null;
  return wb.worksheets.find((ws) => /^master$/i.test(String(ws.name || '').trim())) || null;
}

function parse({ wb, filename, sourceFile, now = new Date() }) {
  const ym = parseYearMonthFromFilenameStart(filename);
  if (!ym || !Number.isFinite(ym.year) || !Number.isFinite(ym.month)) {
    return {
      skipped: true,
      kind: 'water',
      points: [],
      highlights: [],
      reportDate: null,
      parserUsed: PARSER_ID,
    };
  }

  const ws = getMasterSheet(wb);
  const monthStart = toIsoDate(ym.year, ym.month, 1);
  if (!ws) {
    return {
      skipped: true,
      kind: 'water',
      points: [],
      highlights: [],
      reportDate: monthStart,
      parserUsed: PARSER_ID,
    };
  }

  const points = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const metricName = String(cellText(row.getCell(1)) || '').trim();
    if (!metricName) return;

    for (let col = 2; col <= 32; col += 1) {
      const dayNumber = col - 1;
      if (dayNumber < 1 || dayNumber > 31) continue;
      if (isFutureCalendarDay(ym.year, ym.month, dayNumber, now)) continue;

      const value = parseNullableNumber(row.getCell(col));
      if (value == null || !Number.isFinite(value)) continue;

      const reportDate = toIsoDate(ym.year, ym.month, dayNumber);
      points.push({
        metricKey: slugify(metricName),
        label: metricName,
        displayName: metricName,
        category: 'water',
        unit: getUnitForMetric(metricName),
        reportDate,
        value,
        equipmentId: '',
        sourceFile,
        sheetName: ws.name,
        columnKey: `day${dayNumber}`,
        parserUsed: PARSER_ID,
      });
    }
  });

  return {
    skipped: false,
    kind: 'water',
    points,
    highlights: [],
    reportDate: monthStart,
    parserUsed: PARSER_ID,
  };
}

module.exports = { parse, slugify, getUnitForMetric, parseYearMonthFromFilenameStart, PARSER_ID };
