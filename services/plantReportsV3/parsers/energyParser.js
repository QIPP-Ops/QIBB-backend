const KIND = 'energy';

const HEADER_ROW = 5;
const DATA_START_ROW = 7;
const DATE_COL = 2;
const HOUR_COL = 5;
const METRIC_COLS = [6, 7, 8, 9, 10, 11, 12];

const EXCEL_ERROR_RE = /^#(?:ref!|value!|name\?|div\/0!|null!|num!|n\/a)/i;

function getLCamSheet(wb) {
  if (!wb || !Array.isArray(wb.worksheets)) {
    return null;
  }
  return wb.worksheets.find((ws) => String(ws.name || '').trim().toLowerCase() === 'lcam') || null;
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

function parseFiniteNumber(cell) {
  if (!cell || cell.value == null || cell.value === '') {
    return null;
  }

  const raw = cell.value;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw === 'object' && raw !== null) {
    if (raw.error) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'result')) {
      const result = raw.result;
      if (typeof result === 'number') {
        return Number.isFinite(result) ? result : null;
      }
      if (typeof result === 'string') {
        return parseNumericString(result);
      }
      return null;
    }
  }

  return parseNumericString(cellText(cell));
}

function parseNumericString(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || EXCEL_ERROR_RE.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function toIsoDateParts(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseExcelDate(cell) {
  if (!cell || cell.value == null || cell.value === '') {
    return null;
  }

  const raw = cell.value;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return toIsoDateParts(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const wholeDays = Math.floor(raw);
    const utc = new Date(Date.UTC(1899, 11, 30) + wholeDays * 86400000);
    return toIsoDateParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }

  const text = cellText(cell).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return iso[0];
  }

  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) {
    return toIsoDateParts(parseInt(dmy[3], 10), parseInt(dmy[2], 10), parseInt(dmy[1], 10));
  }

  return null;
}

function parseHour(cell) {
  if (!cell || cell.value == null || cell.value === '') {
    return null;
  }

  const raw = cell.value;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 0 && raw <= 23 && Number.isInteger(raw)) {
      return String(raw).padStart(2, '0');
    }
    if (raw > 0 && raw < 1) {
      const hour = Math.floor(raw * 24);
      if (hour >= 0 && hour <= 23) {
        return String(hour).padStart(2, '0');
      }
    }
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const hour = raw.getHours();
    if (hour >= 0 && hour <= 23) {
      return String(hour).padStart(2, '0');
    }
  }

  const text = cellText(cell).trim();
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return String(hour).padStart(2, '0');
    }
  }

  const asInt = parseInt(text, 10);
  if (Number.isFinite(asInt) && asInt >= 0 && asInt <= 23) {
    return String(asInt).padStart(2, '0');
  }

  return null;
}

function readMetricHeaders(ws) {
  const headerRow = ws.getRow(HEADER_ROW);
  return METRIC_COLS.map((col) => {
    const header = cellText(headerRow.getCell(col));
    return { col, header };
  }).filter((entry) => entry.header);
}

function parse({ wb, filename, sourceFile }) {
  void filename;
  void sourceFile;

  const ws = getLCamSheet(wb);
  if (!ws) {
    return { kind: KIND, data: [] };
  }

  const metricHeaders = readMetricHeaders(ws);
  if (metricHeaders.length === 0) {
    return { kind: KIND, data: [] };
  }

  const data = [];
  const lastRow = ws.rowCount || ws.lastRow?.number || DATA_START_ROW;

  for (let rowNumber = DATA_START_ROW; rowNumber <= lastRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const date = parseExcelDate(row.getCell(DATE_COL));
    if (!date) {
      continue;
    }

    const hour = parseHour(row.getCell(HOUR_COL));
    if (!hour) {
      continue;
    }

    for (const { col, header } of metricHeaders) {
      const value = parseFiniteNumber(row.getCell(col));
      if (value == null) {
        continue;
      }

      data.push({
        date,
        metric: `${header}_h${hour}`,
        value,
      });
    }
  }

  return { kind: KIND, data };
}

module.exports = { parse };
