const { cellText, parseNumber } = require('../excelUtils');

const NULL_TEXT_RE = /^(sd|n\/a|na|not available|not in service|no sample|no sample flow)$/i;
const EXCEL_ERROR_RE = /^(#ref!|#value!|#name\?|#div\/0!|#null!|#num!|errorref)$/i;

function isExcelErrorText(s) {
  return EXCEL_ERROR_RE.test(String(s || '').trim());
}

function isNullText(s) {
  return NULL_TEXT_RE.test(String(s || '').trim());
}

/**
 * Convert a cell to a nullable number following global rules:
 * - empty / excel error / null-text => null
 * - otherwise parseNumber()
 */
function parseNullableNumber(cellOrRaw) {
  const raw = typeof cellOrRaw === 'object' && cellOrRaw && 'value' in cellOrRaw ? cellText(cellOrRaw) : cellOrRaw;
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  if (isExcelErrorText(s)) return null;
  if (isNullText(s)) return null;
  return parseNumber(s);
}

function toIsoDateOnly(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseDmyFromFilename(filename) {
  const base = String(filename || '');
  const dmyDot = base.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmyDot) return `${dmyDot[3]}-${dmyDot[2]}-${dmyDot[1]}`;
  const dmyDash = base.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`;
  return null;
}

function parseDdMonthYyyyFromFilename(filename) {
  const base = String(filename || '');
  const m = base.match(/(\d{2})-([A-Za-z]+)-(\d{4})/);
  if (!m) return null;
  const d = new Date(`${m[1]} ${m[2]} ${m[3]} UTC`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseYearMonthFromFilename(filename) {
  const base = String(filename || '');
  const ym = base.match(/(\d{4})[-_](\d{2})/);
  if (ym) return { year: parseInt(ym[1], 10), month: parseInt(ym[2], 10) };
  return null;
}

function makePoint({
  metricKey,
  label,
  displayName,
  category,
  unit,
  reportDate,
  value,
  equipmentId,
  sourceFile,
  sheetName,
  columnKey,
}) {
  return {
    metricKey,
    label,
    displayName: String(displayName || label || '').trim(),
    category: category || 'general',
    unit: unit || '',
    reportDate,
    value: value == null ? null : value,
    equipmentId: equipmentId || '',
    sourceFile,
    sheetName: sheetName || '',
    columnKey: columnKey || '',
  };
}

module.exports = {
  parseNullableNumber,
  isExcelErrorText,
  isNullText,
  toIsoDateOnly,
  parseDmyFromFilename,
  parseDdMonthYyyyFromFilename,
  parseYearMonthFromFilename,
  makePoint,
};

