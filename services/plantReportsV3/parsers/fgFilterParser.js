const path = require('path');

const KIND = 'fg_filter';

const EXTRACT_HEADERS = [
  'Load',
  'BP Spread',
  'FG Seperator before Pr.',
  'FG Seperator After Pr.',
  'Stage Gas Pressure',
  'DP at DCS (bar)',
];

const GT_LABEL_RE = /^GT-\d{2}$/i;
const FILTER_SUB_ROW_RE = /f\.?\s*g\.?\s*filter\s*#\s*[ab]/i;
const SKIP_FIRST_CELL_RE = /max\s*spread|max\s*dp/i;

const EXCEL_ERROR_RE = /^#(?:ref!|value!|name\?|div\/0!|null!|num!|n\/a)/i;

function emptyResult() {
  return { kind: KIND, data: [] };
}

function getPrimarySheet(wb) {
  if (!wb || !Array.isArray(wb.worksheets) || wb.worksheets.length === 0) {
    return null;
  }
  return wb.worksheets[0];
}

function cellText(cell) {
  if (!cell || cell.value == null || cell.value === '') {
    return '';
  }
  const value = cell.value;
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (value.error) {
      return String(value.error);
    }
  }
  return String(value);
}

function parseNumericString(text) {
  let trimmed = String(text || '').trim();
  if (!trimmed || trimmed === '-' || EXCEL_ERROR_RE.test(trimmed)) {
    return null;
  }
  trimmed = trimmed.replace(/,/g, '');
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function parseValue(cell) {
  if (!cell || cell.value == null || cell.value === '') {
    return null;
  }
  if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
    return cell.value;
  }
  if (typeof cell.value === 'object' && cell.value !== null && cell.value.error) {
    return null;
  }
  if (typeof cell.value === 'object' && cell.value !== null && 'result' in cell.value) {
    return parseNumericString(String(cell.value.result ?? ''));
  }
  return parseNumericString(cellText(cell));
}

function toIsoDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return iso[0];
  }

  const dmySlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    return toIsoDate(
      parseInt(dmySlash[3], 10),
      parseInt(dmySlash[2], 10),
      parseInt(dmySlash[1], 10),
    );
  }

  const dmyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    return toIsoDate(parseInt(dmyDash[3], 10), parseInt(dmyDash[2], 10), parseInt(dmyDash[1], 10));
  }

  const dmyDot = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDot) {
    return toIsoDate(parseInt(dmyDot[3], 10), parseInt(dmyDot[2], 10), parseInt(dmyDot[1], 10));
  }

  return null;
}

function normalizeHeader(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parseDateFromFilename(filename) {
  const base = path.basename(String(filename || ''));
  const dmyDot = base.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmyDot) {
    return toIsoDate(parseInt(dmyDot[3], 10), parseInt(dmyDot[2], 10), parseInt(dmyDot[1], 10));
  }
  const dmyDash = base.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (dmyDash) {
    return toIsoDate(parseInt(dmyDash[3], 10), parseInt(dmyDash[2], 10), parseInt(dmyDash[1], 10));
  }
  return null;
}

function parseDateFromSheet(ws) {
  let found = null;
  ws.eachRow((row) => {
    if (found) {
      return;
    }
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (found) {
        return;
      }
      const parsed = parseDateText(cellText(cell));
      if (parsed) {
        found = parsed;
      }
    });
  });
  return found;
}

function resolveReportDate(filename, ws) {
  return parseDateFromFilename(filename) || parseDateFromSheet(ws);
}

function normalizeGtLabel(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/^GT[-#]?\s*(\d{2})$/i);
  if (!match) {
    return null;
  }
  return `GT-${match[1]}`;
}

function isGtPrimaryRow(firstCellText) {
  const gt = normalizeGtLabel(firstCellText);
  if (!gt) {
    return false;
  }
  if (FILTER_SUB_ROW_RE.test(firstCellText)) {
    return false;
  }
  if (SKIP_FIRST_CELL_RE.test(firstCellText)) {
    return false;
  }
  return GT_LABEL_RE.test(gt);
}

function resolveExtractHeader(norm) {
  for (const header of EXTRACT_HEADERS) {
    if (norm === normalizeHeader(header)) {
      return header;
    }
  }
  if (norm === 'load' || norm === 'mw' || norm === 'gt load' || norm.includes('load')) {
    return 'Load';
  }
  if (norm === 'bp spread' || norm.includes('bp spread') || norm.includes('spread')) {
    return 'BP Spread';
  }
  return null;
}

function detectHeaderRow(ws) {
  for (let rowNumber = 1; rowNumber <= 8; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const columns = [];
    let hasLoadLike = false;
    let hasBpSpreadLike = false;

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const raw = cellText(cell).trim();
      const norm = normalizeHeader(raw);
      if (!norm || norm.includes('all gts fuel gas filter')) {
        return;
      }

      const header = resolveExtractHeader(norm);
      if (!header) {
        return;
      }

      columns.push({ col, header });
      if (header === 'Load') {
        hasLoadLike = true;
      }
      if (header === 'BP Spread') {
        hasBpSpreadLike = true;
      }
    });

    if (columns.length >= 3) {
      return { rowNumber, columns };
    }
    if ((hasLoadLike || hasBpSpreadLike) && columns.length >= 1) {
      return { rowNumber, columns };
    }
  }

  return null;
}

function gtLabelFromRow(row) {
  const firstCell = cellText(row.getCell(1)).trim();
  if (isGtPrimaryRow(firstCell)) {
    return normalizeGtLabel(firstCell);
  }
  const secondCell = cellText(row.getCell(2)).trim();
  if (isGtPrimaryRow(secondCell)) {
    return normalizeGtLabel(secondCell);
  }
  return null;
}

function parse({ wb, filename, sourceFile }) {
  void sourceFile;

  const ws = getPrimarySheet(wb);
  if (!ws) {
    return emptyResult();
  }

  const date = resolveReportDate(filename, ws);
  if (!date) {
    return emptyResult();
  }

  const tableHeader = detectHeaderRow(ws);
  if (!tableHeader) {
    return emptyResult();
  }

  const data = [];
  const maxRow = ws.rowCount || 500;

  for (let rowNumber = tableHeader.rowNumber + 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const firstCell = cellText(row.getCell(1)).trim();
    if (!firstCell) {
      continue;
    }

    if (FILTER_SUB_ROW_RE.test(firstCell) || SKIP_FIRST_CELL_RE.test(firstCell)) {
      continue;
    }

    const gt = gtLabelFromRow(row);
    if (!gt) {
      continue;
    }

    for (const { col, header } of tableHeader.columns) {
      const value = parseValue(row.getCell(col));
      if (value == null) {
        continue;
      }
      data.push({
        date,
        metric: `${header}_${gt}`,
        value,
      });
    }
  }

  return { kind: KIND, data };
}

module.exports = { parse };
