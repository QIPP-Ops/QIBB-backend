const path = require('path');

const KIND = 'water';

const ALLOWED_METRICS = [
  'GR-1 CONSUMPT',
  'GR-2 CONSUMPT',
  'GR-3 CONSUMPT',
  'GR-4 CONSUMPT',
  'GR-5 CONSUMPT',
  'GR-6 CONSUMPT',
  'Total GR CONSUMPT',
  'ST-1 level',
  'ST-2 level',
  'DT-1 level',
  'DT-2 level',
  'Total SW PROD',
  'Total SW CONSUMPT',
  'Total DM PROD',
  'Total DM CONSUMPT',
  'Detal SW production vs consumption',
  'Detal DW production vs consumption',
];

const EXCEL_ERROR_RE = /^#(?:ref!|value!|name\?|div\/0!|null!|num!|n\/a)/i;

const ALLOWED_BY_NORMALIZED = new Map(
  ALLOWED_METRICS.map((name) => [normalizeMetricLabel(name).toLowerCase(), name]),
);

function normalizeMetricLabel(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function metricKeyFromName(name) {
  return normalizeMetricLabel(name).toLowerCase().replace(/\s+/g, '_');
}

function parseYearMonthFromFilename(filename) {
  const base = path.basename(String(filename || ''));
  const match = base.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (!match) {
    return null;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getMasterSheet(wb) {
  if (!wb || !Array.isArray(wb.worksheets)) {
    return null;
  }
  return (
    wb.worksheets.find((ws) => normalizeMetricLabel(ws.name).toLowerCase() === 'master') || null
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

function resolveAllowedMetric(cell) {
  const label = normalizeMetricLabel(cellText(cell));
  if (!label) {
    return null;
  }
  return ALLOWED_BY_NORMALIZED.get(label.toLowerCase()) || null;
}

function parse({ wb, filename, sourceFile }) {
  void sourceFile;

  const ym = parseYearMonthFromFilename(filename);
  const ws = getMasterSheet(wb);

  if (!ym || !ws) {
    return { kind: KIND, data: [] };
  }

  const maxDay = daysInMonth(ym.year, ym.month);
  const data = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) {
      return;
    }

    const metricName = resolveAllowedMetric(row.getCell(1));
    if (!metricName) {
      return;
    }

    const metric = metricKeyFromName(metricName);

    for (let col = 2; col <= 32; col += 1) {
      const day = col - 1;
      if (day < 1 || day > 31 || day > maxDay) {
        continue;
      }

      const value = parseFiniteNumber(row.getCell(col));
      if (value == null) {
        continue;
      }

      data.push({
        date: toIsoDate(ym.year, ym.month, day),
        metric,
        value,
      });
    }
  });

  return { kind: KIND, data };
}

module.exports = { parse };
