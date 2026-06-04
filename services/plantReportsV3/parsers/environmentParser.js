const path = require('path');

const KIND = 'environment';

const STACK_PARAMETERS = new Set(['NOx', 'SOx', 'CO as CO', 'Particulate', 'Stack Temp']);
const SUB_VALUES = new Set(['Minimum', 'Maximum', 'Average']);
const GT_LABEL_RE = /^GT#\d{2}$/;

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const EXCEL_ERROR_RE = /^#(?:ref!|value!|name\?|div\/0!|null!|num!|n\/a)/i;

function emptyResult() {
  return { kind: KIND, data: [] };
}

function getEnvironmentSheet(wb) {
  if (!wb || !Array.isArray(wb.worksheets)) {
    return null;
  }
  return (
    wb.worksheets.find((ws) => String(ws.name || '').trim().toLowerCase() === 'environment') || null
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
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed === '-' || EXCEL_ERROR_RE.test(trimmed)) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
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
      return parseNumericString(String(raw.result ?? ''));
    }
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

  const dmyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    return toIsoDate(parseInt(dmyDash[3], 10), parseInt(dmyDash[2], 10), parseInt(dmyDash[1], 10));
  }

  const dmyDot = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDot) {
    return toIsoDate(parseInt(dmyDot[3], 10), parseInt(dmyDot[2], 10), parseInt(dmyDot[1], 10));
  }

  const mon = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (mon) {
    const month = MONTHS[mon[2].toLowerCase().slice(0, 3)];
    if (!month) {
      return null;
    }
    let year = parseInt(mon[3], 10);
    if (year < 100) {
      year += 2000;
    }
    return toIsoDate(year, month, parseInt(mon[1], 10));
  }

  return null;
}

function parseDateFromFilename(filename) {
  const base = path.basename(String(filename || ''));

  const patterns = [
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{2})\.(\d{2})\.(\d{4})/,
    /(\d{1,2})\s+(\d{1,2})\s+(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = base.match(pattern);
    if (!match) {
      continue;
    }
    if (match[1].length === 4) {
      return toIsoDate(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10));
    }
    return toIsoDate(parseInt(match[3], 10), parseInt(match[2], 10), parseInt(match[1], 10));
  }

  return null;
}

function parseDateFromSheet(ws) {
  let found = null;

  ws.eachRow((row) => {
    if (found) {
      return;
    }
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (found) {
        return;
      }
      if (/^date$/i.test(cellText(cell).trim())) {
        const adjacent = parseDateText(cellText(row.getCell(col + 1)));
        if (adjacent) {
          found = adjacent;
        }
      }
    });
  });

  return found;
}

function resolveReportDate(filename, ws) {
  return parseDateFromFilename(filename) || parseDateFromSheet(ws);
}

function rowJoinedText(row) {
  const parts = [];
  row.eachCell({ includeEmpty: false }, (cell) => {
    const text = cellText(cell).trim();
    if (text) {
      parts.push(text);
    }
  });
  return parts.join(' ');
}

function matchStackParameter(text) {
  const trimmed = String(text || '').trim();
  for (const param of STACK_PARAMETERS) {
    if (trimmed === param) {
      return param;
    }
  }
  return null;
}

function collectGtColumns(row) {
  const gtCols = [];
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const label = cellText(cell).trim();
    if (GT_LABEL_RE.test(label)) {
      gtCols.push({ col, gt: label });
    }
  });
  gtCols.sort((a, b) => a.col - b.col);
  return gtCols;
}

function gtForColumn(gtCols, col) {
  let gt = null;
  for (const entry of gtCols) {
    if (entry.col <= col) {
      gt = entry.gt;
    }
  }
  return gt;
}

function buildSubColumnMap(gtRow, subRow) {
  const gtCols = collectGtColumns(gtRow);
  if (gtCols.length === 0) {
    return [];
  }

  const map = [];
  subRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const subValue = cellText(cell).trim();
    if (!SUB_VALUES.has(subValue)) {
      return;
    }
    const gt = gtForColumn(gtCols, col);
    if (!gt) {
      return;
    }
    map.push({ col, gt, subValue });
  });

  return map;
}

function isGtHeaderRow(row) {
  return collectGtColumns(row).length > 0;
}

function isStackBlockSubHeaderRow(row) {
  let count = 0;
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (SUB_VALUES.has(cellText(cell).trim())) {
      count += 1;
    }
  });
  return count >= 2;
}

function parseStackEmissions(ws, date, data, rowEnd) {
  const lastRow = rowEnd || ws.rowCount || 0;

  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row || !isGtHeaderRow(row)) {
      continue;
    }

    const subRow = ws.getRow(rowNumber + 1);
    if (!subRow || !isStackBlockSubHeaderRow(subRow)) {
      continue;
    }

    const columnMap = buildSubColumnMap(row, subRow);
    if (columnMap.length === 0) {
      continue;
    }

    for (let dataRowNum = rowNumber + 2; dataRowNum <= lastRow; dataRowNum += 1) {
      const dataRow = ws.getRow(dataRowNum);
      if (!dataRow) {
        break;
      }

      if (isGtHeaderRow(dataRow)) {
        break;
      }

      const joined = rowJoinedText(dataRow);
      if (/outfall/i.test(joined) || /^ambient\s/i.test(joined)) {
        break;
      }

      const parameter = matchStackParameter(cellText(dataRow.getCell(1)));
      if (!parameter) {
        continue;
      }

      for (const { col, gt, subValue } of columnMap) {
        const value = parseFiniteNumber(dataRow.getCell(col));
        if (value == null) {
          continue;
        }
        data.push({
          date,
          metric: `${parameter}_${gt}_${subValue}`,
          value,
        });
      }
    }
  }
}

function firstNumericInRow(row, startCol = 2) {
  const maxCol = row.cellCount || 20;
  for (let col = startCol; col <= maxCol; col += 1) {
    const value = parseFiniteNumber(row.getCell(col));
    if (value != null) {
      return value;
    }
  }
  return null;
}

function pushIfNumeric(data, date, metric, value) {
  if (value == null) {
    return;
  }
  data.push({ date, metric, value });
}

function parseOutfallStatus(ws, date, data, rowStart, rowEnd) {
  const rules = [
    {
      metric: 'pH_South side',
      match: (c1, c2) => /^ph$/i.test(c1) && /south/i.test(c2),
    },
    {
      metric: 'Temperature_South side',
      match: (c1, c2) => /^temperature$/i.test(c1) && /south/i.test(c2),
    },
    {
      metric: 'Temperature_North side',
      match: (c1, c2) => /^temperature$/i.test(c1) && /north/i.test(c2),
    },
    {
      metric: 'FRC_South side',
      match: (c1, c2) => /^frc$/i.test(c1) && /south/i.test(c2),
    },
    {
      metric: 'FRC_North side',
      match: (c1, c2) => /^frc$/i.test(c1) && /north/i.test(c2),
    },
    {
      metric: 'GR#1_FRC',
      match: (c1) => /^GR#1$/i.test(c1),
    },
    {
      metric: 'GR#2_FRC',
      match: (c1) => /^GR#2$/i.test(c1),
    },
    {
      metric: 'GR#3_FRC',
      match: (c1) => /^GR#3$/i.test(c1),
    },
    {
      metric: 'GR#4_FRC',
      match: (c1) => /^GR#4$/i.test(c1),
    },
    {
      metric: 'GR#5_FRC',
      match: (c1) => /^GR#5$/i.test(c1),
    },
    {
      metric: 'GR#6_FRC',
      match: (c1) => /^GR#6$/i.test(c1),
    },
  ];

  const from = rowStart || 1;
  const to = rowEnd || ws.rowCount || 0;

  for (let rowNumber = from; rowNumber <= to; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const c1 = cellText(row.getCell(1)).trim();
    const c2 = cellText(row.getCell(2)).trim();

    if (/^ambient\s/i.test(c1) || /weather\s*condition/i.test(c1)) {
      break;
    }

    for (const rule of rules) {
      const matched = rule.match.length === 1 ? rule.match(c1) : rule.match(c1, c2);
      if (!matched) {
        continue;
      }
      const value = firstNumericInRow(row, 2);
      pushIfNumeric(data, date, rule.metric, value);
      break;
    }
  }
}

function findPipeValueInRow(row) {
  const maxCol = row.cellCount || 15;
  for (let col = 2; col <= maxCol; col += 1) {
    const text = cellText(row.getCell(col)).trim();
    if (text.includes('|')) {
      return text;
    }
    const num = parseFiniteNumber(row.getCell(col));
    if (num != null && !/ambient|humidity|wind/i.test(cellText(row.getCell(1)))) {
      return text;
    }
  }
  return cellText(row.getCell(2)).trim();
}

function splitPipeMaxMin(text) {
  const parts = String(text || '')
    .split('|')
    .map((part) => part.trim());
  if (parts.length < 2) {
    return { max: null, min: null };
  }
  return {
    max: parseNumericString(parts[0]),
    min: parseNumericString(parts[1]),
  };
}

function parseAmbientConditions(ws, date, data, rowStart) {
  const from = rowStart || 1;
  const to = ws.rowCount || 0;

  for (let rowNumber = from; rowNumber <= to; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const label = cellText(row.getCell(1)).trim();

    if (/weather\s*condition/i.test(label)) {
      continue;
    }

    if (/^ambient\s*temp/i.test(label)) {
      const { max, min } = splitPipeMaxMin(findPipeValueInRow(row));
      pushIfNumeric(data, date, 'Ambient Temp_Max', max);
      pushIfNumeric(data, date, 'Ambient Temp_Min', min);
      continue;
    }

    if (/^ambient\s*relative\s*humidity/i.test(label)) {
      const { max, min } = splitPipeMaxMin(findPipeValueInRow(row));
      pushIfNumeric(data, date, 'Ambient Relative Humidity_Max', max);
      pushIfNumeric(data, date, 'Ambient Relative Humidity_Min', min);
      continue;
    }

    if (/^max\s*wind\s*velocity/i.test(label)) {
      const value = firstNumericInRow(row, 2);
      pushIfNumeric(data, date, 'Max Wind Velocity', value);
    }
  }
}

function findSectionRow(ws, pattern) {
  let rowNumber = null;
  ws.eachRow((row, r) => {
    if (rowNumber != null) {
      return;
    }
    if (pattern.test(rowJoinedText(row))) {
      rowNumber = r;
    }
  });
  return rowNumber;
}

function findOutfallDataStart(ws) {
  const headerRow = findSectionRow(ws, /outfall/i);
  if (headerRow) {
    return headerRow + 1;
  }

  let rowNumber = null;
  ws.eachRow((row, r) => {
    if (rowNumber != null) {
      return;
    }
    const c1 = cellText(row.getCell(1)).trim();
    const c2 = cellText(row.getCell(2)).trim();
    if (/^ph$/i.test(c1) && /south/i.test(c2)) {
      rowNumber = r;
    }
  });
  return rowNumber;
}

function parse({ wb, filename, sourceFile }) {
  void sourceFile;

  const ws = getEnvironmentSheet(wb);
  if (!ws) {
    return emptyResult();
  }

  const date = resolveReportDate(filename, ws);
  if (!date) {
    return emptyResult();
  }

  const data = [];
  const outfallDataStart = findOutfallDataStart(ws);
  const ambientRow = findSectionRow(ws, /ambient\s*temp/i);

  const stackEnd = outfallDataStart ? outfallDataStart - 1 : ambientRow ? ambientRow - 1 : ws.rowCount;
  parseStackEmissions(ws, date, data, stackEnd);

  const outfallStart = outfallDataStart || stackEnd + 1;
  const outfallEnd = ambientRow ? ambientRow - 1 : ws.rowCount;
  parseOutfallStatus(ws, date, data, outfallStart, outfallEnd);

  const ambientStart = ambientRow || outfallStart;
  parseAmbientConditions(ws, date, data, ambientStart);

  return { kind: KIND, data };
}

module.exports = { parse };
