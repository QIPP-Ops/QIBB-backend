const path = require('path');

const KIND = 'hrsg';

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

const VALID_UNIT_NUMBERS = new Set([
  10, 11, 12, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52, 60, 61, 62,
]);

const ST_UNIT_NUMBERS = new Set([10, 20, 30, 40, 50, 60]);
const GT_UNIT_NUMBERS = new Set([11, 12, 21, 22, 31, 32, 41, 42, 51, 52, 61, 62]);

const NULL_TEXT_RE = /^(sd|no sample|no sample flow)$/i;
const RANGE_RE = /\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/;
const EXCEL_ERROR_RE = /^#(?:ref!|value!|name\?|div\/0!|null!|num!|n\/a)/i;

const SECTION_DEFS = [
  {
    prefix: 'Condensate',
    matchTitle(text) {
      const t = text.trim();
      return t === 'Condensate (After chemical injection)' || /^condensate/i.test(t);
    },
    stOnly: true,
  },
  {
    prefix: 'BFW',
    matchTitle(text) {
      return text.trim().toUpperCase() === 'BFW';
    },
    stOnly: true,
  },
  {
    prefix: 'HP Drum',
    matchTitle(text) {
      return /hp\s*drum/i.test(text.trim());
    },
    stOnly: false,
  },
  {
    prefix: 'LP Drum',
    matchTitle(text) {
      return /lp\s*drum/i.test(text.trim());
    },
    stOnly: false,
  },
  {
    prefix: 'HP SH STEAM',
    matchTitle(text) {
      const t = text.trim();
      return /^hp\s*sh\s*steam/i.test(t) || t.toUpperCase() === 'HP SH STEAM' || /^hp\s*sh$/i.test(t);
    },
    stOnly: false,
  },
  {
    prefix: 'LP SH STEAM',
    matchTitle(text) {
      const t = text.trim();
      return (
        /^lp\s*sh\s*steam/i.test(t) ||
        /^lp\s*sh\s*seam/i.test(t) ||
        t.toUpperCase() === 'LP SH STEAM' ||
        /^lp\s*sh$/i.test(t)
      );
    },
    stOnly: false,
  },
];

function emptyResult() {
  return { kind: KIND, data: [] };
}

function normalizeHeader(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getHrsgSheet(wb) {
  if (!wb || !Array.isArray(wb.worksheets)) {
    return null;
  }
  return wb.worksheets.find((ws) => String(ws.name || '').toLowerCase().includes('hrsg')) || null;
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

  const monDmy = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (monDmy) {
    const month = MONTHS[monDmy[2].toLowerCase().slice(0, 3)];
    if (!month) {
      return null;
    }
    let year = parseInt(monDmy[3], 10);
    if (year < 100) {
      year += 2000;
    }
    return toIsoDate(year, month, parseInt(monDmy[1], 10));
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

function parseDateFromFilename(filename) {
  const base = path.basename(String(filename || ''));

  const monNamed = base.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{1,2})-(\d{4})/i,
  );
  if (monNamed) {
    const month = MONTHS[monNamed[1].toLowerCase().slice(0, 3)];
    if (month) {
      return toIsoDate(parseInt(monNamed[3], 10), month, parseInt(monNamed[2], 10));
    }
  }

  const dmyDash = base.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (dmyDash) {
    return toIsoDate(parseInt(dmyDash[3], 10), parseInt(dmyDash[2], 10), parseInt(dmyDash[1], 10));
  }

  const ymd = base.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return ymd[0];
  }

  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthMatch = base.toLowerCase().match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthMatch) {
    const m = monthNames.indexOf(monthMatch[1]) + 1;
    if (m > 0) {
      return `${monthMatch[3]}-${String(m).padStart(2, '0')}-${String(monthMatch[2]).padStart(2, '0')}`;
    }
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
      if (normalizeHeader(cellText(cell)) === 'date') {
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

function isSkippedValueText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed === '-' || trimmed === '–') {
    return true;
  }
  if (NULL_TEXT_RE.test(trimmed)) {
    return true;
  }
  if (RANGE_RE.test(trimmed)) {
    return true;
  }
  if (EXCEL_ERROR_RE.test(trimmed)) {
    return true;
  }
  return false;
}

function parseValue(cell) {
  if (!cell || cell.value == null || cell.value === '') {
    return null;
  }

  if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
    return cell.value;
  }

  const text = cellText(cell).trim();
  if (isSkippedValueText(text)) {
    return null;
  }

  if (typeof cell.value === 'object' && cell.value !== null && cell.value.error) {
    return null;
  }

  if (typeof cell.value === 'object' && cell.value !== null && 'result' in cell.value) {
    const resultText = String(cell.value.result ?? '').trim();
    if (isSkippedValueText(resultText)) {
      return null;
    }
    const cleaned = resultText.replace(/,/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  const cleaned = text.replace(/,/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function unitLabelFromNumber(unitNumber, stOnly) {
  if (!VALID_UNIT_NUMBERS.has(unitNumber)) {
    return null;
  }
  if (stOnly && !ST_UNIT_NUMBERS.has(unitNumber)) {
    return null;
  }
  if (!stOnly && !GT_UNIT_NUMBERS.has(unitNumber)) {
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

function parseUnitNumberFromCell(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || RANGE_RE.test(trimmed)) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return VALID_UNIT_NUMBERS.has(num) ? num : null;
  }

  const stMatch = trimmed.match(/^ST[- ]?(\d{2})$/i);
  if (stMatch) {
    const num = parseInt(stMatch[1], 10);
    return VALID_UNIT_NUMBERS.has(num) ? num : null;
  }

  const gtMatch = trimmed.match(/^GT[- ]?(\d{2})$/i);
  if (gtMatch) {
    const num = parseInt(gtMatch[1], 10);
    return VALID_UNIT_NUMBERS.has(num) ? num : null;
  }

  return null;
}

function isUnitHeader(text) {
  const norm = normalizeHeader(text);
  return norm === 'unit' || norm === 'unit no.' || norm === 'unit no' || norm.startsWith('unit ');
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

function findSectionMarkers(ws) {
  const markers = [];
  ws.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell).trim();
      for (const def of SECTION_DEFS) {
        if (def.matchTitle(text)) {
          markers.push({ rowNumber, def });
        }
      }
    });
  });

  markers.sort((a, b) => a.rowNumber - b.rowNumber);

  const deduped = [];
  for (const marker of markers) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.def.prefix === marker.def.prefix) {
      continue;
    }
    deduped.push(marker);
  }
  return deduped;
}

function findHeaderRow(ws, startRow, endRow) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }
    let unitCol = null;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (isUnitHeader(cellText(cell))) {
        unitCol = col;
      }
    });
    if (unitCol != null) {
      return { rowNumber, unitCol, row };
    }
  }
  return null;
}

function buildMetricColumns(headerRow, unitCol) {
  const columns = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col === unitCol) {
      return;
    }
    const header = cellText(cell).trim();
    if (!header || /recommend/i.test(normalizeHeader(header))) {
      return;
    }
    columns.push({ col, header });
  });
  return columns;
}

function parseSection(ws, marker, nextMarkerRow, date, data) {
  const startRow = marker.rowNumber;
  const endRow = nextMarkerRow ? nextMarkerRow - 1 : ws.rowCount || 500;
  const searchEnd = Math.min(startRow + 20, endRow);

  const header = findHeaderRow(ws, startRow, searchEnd);
  if (!header) {
    return;
  }

  const metricColumns = buildMetricColumns(header.row, header.unitCol);
  if (metricColumns.length === 0) {
    return;
  }

  for (let rowNumber = header.rowNumber + 1; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const joined = rowJoinedText(row);
    if (/ctp\s*dis\s*online\s*do\s*readings/i.test(joined)) {
      break;
    }

    for (const def of SECTION_DEFS) {
      if (def.matchTitle(joined)) {
        break;
      }
    }

    const unitNumber = parseUnitNumberFromCell(cellText(row.getCell(header.unitCol)).trim());
    const unit = unitLabelFromNumber(unitNumber, marker.def.stOnly);
    if (!unit) {
      continue;
    }

    for (const { col, header: columnHeader } of metricColumns) {
      const value = parseValue(row.getCell(col));
      if (value == null) {
        continue;
      }
      data.push({
        date,
        metric: `${marker.def.prefix}_${columnHeader}_${unit}`,
        value,
      });
    }
  }
}

function parseLegacyHrsgSheet(ws, date, data) {
  const header = findHeaderRow(ws, 1, 20);
  if (!header) {
    return;
  }

  const metricColumns = buildMetricColumns(header.row, header.unitCol);
  if (metricColumns.length === 0) {
    return;
  }

  const endRow = ws.rowCount || 500;
  for (let rowNumber = header.rowNumber + 1; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    if (!row) {
      continue;
    }

    const unitNumber = parseUnitNumberFromCell(cellText(row.getCell(header.unitCol)).trim());
    const unit = unitLabelFromNumber(unitNumber, false) || unitLabelFromNumber(unitNumber, true);
    if (!unit) {
      continue;
    }

    for (const { col, header: columnHeader } of metricColumns) {
      const value = parseValue(row.getCell(col));
      if (value == null) {
        continue;
      }
      data.push({
        date,
        metric: `HRSG_${columnHeader}_${unit}`,
        value,
      });
    }
  }
}

function parseSheet(ws, date, data) {
  const markers = findSectionMarkers(ws);
  if (markers.length === 0) {
    parseLegacyHrsgSheet(ws, date, data);
    return;
  }

  let ctpRow = null;
  ws.eachRow((row, rowNumber) => {
    if (ctpRow != null) {
      return;
    }
    if (/ctp\s*dis\s*online\s*do\s*readings/i.test(rowJoinedText(row))) {
      ctpRow = rowNumber;
    }
  });

  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];
    let nextRow = nextMarker ? nextMarker.rowNumber : ws.rowCount || 500;
    if (ctpRow && ctpRow < nextRow) {
      nextRow = ctpRow;
    }
    parseSection(ws, marker, nextRow, date, data);
  }
}

function parse({ wb, filename, sourceFile }) {
  void sourceFile;

  const ws = getHrsgSheet(wb);
  if (!ws) {
    return emptyResult();
  }

  const date = resolveReportDate(filename, ws);
  if (!date) {
    return emptyResult();
  }

  const data = [];
  parseSheet(ws, date, data);

  return { kind: KIND, data };
}

module.exports = { parse };
