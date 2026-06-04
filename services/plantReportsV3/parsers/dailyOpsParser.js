const path = require('path');

const KIND = 'daily_ops';

const PLANT_LEVEL_LABELS = [
  'TOTAL PLANT LOAD IN MW',
  'Plant Gross Generation',
  'Plant Net Dispatch',
  'Rated Capacity of each Group',
  'Gross(MWH)',
  'PLF%',
  'NET(MWH)',
  'Commercial Availability factor %(DTD)',
  'Auxiliary(MWH)',
  'Import(MWH)',
  'Fuel Gas (TONS)',
  'Gas Heating value (KJ/KG)',
  'Heat Rate',
  'Net efficiency',
];

const AMBIENT_LABELS = [
  'Max. Amb. Temp (Dry bulb) ˚C',
  'Min. Amb. Temp (Dry bulb) ˚C',
  'Max. RH %',
  'MIN. RH %',
  'Wind Speed',
];

const RO_WATER_LABELS = ['RO Production, m3'];

const TANK_METRICS = [
  { rowLabel: 'Service Water', metric: 'Service Water Tank#1', tankHeader: 'Tank#1' },
  { rowLabel: 'Service Water', metric: 'Service Water Tank#2', tankHeader: 'Tank#2' },
  { rowLabel: 'DM Water', metric: 'DM Water Tank#1', tankHeader: 'Tank#1' },
  { rowLabel: 'DM Water', metric: 'DM Water Tank#2', tankHeader: 'Tank#2' },
];

const UNIT_COLUMN_LABELS = {
  avg: 'Average From Timer Sheet',
  total: 'Total Gen/Day (MWHR)',
  mfeqh: 'Today MFEQH (Hours)',
};

const SKIP_ROW_RE =
  /remarks|notes|expected date of return|estimated outage|^gr\s*\d|^group\s*\d/i;

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
  if (trimmed.endsWith('%')) {
    trimmed = trimmed.slice(0, -1).trim();
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

  return null;
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
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (found) {
        return;
      }
      if (cellText(cell).trim() === 'Date') {
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

function pushMetric(data, date, metric, value) {
  if (value == null) {
    return;
  }
  data.push({ date, metric, value });
}

function extractNumericNear(ws, rowNumber, col) {
  const row = ws.getRow(rowNumber);
  if (!row) {
    return null;
  }

  const maxCol = Math.min((ws.columnCount || 40) + col, col + 12);
  for (let c = col + 1; c <= maxCol; c += 1) {
    const value = parseValue(row.getCell(c));
    if (value != null) {
      return value;
    }
  }

  const below = ws.getRow(rowNumber + 1);
  if (below) {
    for (let c = col; c <= col + 4; c += 1) {
      const value = parseValue(below.getCell(c));
      if (value != null) {
        return value;
      }
    }
  }

  return null;
}

function findLabelCell(ws, exactLabel) {
  let match = null;
  ws.eachRow((row, rowNumber) => {
    if (match) {
      return;
    }
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (match) {
        return;
      }
      if (cellText(cell).trim() === exactLabel) {
        match = { rowNumber, col };
      }
    });
  });
  return match;
}

function extractLabels(ws, date, data, labels) {
  for (const label of labels) {
    const found = findLabelCell(ws, label);
    if (!found) {
      continue;
    }
    const value = extractNumericNear(ws, found.rowNumber, found.col);
    pushMetric(data, date, label, value);
  }
}

function unitFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || SKIP_ROW_RE.test(trimmed)) {
    return null;
  }

  const labeled = trimmed.match(/\b(GT|ST)[- ]?(\d{2})\b/i);
  if (labeled) {
    const type = labeled[1].toUpperCase();
    const num = labeled[2];
    return `${type}-${num}`;
  }

  const num = parseInt(trimmed, 10);
  if (!Number.isFinite(num)) {
    return null;
  }

  const lastDigit = num % 10;
  if (lastDigit === 1 || lastDigit === 2) {
    return `GT-${String(num).padStart(2, '0')}`;
  }
  if (lastDigit === 0) {
    return `ST-${String(num).padStart(2, '0')}`;
  }

  return null;
}

function detectUnitTableHeader(ws) {
  let header = null;
  ws.eachRow((row, rowNumber) => {
    let avgCol = null;
    let totalCol = null;
    let mfeqhCol = null;
    let unitCol = null;

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const text = cellText(cell).trim();
      if (text === UNIT_COLUMN_LABELS.avg) {
        avgCol = col;
      } else if (text === UNIT_COLUMN_LABELS.total) {
        totalCol = col;
      } else if (text === UNIT_COLUMN_LABELS.mfeqh) {
        mfeqhCol = col;
      } else if (text === 'Unit') {
        unitCol = col;
      }
    });

    if (avgCol && totalCol && mfeqhCol) {
      header = { rowNumber, avgCol, totalCol, mfeqhCol, unitCol };
    }
  });
  return header;
}

function extractUnitMetrics(ws, date, data) {
  const header = detectUnitTableHeader(ws);
  if (!header) {
    return;
  }

  const maxRow = ws.rowCount || 500;
  for (let rowNumber = header.rowNumber + 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      break;
    }

    const unitText = header.unitCol
      ? cellText(row.getCell(header.unitCol)).trim()
      : cellText(row.getCell(1)).trim();

    if (!unitText || SKIP_ROW_RE.test(unitText)) {
      continue;
    }

    const unit = unitFromText(unitText);
    if (!unit) {
      continue;
    }

    const avg = parseValue(row.getCell(header.avgCol));
    const total = parseValue(row.getCell(header.totalCol));
    const mfeqh = parseValue(row.getCell(header.mfeqhCol));

    pushMetric(data, date, `${UNIT_COLUMN_LABELS.avg}_${unit}`, avg);
    pushMetric(data, date, `${UNIT_COLUMN_LABELS.total}_${unit}`, total);
    pushMetric(data, date, `${UNIT_COLUMN_LABELS.mfeqh}_${unit}`, mfeqh);
  }
}

function findRowWithLabel(ws, label) {
  let rowNumber = null;
  ws.eachRow((row, r) => {
    if (rowNumber != null) {
      return;
    }
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (rowNumber != null) {
        return;
      }
      if (cellText(cell).trim() === label) {
        rowNumber = r;
      }
    });
  });
  return rowNumber;
}

function findColumnInRow(row, headerText) {
  let col = null;
  row.eachCell({ includeEmpty: false }, (cell, c) => {
    if (col != null) {
      return;
    }
    if (cellText(cell).trim() === headerText) {
      col = c;
    }
  });
  return col;
}

function extractTankMetrics(ws, date, data) {
  for (const tank of TANK_METRICS) {
    let headerRowNumber = null;
    let tankCol = null;

    ws.eachRow((row, rowNumber) => {
      if (headerRowNumber != null) {
        return;
      }
      const rowText = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        rowText.push(cellText(cell).trim());
      });
      if (!rowText.some((t) => t === tank.rowLabel)) {
        return;
      }
      const col = findColumnInRow(row, tank.tankHeader);
      if (col != null) {
        headerRowNumber = rowNumber;
        tankCol = col;
      }
    });

    if (headerRowNumber == null || tankCol == null) {
      const direct = findLabelCell(ws, tank.metric);
      if (direct) {
        pushMetric(data, date, tank.metric, extractNumericNear(ws, direct.rowNumber, direct.col));
      }
      continue;
    }

    const valueRow = ws.getRow(headerRowNumber + 1);
    if (valueRow) {
      pushMetric(data, date, tank.metric, parseValue(valueRow.getCell(tankCol)));
    }
  }
}

function extractChillerMetrics(ws, date, data) {
  let region = null;

  ws.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const text = cellText(cell).trim();

      if (text === 'South Chiller System') {
        region = 'south';
        return;
      }
      if (text === 'North Chiller System') {
        region = 'north';
        return;
      }

      if (!region) {
        return;
      }

      if (text === 'TES Charge%') {
        const value = extractNumericNear(ws, rowNumber, col);
        const metric =
          region === 'south' ? 'South Chiller TES Charge%' : 'North Chiller TES Charge%';
        pushMetric(data, date, metric, value);
        return;
      }

      if (text === 'Average. Return Water Temp. ˚C') {
        const value = extractNumericNear(ws, rowNumber, col);
        const metric =
          region === 'south'
            ? 'South Chiller Avg Return Water Temp ˚C'
            : 'North Chiller Avg Return Water Temp ˚C';
        pushMetric(data, date, metric, value);
      }
    });
  });
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

  const data = [];

  extractLabels(ws, date, data, PLANT_LEVEL_LABELS);
  extractUnitMetrics(ws, date, data);
  extractLabels(ws, date, data, AMBIENT_LABELS);
  extractLabels(ws, date, data, RO_WATER_LABELS);
  extractTankMetrics(ws, date, data);
  extractChillerMetrics(ws, date, data);

  return { kind: KIND, data };
}

module.exports = { parse };
