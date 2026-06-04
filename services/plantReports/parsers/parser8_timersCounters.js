const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, toIsoDateOnly, makePoint, parseDmyFromFilename } = require('./common');
const { isFutureReportDate } = require('../reportDateGuards');

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
    if (!dateIso || isFutureReportDate(dateIso)) continue;

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

function compiledReportDateFromFilename(filename) {
  const iso = parseDmyFromFilename(filename);
  if (!iso) return null;
  const [yearStr, monthStr] = iso.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const monthEnd = new Date(Date.UTC(year, month, 0));
  return toIsoDateOnly(monthEnd);
}

function parseCompiledUnit(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = s.match(/\b(GT|ST)\s*[-#]?\s*(\d{2})\b/i);
  if (!m) return null;
  const type = m[1].toUpperCase();
  const n = m[2].padStart(2, '0');
  return `${type}-${n}`;
}

function parseCompiledSheet(ws, sourceFile, reportDate) {
  if (!reportDate) return [];
  const points = [];
  const maxRows = Math.min(ws.rowCount || 2000, 2000);
  if (!maxRows) return points;

  let headerRowIndex = null;
  let unitCol = null;
  let avgMwCol = null;
  let totalGenCol = null;
  let mfeqhCol = null;
  let dailyAuxCol = null;

  for (let r = 1; r <= Math.min(maxRows, 12); r++) {
    const row = ws.getRow(r);
    let found = 0;
    let localUnitCol = null;
    let localAvgMwCol = null;
    let localTotalGenCol = null;
    let localMfeqhCol = null;
    let localDailyAuxCol = null;

    for (let c = 1; c <= Math.min(row.cellCount || 100, 100); c++) {
      const t = String(cellText(row.getCell(c)) || '').trim().toLowerCase();
      if (!t) continue;
      if (localUnitCol == null && /unit/.test(t)) localUnitCol = c;
      if (localAvgMwCol == null && /avg|average/.test(t) && /mw/.test(t)) localAvgMwCol = c;
      if (localTotalGenCol == null && /total/.test(t) && /(genday|generation|mwhr|mwh)/.test(t)) localTotalGenCol = c;
      if (localMfeqhCol == null && /mfeqh/.test(t)) localMfeqhCol = c;
      if (localDailyAuxCol == null && /daily/.test(t) && /aux/.test(t)) localDailyAuxCol = c;
    }

    if (localAvgMwCol != null) found += 1;
    if (localTotalGenCol != null) found += 1;
    if (localMfeqhCol != null) found += 1;
    if (localDailyAuxCol != null) found += 1;

    if (found >= 2) {
      headerRowIndex = r;
      unitCol = localUnitCol || 1;
      avgMwCol = localAvgMwCol;
      totalGenCol = localTotalGenCol;
      mfeqhCol = localMfeqhCol;
      dailyAuxCol = localDailyAuxCol;
      break;
    }
  }

  if (headerRowIndex == null || totalGenCol == null) return points;

  for (let r = headerRowIndex + 1; r <= maxRows; r++) {
    const row = ws.getRow(r);
    const unitText = String(cellText(row.getCell(unitCol)) || '').trim();
    if (!unitText) continue;

    if (/total/i.test(unitText) && /plant/i.test(unitText)) {
      const totalPlantGen = parseNullableNumber(row.getCell(totalGenCol));
      if (totalPlantGen != null) {
        points.push(
          makePoint({
            metricKey: 'timers_counters_compiled_total_gen_mwh',
            label: 'Monthly Total Plant Generation (MWh)',
            displayName: 'Monthly Total Plant Generation (MWh)',
            category: 'timers',
            unit: 'MWh',
            reportDate,
            value: totalPlantGen,
            equipmentId: 'PLANT',
            sourceFile,
            sheetName: ws.name,
            columnKey: 'compiled_total',
          })
        );
      }
      continue;
    }

    const parsedUnit = parseCompiledUnit(unitText);
    if (!parsedUnit) continue;
    const unitSlug = parsedUnit.toLowerCase().replace('-', '');

    const avgMw = avgMwCol == null ? null : parseNullableNumber(row.getCell(avgMwCol));
    if (avgMw != null) {
      points.push(
        makePoint({
          metricKey: `timers_counters_compiled_${unitSlug}_avg_mw`,
          label: `${parsedUnit} Monthly Average MW`,
          displayName: `${parsedUnit} Monthly Average MW`,
          category: 'timers',
          unit: 'MW',
          reportDate,
          value: avgMw,
          equipmentId: parsedUnit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'compiled_avg_mw',
        })
      );
    }

    const totalGen = parseNullableNumber(row.getCell(totalGenCol));
    if (totalGen != null) {
      points.push(
        makePoint({
          metricKey: `timers_counters_compiled_${unitSlug}_total_gen_mwh`,
          label: `${parsedUnit} Monthly Total Generation (MWh)`,
          displayName: `${parsedUnit} Monthly Total Generation (MWh)`,
          category: 'timers',
          unit: 'MWh',
          reportDate,
          value: totalGen,
          equipmentId: parsedUnit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'compiled_total_gen_mwh',
        })
      );
    }

    const mfeqh = mfeqhCol == null ? null : parseNullableNumber(row.getCell(mfeqhCol));
    if (mfeqh != null) {
      points.push(
        makePoint({
          metricKey: `timers_counters_compiled_${unitSlug}_mfeqh_hours`,
          label: `${parsedUnit} MFEQH Hours`,
          displayName: `${parsedUnit} MFEQH Hours`,
          category: 'timers',
          unit: 'Hours',
          reportDate,
          value: mfeqh,
          equipmentId: parsedUnit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'compiled_mfeqh_hours',
        })
      );
    }

    const dailyAux = dailyAuxCol == null ? null : parseNullableNumber(row.getCell(dailyAuxCol));
    if (dailyAux != null) {
      points.push(
        makePoint({
          metricKey: `timers_counters_compiled_${unitSlug}_daily_aux_mwh`,
          label: `${parsedUnit} Daily Auxiliary Consumption (MWh)`,
          displayName: `${parsedUnit} Daily Auxiliary Consumption (MWh)`,
          category: 'timers',
          unit: 'MWh',
          reportDate,
          value: dailyAux,
          equipmentId: parsedUnit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'compiled_daily_aux_mwh',
        })
      );
    }
  }

  return points;
}

function parse({ wb, filename, sourceFile, now = new Date() }) {
  const points = [];
  const compiledReportDate = compiledReportDateFromFilename(filename);
  const compiledDate =
    compiledReportDate && !isFutureReportDate(compiledReportDate, now) ? compiledReportDate : null;
  for (const ws of wb.worksheets) {
    if (/^group-?\d+/i.test(ws.name)) {
      points.push(...parseSheet(ws, sourceFile));
      continue;
    }
    if (/compiled/i.test(ws.name) || /summary/i.test(ws.name)) {
      points.push(...parseCompiledSheet(ws, sourceFile, compiledDate));
    }
  }
  if (!points.length) return { skipped: true, kind: 'timers', points: [], highlights: [], reportDate: null };
  // timers is multi-date; reportDate is not single, keep null to avoid mislabel.
  return { skipped: false, kind: 'timers', points, highlights: [], reportDate: null };
}

module.exports = { parse };

