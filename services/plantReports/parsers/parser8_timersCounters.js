const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, toIsoDateOnly, makePoint } = require('./common');

function parseDateCell(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return toIsoDateOnly(v);
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  // Try Excel-like d/m/y or d.m.y, otherwise Date() parse.
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, '0');
    const mm = String(dmy[2]).padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toIsoDateOnly(d);
  return null;
}

/**
 * TIMERS & COUNTERS: parse daily deltas from cumulative counters per column.
 * "Physically impossible negatives" => null deltas (delta < 0).
 */
function parseSheet(ws, sourceFile) {
  const points = [];

  // header row expected at 1: A1 has previous-month-end date, then equipment labels.
  const headerRow = ws.getRow(1);
  const colMeta = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    if (col === 1) return;
    const h = String(cellText(cell) || '').trim();
    if (!h) return;
    colMeta[col] = { label: h };
  });

  // Track previous cumulative values per column.
  const prevByCol = {};

  for (let r = 2; r <= Math.min(ws.rowCount || 2000, 2000); r++) {
    const row = ws.getRow(r);
    const dateIso = parseDateCell(row.getCell(1).value ?? cellText(row.getCell(1)));
    if (!dateIso) continue;

    for (const [colStr, meta] of Object.entries(colMeta)) {
      const col = parseInt(colStr, 10);
      const rawVal = parseNullableNumber(row.getCell(col));
      if (rawVal == null) continue;

      const prev = prevByCol[col];
      prevByCol[col] = rawVal;
      if (prev == null) continue; // no delta for first observed day

      const delta = rawVal - prev;
      const safeDelta = Number.isFinite(delta) && delta >= 0 ? delta : null;

      const metricKey = slugKey(['timers_counters', ws.name, meta.label, 'delta']);
      points.push(
        makePoint({
          metricKey,
          label: `${meta.label} delta`,
          displayName: `${meta.label} delta`,
          category: 'timers',
          unit: '',
          reportDate: dateIso,
          value: safeDelta,
          equipmentId: meta.label,
          sourceFile,
          sheetName: ws.name,
          columnKey: `c${col}`,
        })
      );
    }
  }

  return points;
}

function parse({ wb, filename, sourceFile }) {
  const points = [];
  for (const ws of wb.worksheets) {
    if (!/^group-?\d+/i.test(ws.name)) continue;
    points.push(...parseSheet(ws, sourceFile));
  }
  if (!points.length) return { skipped: true, kind: 'timers', points: [], highlights: [], reportDate: null };
  // timers is multi-date; reportDate is not single, keep null to avoid mislabel.
  return { skipped: false, kind: 'timers', points, highlights: [], reportDate: null };
}

module.exports = { parse };

