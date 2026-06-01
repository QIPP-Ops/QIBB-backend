const { cellText } = require('../excelUtils');
const { parseNullableNumber, parseDmyFromFilename, makePoint } = require('./common');

const KPI_DEFS = [
  {
    metricKey: 'daily_op_plant_gross_gen_mwh',
    displayName: 'Plant Gross Generation (MWh)',
    unit: 'MWh',
    keywords: ['plant', 'gross', 'generation'],
  },
  {
    metricKey: 'daily_op_plant_net_dispatch_mwh',
    displayName: 'Plant Net Dispatch (MWh)',
    unit: 'MWh',
    keywords: ['plant', 'net', 'dispatch'],
  },
  {
    metricKey: 'daily_op_plf_pct',
    displayName: 'Plant Load Factor (%)',
    unit: '%',
    keywords: ['plf'],
  },
  {
    metricKey: 'daily_op_commercial_availability_pct',
    displayName: 'Commercial Availability (%)',
    unit: '%',
    keywords: ['commercial', 'availability'],
  },
  {
    metricKey: 'daily_op_auxiliary_mwh',
    displayName: 'Auxiliary Consumption (MWh)',
    unit: 'MWh',
    keywords: ['auxiliary'],
  },
  {
    metricKey: 'daily_op_import_mwh',
    displayName: 'Import (MWh)',
    unit: 'MWh',
    keywords: ['import'],
  },
  {
    metricKey: 'daily_op_fuel_gas_tons',
    displayName: 'Fuel Gas (Tons)',
    unit: 'tons',
    keywords: ['fuel', 'gas'],
  },
  {
    metricKey: 'daily_op_heat_rate_kjkwh',
    displayName: 'Heat Rate (KJ/kWh)',
    unit: 'kJ/kWh',
    keywords: ['heat', 'rate'],
  },
  {
    metricKey: 'daily_op_net_efficiency_pct',
    displayName: 'Net Efficiency (%)',
    unit: '%',
    keywords: ['net', 'efficiency'],
  },
  {
    metricKey: 'daily_op_total_plant_load_mw',
    displayName: 'Total Plant Load (MW)',
    unit: 'MW',
    keywords: ['total', 'plant', 'load'],
  },
];

const AMBIENT_DEFS = [
  {
    metricKey: 'daily_op_ambient_temp_max_c',
    displayName: 'Max Ambient Temperature (C)',
    unit: 'C',
    keywords: ['max', 'amb', 'temp'],
  },
  {
    metricKey: 'daily_op_ambient_temp_min_c',
    displayName: 'Min Ambient Temperature (C)',
    unit: 'C',
    keywords: ['min', 'amb', 'temp'],
  },
  {
    metricKey: 'daily_op_humidity_max_pct',
    displayName: 'Max Humidity (%)',
    unit: '%',
    keywords: ['max', 'rh'],
  },
  {
    metricKey: 'daily_op_humidity_min_pct',
    displayName: 'Min Humidity (%)',
    unit: '%',
    keywords: ['min', 'rh'],
  },
];

const TANK_DEFS = [
  {
    metricKey: 'daily_op_sw_tank1_m3',
    displayName: 'SW Tank 1 Level (m3)',
    unit: 'm3',
    keywords: ['sw', 'tank', '1'],
  },
  {
    metricKey: 'daily_op_sw_tank2_m3',
    displayName: 'SW Tank 2 Level (m3)',
    unit: 'm3',
    keywords: ['sw', 'tank', '2'],
  },
  {
    metricKey: 'daily_op_dm_tank1_m3',
    displayName: 'DM Tank 1 Level (m3)',
    unit: 'm3',
    keywords: ['dm', 'tank', '1'],
  },
  {
    metricKey: 'daily_op_dm_tank2_m3',
    displayName: 'DM Tank 2 Level (m3)',
    unit: 'm3',
    keywords: ['dm', 'tank', '2'],
  },
];

function normalizeText(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
}

function rowText(row, maxCols) {
  const parts = [];
  for (let c = 1; c <= maxCols; c++) {
    const t = String(cellText(row.getCell(c)) || '').trim();
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

function findFirstNumericInRow(row, startCol, maxCols) {
  for (let c = startCol; c <= maxCols; c++) {
    const v = parseNullableNumber(row.getCell(c));
    if (v != null) return v;
  }
  return null;
}

function rowMatchesKeywords(row, keywords, maxCols) {
  const t = normalizeText(rowText(row, maxCols));
  if (!t) return false;
  return keywords.every((k) => t.includes(String(k).toLowerCase()));
}

function normalizeUnit(rawUnit) {
  const m = String(rawUnit == null ? '' : rawUnit)
    .trim()
    .toUpperCase()
    .match(/\b(GT|ST)\s*[-#]?\s*(\d{2})\b/);
  if (!m) return null;
  const type = m[1];
  const num = parseInt(m[2], 10);
  if (type === 'GT' && (num < 11 || num > 62)) return null;
  if (type === 'ST' && ![10, 20, 30, 40, 50, 60].includes(num)) return null;
  return `${type}-${String(num).padStart(2, '0')}`;
}

function detectUnitHeaderRow(ws, maxRows, maxCols) {
  for (let r = 1; r <= maxRows; r++) {
    const row = ws.getRow(r);
    let groupCol = null;
    let unitCol = null;
    let avgCol = null;
    let totalCol = null;
    let mfeqhCol = null;
    for (let c = 1; c <= maxCols; c++) {
      const t = normalizeText(cellText(row.getCell(c)));
      if (!t) continue;
      if (groupCol == null && t.includes('group')) groupCol = c;
      if (unitCol == null && /\bunit\b/.test(t)) unitCol = c;
      if (avgCol == null && /average/.test(t) && /\bmw\b/.test(t)) avgCol = c;
      if (totalCol == null && /total/.test(t) && /(genday|mwh|mwhr|generation)/.test(t)) totalCol = c;
      if (mfeqhCol == null && /mfeqh/.test(t)) mfeqhCol = c;
    }
    if (unitCol != null && avgCol != null && totalCol != null && mfeqhCol != null) {
      return { headerRow: r, groupCol, unitCol, avgCol, totalCol, mfeqhCol };
    }
  }
  return null;
}

function parseHighlights(ws, reportDate, sourceFile, maxRows, maxCols) {
  const highlights = [];
  for (let r = 1; r <= maxRows; r++) {
    const row = ws.getRow(r);
    const line = rowText(row, maxCols);
    if (!line) continue;
    if (!/major observations|observations/i.test(line)) continue;

    const collected = [];
    for (let rr = r; rr <= Math.min(maxRows, r + 20); rr++) {
      const t = rowText(ws.getRow(rr), maxCols).trim();
      if (!t) {
        if (collected.length) break;
        continue;
      }
      if (
        collected.length &&
        /(ambient|tank|kpi|group|unit|average mw|total genday|mfeqh)/i.test(t) &&
        !/observation/i.test(t)
      ) {
        break;
      }
      collected.push(t);
    }
    const text = collected.join('\n').trim().slice(0, 2000);
    if (text) {
      highlights.push({
        reportDate,
        sourceFile,
        sheetName: ws.name,
        category: 'daily_operation_observation',
        text,
        author: '',
        crew: '',
        occurredAt: new Date(`${reportDate}T00:00:00Z`),
      });
    }
    break;
  }
  return highlights;
}

function parse({ wb, filename, sourceFile }) {
  const reportDate = parseDmyFromFilename(filename);
  if (!reportDate) return { skipped: true, kind: 'daily_ops', points: [], highlights: [], reportDate: null };
  const ws = wb.worksheets[0];
  if (!ws) return { skipped: true, kind: 'daily_ops', points: [], highlights: [], reportDate };

  const maxRows = Math.min(ws.rowCount || 500, 500);
  const maxCols = Math.min(ws.columnCount || 30, 30);
  const points = [];

  for (const def of KPI_DEFS) {
    let value = null;
    for (let r = 1; r <= maxRows; r++) {
      const row = ws.getRow(r);
      if (!rowMatchesKeywords(row, def.keywords, maxCols)) continue;
      value = findFirstNumericInRow(row, 2, maxCols);
      break;
    }
    points.push(
      makePoint({
        metricKey: def.metricKey,
        label: def.displayName,
        displayName: def.displayName,
        category: 'daily_ops',
        unit: def.unit,
        reportDate,
        value,
        equipmentId: 'PLANT',
        sourceFile,
        sheetName: ws.name,
        columnKey: 'kpi',
      })
    );
  }

  const plantGross = points.find((p) => p.metricKey === 'daily_op_plant_gross_gen_mwh')?.value;
  if (plantGross == null || plantGross === 0) {
    return { skipped: true, kind: 'daily_ops', points: [], highlights: [], reportDate };
  }

  const unitHeader = detectUnitHeaderRow(ws, maxRows, maxCols);
  if (unitHeader) {
    for (let r = unitHeader.headerRow + 1; r <= maxRows; r++) {
      const row = ws.getRow(r);
      const unitText = cellText(row.getCell(unitHeader.unitCol));
      const unit = normalizeUnit(unitText);
      if (!unit) continue;
      const unitSlug = unit.toLowerCase().replace('-', '');

      const avgMw = parseNullableNumber(row.getCell(unitHeader.avgCol));
      const dailyMwh = parseNullableNumber(row.getCell(unitHeader.totalCol));
      const mfeqh = parseNullableNumber(row.getCell(unitHeader.mfeqhCol));

      points.push(
        makePoint({
          metricKey: `daily_op_${unitSlug}_avg_mw`,
          label: `${unit} Average MW`,
          displayName: `${unit} Average MW`,
          category: 'daily_ops',
          unit: 'MW',
          reportDate,
          value: avgMw,
          equipmentId: unit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'avg_mw',
        })
      );
      points.push(
        makePoint({
          metricKey: `daily_op_${unitSlug}_daily_mwh`,
          label: `${unit} Total GenDay MWHR`,
          displayName: `${unit} Total GenDay MWHR`,
          category: 'daily_ops',
          unit: 'MWh',
          reportDate,
          value: dailyMwh,
          equipmentId: unit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'daily_mwh',
        })
      );
      points.push(
        makePoint({
          metricKey: `daily_op_${unitSlug}_mfeqh_hours`,
          label: `${unit} MFEQH Hours`,
          displayName: `${unit} MFEQH Hours`,
          category: 'daily_ops',
          unit: 'Hours',
          reportDate,
          value: mfeqh,
          equipmentId: unit,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'mfeqh_hours',
        })
      );
    }
  }

  for (const def of AMBIENT_DEFS) {
    let value = null;
    for (let r = 1; r <= maxRows; r++) {
      const row = ws.getRow(r);
      if (!rowMatchesKeywords(row, def.keywords, maxCols)) continue;
      value = findFirstNumericInRow(row, 2, maxCols);
      break;
    }
    points.push(
      makePoint({
        metricKey: def.metricKey,
        label: def.displayName,
        displayName: def.displayName,
        category: 'daily_ops',
        unit: def.unit,
        reportDate,
        value,
        equipmentId: 'PLANT',
        sourceFile,
        sheetName: ws.name,
        columnKey: 'ambient',
      })
    );
  }

  for (const def of TANK_DEFS) {
    let value = null;
    for (let r = 1; r <= maxRows; r++) {
      const row = ws.getRow(r);
      if (!rowMatchesKeywords(row, def.keywords, maxCols)) continue;
      value = findFirstNumericInRow(row, 2, maxCols);
      break;
    }
    points.push(
      makePoint({
        metricKey: def.metricKey,
        label: def.displayName,
        displayName: def.displayName,
        category: 'daily_ops',
        unit: def.unit,
        reportDate,
        value,
        equipmentId: 'PLANT',
        sourceFile,
        sheetName: ws.name,
        columnKey: 'tank_level',
      })
    );
  }

  const highlights = parseHighlights(ws, reportDate, sourceFile, maxRows, maxCols);
  return { skipped: false, kind: 'daily_ops', points, highlights, reportDate };
}

module.exports = { parse };
