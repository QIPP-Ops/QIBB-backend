const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, parseDdMonthYyyyFromFilename, makePoint } = require('./common');

function headerIndexMap(headerRow) {
  const map = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = String(cellText(cell) || '').trim().toLowerCase();
    if (!h) return;
    map[h] = col;
  });
  return map;
}

function findCol(map, patterns) {
  for (const [h, col] of Object.entries(map)) {
    if (patterns.some((re) => re.test(h))) return col;
  }
  return null;
}

function parse({ wb, filename, sourceFile }) {
  const reportDate = parseDdMonthYyyyFromFilename(filename);
  if (!reportDate) {
    return { skipped: true, kind: 'energy', points: [], highlights: [], reportDate: null };
  }

  const ws = wb.worksheets[0];
  if (!ws) return { skipped: true, kind: 'energy', points: [], highlights: [], reportDate };

  const headerRow = ws.getRow(1);
  const map = headerIndexMap(headerRow);

  const hourCol = findCol(map, [/^hr\b/, /^hour\b/]) || 1;
  const actualCol = findCol(map, [/actual.*energy.*mwh/, /\beai\b.*mwh/, /actual_mwh/]);
  const ldcCol = findCol(map, [/ldc.*reduction.*mwh/, /ldc_reduction/]);
  const remarksCol = findCol(map, [/remark/, /comments?/]);

  let sumActual = 0;
  let sumLdc = 0;
  let hasActual = false;
  let hasLdc = false;
  const highlights = [];
  const points = [];

  for (let r = 2; r <= Math.min(ws.rowCount || 200, 200); r++) {
    const row = ws.getRow(r);
    const hourRaw = cellText(row.getCell(hourCol));
    const hour = parseInt(String(hourRaw || '').trim(), 10);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;

    const actual = actualCol ? parseNullableNumber(row.getCell(actualCol)) : null;
    const ldc = ldcCol ? parseNullableNumber(row.getCell(ldcCol)) : null;

    if (typeof actual === 'number') {
      hasActual = true;
      sumActual += actual;
      points.push(
        makePoint({
          metricKey: slugKey(['energy_hourly', 'actual_mwh']),
          label: 'Actual Energy Produced (hourly)',
          displayName: 'Actual Energy Produced (hourly)',
          category: 'energy',
          unit: 'MWh',
          reportDate,
          value: actual,
          equipmentId: '',
          sourceFile,
          sheetName: ws.name,
          columnKey: `h${String(hour).padStart(2, '0')}`,
        })
      );
    }
    if (typeof ldc === 'number') {
      hasLdc = true;
      sumLdc += ldc;
      points.push(
        makePoint({
          metricKey: slugKey(['energy_hourly', 'ldc_reduction_mwh']),
          label: 'LDC Reduction (hourly)',
          displayName: 'LDC Reduction (hourly)',
          category: 'energy',
          unit: 'MWh',
          reportDate,
          value: ldc,
          equipmentId: '',
          sourceFile,
          sheetName: ws.name,
          columnKey: `h${String(hour).padStart(2, '0')}`,
        })
      );
    }

    const remark = remarksCol ? String(cellText(row.getCell(remarksCol)) || '').trim() : '';
    if (remark) {
      highlights.push({
        reportDate,
        sourceFile,
        sheetName: ws.name,
        category: 'energy_remark',
        text: remark.slice(0, 2000),
        author: '',
        crew: '',
        occurredAt: new Date(`${reportDate}T00:00:00Z`),
      });
    }
  }

  // Daily aggregates
  if (hasActual) {
    points.push(
      makePoint({
        metricKey: slugKey(['energy_daily', 'daily_total_energy_mwh']),
        label: 'Daily total energy',
        displayName: 'Daily total energy (MWh)',
        category: 'energy',
        unit: 'MWh',
        reportDate,
        value: sumActual,
        equipmentId: '',
        sourceFile,
        sheetName: ws.name,
        columnKey: 'daily_total',
      })
    );
  }
  if (hasLdc) {
    points.push(
      makePoint({
        metricKey: slugKey(['energy_daily', 'daily_total_ldc_reduction_mwh']),
        label: 'Daily total LDC reduction',
        displayName: 'Daily total LDC reduction (MWh)',
        category: 'energy',
        unit: 'MWh',
        reportDate,
        value: sumLdc,
        equipmentId: '',
        sourceFile,
        sheetName: ws.name,
        columnKey: 'daily_total',
      })
    );
  }

  return { skipped: false, kind: 'energy', points, highlights, reportDate };
}

module.exports = { parse };

