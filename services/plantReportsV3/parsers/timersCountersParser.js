const path = require('path');

const KIND = 'timers_counters';

const VALID_UNIT_NUMBERS = new Set([
  11, 12, 10, 21, 22, 20, 31, 32, 30, 41, 42, 40, 51, 52, 50, 61, 62, 60,
]);

const GROUP_FIRST_UNITS = new Set([11, 21, 31, 41, 51, 61]);

const METRIC_COLUMNS = {
  avg: 'Average From Timer Sheet',
  total: 'Total Gen/Day (MWHR)',
  mfeqh: 'Today MFEQH (Hours)',
  aux: 'Daily Auxillary Consumption',
};

const EXCEL_ERROR_RE = /^#(?:ref!|value!|name\?|div\/0!|null!|num!|n\/a)/i;

function emptyResult() {
  return { kind: KIND, data: [] };
}

function getCompiledSheet(wb) {
  if (!wb || !Array.isArray(wb.worksheets)) {
    return null;
  }
  return (
    wb.worksheets.find((ws) => String(ws.name || '').toLowerCase().includes('compiled')) || null
  );
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

  const dmyDot = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDot) {
    return toIsoDate(parseInt(dmyDot[3], 10), parseInt(dmyDot[2], 10), parseInt(dmyDot[1], 10));
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

  if (trimmed instanceof Date && !Number.isNaN(trimmed.getTime())) {
    return toIsoDate(trimmed.getFullYear(), trimmed.getMonth() + 1, trimmed.getDate());
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
      const raw = cell.value;
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        found = toIsoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
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

function unitLabelFromNumber(unitNumber) {
  if (!VALID_UNIT_NUMBERS.has(unitNumber)) {
    return null;
  }
  const lastDigit = unitNumber % 10;
  if (lastDigit === 1 || lastDigit === 2) {
    return `GT-${String(unitNumber).padStart(2, '0')}`;
  }
  if (lastDigit === 0) {
    return `ST-${String(unitNumber).padStart(2, '0')}`;
  }
  return null;
}

function parseUnitNumber(text) {
  const trimmed = String(text || '').trim();
  if (/^total$/i.test(trimmed)) {
    return null;
  }

  const labeled = trimmed.match(/\b(GT|ST)[- ]?(\d{2})\b/i);
  if (labeled) {
    return parseInt(labeled[2], 10);
  }

  const num = parseInt(trimmed, 10);
  return Number.isFinite(num) ? num : null;
}

function detectHeaderRow(ws) {
  let header = null;
  ws.eachRow((row, rowNumber) => {
    if (header) {
      return;
    }

    let unitCol = null;
    let avgCol = null;
    let totalCol = null;
    let mfeqhCol = null;
    let auxCol = null;

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const text = cellText(cell).trim();
      const norm = normalizeHeader(text);
      if (norm === 'unit') {
        unitCol = col;
      } else if (norm === normalizeHeader(METRIC_COLUMNS.avg)) {
        avgCol = col;
      } else if (norm === normalizeHeader(METRIC_COLUMNS.total)) {
        totalCol = col;
      } else if (norm === normalizeHeader(METRIC_COLUMNS.mfeqh)) {
        mfeqhCol = col;
      } else if (norm === normalizeHeader(METRIC_COLUMNS.aux)) {
        auxCol = col;
      }
    });

    if (unitCol && avgCol) {
      header = { rowNumber, unitCol, avgCol, totalCol, mfeqhCol, auxCol };
    }
  });
  return header;
}

function pushMetric(data, date, metric, value) {
  if (value == null) {
    return;
  }
  data.push({ date, metric, value });
}

function parse({ wb, filename, sourceFile }) {
  void sourceFile;

  const ws = getCompiledSheet(wb);
  if (!ws) {
    return emptyResult();
  }

  const date = resolveReportDate(filename, ws);
  if (!date) {
    return emptyResult();
  }

  const header = detectHeaderRow(ws);
  if (!header) {
    return emptyResult();
  }

  const data = [];
  const maxRow = ws.rowCount || 500;
  let lastAuxValue = null;

  for (let rowNumber = header.rowNumber + 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const unitCellText = cellText(row.getCell(header.unitCol)).trim();
    if (!unitCellText || /^total$/i.test(unitCellText)) {
      continue;
    }

    const unitNumber = parseUnitNumber(unitCellText);
    if (unitNumber == null || !VALID_UNIT_NUMBERS.has(unitNumber)) {
      continue;
    }

    const unit = unitLabelFromNumber(unitNumber);
    if (!unit) {
      continue;
    }

    if (GROUP_FIRST_UNITS.has(unitNumber)) {
      lastAuxValue = null;
    }

    if (header.avgCol) {
      pushMetric(
        data,
        date,
        `${METRIC_COLUMNS.avg}_${unit}`,
        parseValue(row.getCell(header.avgCol)),
      );
    }
    if (header.totalCol) {
      pushMetric(
        data,
        date,
        `${METRIC_COLUMNS.total}_${unit}`,
        parseValue(row.getCell(header.totalCol)),
      );
    }
    if (header.mfeqhCol) {
      pushMetric(
        data,
        date,
        `${METRIC_COLUMNS.mfeqh}_${unit}`,
        parseValue(row.getCell(header.mfeqhCol)),
      );
    }

    if (header.auxCol) {
      let auxValue = parseValue(row.getCell(header.auxCol));
      if (auxValue != null) {
        lastAuxValue = auxValue;
      } else if (lastAuxValue != null) {
        auxValue = lastAuxValue;
      }
      pushMetric(data, date, `${METRIC_COLUMNS.aux}_${unit}`, auxValue);
    }
  }

  return { kind: KIND, data };
}

module.exports = { parse };
