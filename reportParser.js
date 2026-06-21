/**
 * Build TrendsSnapshot field shapes from Excel buffers via the parser registry.
 * Used by snapshotPickers (legacy report parsing).
 */
const ExcelJS = require('exceljs');
const { cellText } = require('./services/plantReports/excelUtils');
const { getParserForFilename } = require('./services/plantReports/parsers/parserRegistry');
const { parseNullableNumber } = require('./services/plantReports/parsers/common');

async function loadWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function isoToDmyFilename(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const mi = parseInt(m, 10);
  return `${parseInt(d, 10)}.${months[mi - 1] || 'Jan'}.${y}`;
}

function syntheticFilename(reportDate, hint) {
  const d = String(reportDate || '').slice(0, 10);
  if (hint === 'water') return `${d}_Daily_water_consumption_followup master.xlsx`;
  if (hint === 'energy') {
    const [y, mo, day] = d.split('-');
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return `DAILY ACTUAL ENERGY PRODUCED REPORT QIPP ${day}-${months[parseInt(mo, 10) - 1]}-${y}.xlsx`;
  }
  if (hint === 'chemistry') return `RO-HRSG Report - ${d} M.xlsx`;
  if (hint === 'dailyOps') return `Daily Operation Report ${isoToDmyFilename(d)}.xlsx`;
  if (hint === 'air') return `GTs Air Intake Filter DP ${isoToDmyFilename(d)}.xlsx`;
  if (hint === 'fuel') return `GTs FG filter DP ${isoToDmyFilename(d)}.xlsx`;
  return `report-${d}.xlsx`;
}

async function runRegistryParse(buffer, filename, hint, reportDate) {
  const name = filename || syntheticFilename(reportDate, hint);
  const wb = await loadWorkbook(buffer);
  const parser = getParserForFilename(name);
  if (!parser) return null;
  return parser.parse({ wb, filename: name, sourceFile: name });
}

function pickAnchorDate(points, anchorDate) {
  if (!points.length) return anchorDate;
  const want = String(anchorDate || '').slice(0, 10);
  if (points.some((p) => p.reportDate === want)) return want;
  const prefix = want.slice(0, 7);
  const inMonth = points
    .map((p) => p.reportDate)
    .filter((d) => d && d.startsWith(prefix))
    .sort();
  return inMonth.length ? inMonth[inMonth.length - 1] : points[points.length - 1].reportDate;
}

function nestParamBlock(ws, isHrsg) {
  const block = {};
  if (isHrsg) {
    let headerRowNum = null;
    for (let r = 1; r <= 20; r++) {
      const c1 = String(cellText(ws.getRow(r).getCell(1)) || '').toLowerCase();
      if (c1.includes('unit')) {
        headerRowNum = r;
        break;
      }
    }
    if (!headerRowNum) return block;
    const colKey = {};
    ws.getRow(headerRowNum).eachCell({ includeEmpty: false }, (cell, col) => {
      const h = String(cellText(cell) || '').trim();
      if (h) colKey[col] = h;
    });
    for (let r = headerRowNum + 1; r <= Math.min(ws.rowCount || 500, 500); r++) {
      const row = ws.getRow(r);
      const unit = String(cellText(row.getCell(1)) || '').trim();
      if (!unit) continue;
      const unitKey = unit.replace(/\s+/g, '');
      if (!block[unitKey]) block[unitKey] = {};
      for (const [colStr, h] of Object.entries(colKey)) {
        const col = parseInt(colStr, 10);
        if (col === 1) continue;
        let val = parseNullableNumber(row.getCell(col));
        if (/do/i.test(h) && typeof val === 'number' && val < 0) val = null;
        block[unitKey][h] = val;
      }
    }
    return block;
  }

  const header = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    if (col === 1) return;
    const h = String(cellText(cell) || '').trim();
    if (h) header[col] = h;
  });
  for (let r = 2; r <= Math.min(ws.rowCount || 500, 500); r++) {
    const row = ws.getRow(r);
    const sp = String(cellText(row.getCell(1)) || '').trim();
    if (!sp) continue;
    const spKey = sp.replace(/\s+/g, '_');
    if (!block[spKey]) block[spKey] = {};
    for (const [colStr, h] of Object.entries(header)) {
      const col = parseInt(colStr, 10);
      const val = parseNullableNumber(row.getCell(col));
      block[spKey][h] = val;
    }
  }
  return block;
}

function buildWaterFromPoints(points, anchorDate) {
  const anchor = pickAnchorDate(points, anchorDate);
  const dayPoints = points.filter((p) => p.reportDate === anchor);
  const water = {
    grConsumption: {},
    totalGrConsumption: null,
    tankLevels: { ST1: null, ST2: null, DT1: null, DT2: null },
    swProduction: null,
    swConsumption: null,
    dmProduction: null,
    dmConsumption: null,
  };

  for (const p of dayPoints) {
    const label = String(p.displayName || p.label || '').trim();
    const v = p.value;
    if (!Number.isFinite(v)) continue;
    if (/^GR-\d/i.test(label) && /consumpt/i.test(label)) {
      water.grConsumption[label.split(/\s/)[0]] = v;
      continue;
    }
    if (/total gr consumpt/i.test(label)) {
      water.totalGrConsumption = v;
      continue;
    }
    if (/ST-1/i.test(label)) water.tankLevels.ST1 = v;
    else if (/ST-2/i.test(label)) water.tankLevels.ST2 = v;
    else if (/DT-1/i.test(label)) water.tankLevels.DT1 = v;
    else if (/DT-2/i.test(label)) water.tankLevels.DT2 = v;
    else if (/total sw prod/i.test(label)) water.swProduction = v;
    else if (/total sw consumpt/i.test(label)) water.swConsumption = v;
    else if (/total dm prod/i.test(label)) water.dmProduction = v;
    else if (/total dm consumpt/i.test(label)) water.dmConsumption = v;
  }
  return water;
}

function buildEnergyFromPoints(points) {
  const hourly = points
    .filter((p) => /energy_hourly.*actual/i.test(p.metricKey))
    .map((p) => ({
      hour: String(p.columnKey || '').replace(/^h/, '') || '0',
      actualMWh: p.value,
      availableMW: null,
    }));
  const total = points.find((p) => /daily_total_energy/i.test(p.metricKey));
  return {
    contractedCapacityMW: null,
    totalActualEnergyMWh: total?.value ?? null,
    peakAvailabilityMW: null,
    hourlyData: hourly,
  };
}

function buildDailyOpsFromPoints(points) {
  const groups = {};
  for (const p of points) {
    const m = String(p.metricKey || '').match(/daily_op_([a-z0-9]+)_avg_mw/i);
    if (m) groups[m[1].toUpperCase()] = p.value;
  }
  const load = points.find((p) => p.metricKey === 'daily_op_total_plant_load_mw');
  return {
    totalPlantLoadMW: load?.value ?? null,
    groups,
  };
}

function buildFilterFromPoints(points) {
  const out = {};
  for (const p of points) {
    const key = String(p.metricKey || '');
    const m = key.match(/gt_(?:fg|air)_filter_dp_(gt[\d]+)_(.+)/i);
    if (!m) continue;
    const gt = m[1].toUpperCase();
    const param = m[2];
    if (!out[gt]) out[gt] = {};
    out[gt][param] = p.value;
  }
  return out;
}

async function parseWaterConsumption(buffer, options = {}) {
  const res = await runRegistryParse(
    buffer,
    options.filename,
    'water',
    options.reportDate
  );
  if (!res || res.skipped || !res.points?.length) {
    return {
      grConsumption: {},
      totalGrConsumption: null,
      tankLevels: { ST1: null, ST2: null, DT1: null, DT2: null },
      swProduction: null,
      swConsumption: null,
      dmProduction: null,
      dmConsumption: null,
    };
  }
  return buildWaterFromPoints(res.points, options.reportDate || res.reportDate);
}

async function parseEnergyReport(buffer, options = {}) {
  const res = await runRegistryParse(
    buffer,
    options.filename,
    'energy',
    options.reportDate
  );
  if (!res || res.skipped) {
    return {
      contractedCapacityMW: null,
      totalActualEnergyMWh: null,
      peakAvailabilityMW: null,
      hourlyData: [],
    };
  }
  return buildEnergyFromPoints(res.points);
}

async function parseROHRSGReport(buffer, options = {}) {
  const name = options.filename || syntheticFilename(options.reportDate, 'chemistry');
  const wb = await loadWorkbook(buffer);
  const chemistry = { ro: {}, hrsg: {} };
  for (const ws of wb.worksheets) {
    const n = String(ws.name || '').toLowerCase();
    if (n.includes('hrsg')) Object.assign(chemistry.hrsg, nestParamBlock(ws, true));
    if (n.includes('ro')) Object.assign(chemistry.ro, nestParamBlock(ws, false));
  }
  if (!Object.keys(chemistry.ro).length && !Object.keys(chemistry.hrsg).length) {
    const res = await runRegistryParse(buffer, name, 'chemistry', options.reportDate);
    if (res?.points?.length) {
      return { ro: { snapshot: 'flat-points-only' }, hrsg: {} };
    }
  }
  return chemistry;
}

async function parseDailyOperationReport(buffer, options = {}) {
  const res = await runRegistryParse(
    buffer,
    options.filename,
    'dailyOps',
    options.reportDate
  );
  if (!res || res.skipped) {
    return { totalPlantLoadMW: null, groups: {} };
  }
  return buildDailyOpsFromPoints(res.points);
}

async function parseGtFilterDP(buffer, kind = 'air', options = {}) {
  const hint = kind === 'fuel' || kind === 'fg' ? 'fuel' : 'air';
  const res = await runRegistryParse(
    buffer,
    options.filename,
    hint,
    options.reportDate
  );
  if (!res || res.skipped) return {};
  return buildFilterFromPoints(res.points);
}

module.exports = {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
};
