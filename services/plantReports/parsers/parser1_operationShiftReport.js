const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, makePoint, toIsoDateOnly } = require('./common');

function findPlantStatusSheet(wb) {
  return (
    wb.getWorksheet('Plant Status ') ||
    wb.getWorksheet('Plant Status') ||
    wb.worksheets.find((s) => /plant status/i.test(s.name))
  );
}

function findHeaderDate(ws) {
  // Spec says: "parse Plant Status sheet header dates per shift blocks"
  // Minimal implementation: find first Date cell in first 5 rows.
  for (let r = 1; r <= 5; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount || 30, 30); c++) {
      const v = row.getCell(c).value;
      if (v instanceof Date && !Number.isNaN(v.getTime())) return toIsoDateOnly(v);
      const t = String(cellText(row.getCell(c)) || '').trim();
      if (/\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
      const d = new Date(t);
      if (t && !Number.isNaN(d.getTime())) return toIsoDateOnly(d);
    }
  }
  return null;
}

function shiftFromBlockHeader(ws) {
  // Look for "Day" or "Night" in first 8 rows
  for (let r = 1; r <= 8; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount || 30, 30); c++) {
      const t = String(cellText(row.getCell(c)) || '').trim();
      if (/day\s*shift/i.test(t) || /\bday\b/i.test(t)) return 'Day';
      if (/night\s*shift/i.test(t) || /\bnight\b/i.test(t)) return 'Night';
    }
  }
  return null;
}

function parseHighlights(wb, fallbackDate, sourceFile) {
  const highlights = [];
  const activities =
    wb.getWorksheet('Day to Day activites') ||
    wb.getWorksheet('Day to Day activities') ||
    wb.worksheets.find((s) => /day to day/i.test(s.name));
  if (activities) {
    activities.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const desc = String(cellText(row.getCell(11)) || '').trim();
      if (!desc || desc.length < 10 || desc.includes('[object Object]')) return;
      const dateCell = row.getCell(1).value;
      const rowDate = dateCell instanceof Date ? toIsoDateOnly(dateCell) : fallbackDate;
      if (!rowDate) return;
      highlights.push({
        reportDate: rowDate,
        sourceFile,
        sheetName: activities.name,
        category: 'shift_activity',
        text: desc.slice(0, 2000),
        author: String(cellText(row.getCell(3)) || '').trim(),
        crew: String(cellText(row.getCell(5)) || '').trim(),
        occurredAt: dateCell instanceof Date ? dateCell : new Date(`${rowDate}T00:00:00Z`),
      });
    });
  }
  // BOP reports: any sheet containing 'bop' with remark-like text in first 20 rows.
  for (const ws of wb.worksheets) {
    if (!/bop/i.test(ws.name)) continue;
    for (let r = 1; r <= Math.min(ws.rowCount || 60, 60); r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty: false }, (cell) => {
        const t = String(cellText(cell) || '').trim();
        if (t && t.length >= 12) {
          highlights.push({
            reportDate: fallbackDate,
            sourceFile,
            sheetName: ws.name,
            category: 'bop_report',
            text: t.slice(0, 2000),
            author: '',
            crew: '',
            occurredAt: fallbackDate ? new Date(`${fallbackDate}T00:00:00Z`): null,
          });
        }
      });
    }
  }
  return highlights;
}

function parse({ wb, filename, sourceFile }) {
  const plantWs = findPlantStatusSheet(wb);
  if (!plantWs) return { skipped: true, kind: 'shift', points: [], highlights: [], reportDate: null };

  const reportDate = findHeaderDate(plantWs);
  if (!reportDate) return { skipped: true, kind: 'shift', points: [], highlights: [], reportDate: null };

  const shift = shiftFromBlockHeader(plantWs);
  const points = [];
  const highlights = parseHighlights(wb, reportDate, sourceFile);

  plantWs.eachRow((row, rowNum) => {
    if (rowNum < 6) return;
    const group = String(cellText(row.getCell(3)) || '').trim();
    if (!/^Group#\s*\d/i.test(group)) return;
    const sce = String(cellText(row.getCell(4)) || '').trim();
    const grandTotalPower = parseNullableNumber(row.getCell(5));

    // Skip blocks where Grand Total Power = 0 and SCE name empty
    if ((grandTotalPower === 0 || grandTotalPower === 0.0) && !sce) return;

    const power = grandTotalPower;
    const eff = parseNullableNumber(row.getCell(6));
    const press = parseNullableNumber(row.getCell(7));
    const temp = parseNullableNumber(row.getCell(8));

    const baseParts = ['operation_shift', group, sce, shift || ''];

    points.push(
      makePoint({
        metricKey: slugKey([...baseParts, 'power_mw']),
        label: `${group} ${sce} power MW`,
        displayName: `${group} ${sce} power MW${shift ? ` (${shift})` : ''}`,
        category: 'shift',
        unit: 'MW',
        reportDate,
        value: power,
        equipmentId: sce,
        sourceFile,
        sheetName: plantWs.name,
        columnKey: 'power',
      })
    );
    points.push(
      makePoint({
        metricKey: slugKey([...baseParts, 'efficiency']),
        label: `${group} ${sce} efficiency`,
        displayName: `${group} ${sce} efficiency${shift ? ` (${shift})` : ''}`,
        category: 'shift',
        unit: '%',
        reportDate,
        value: eff,
        equipmentId: sce,
        sourceFile,
        sheetName: plantWs.name,
        columnKey: 'efficiency',
      })
    );
    points.push(
      makePoint({
        metricKey: slugKey([...baseParts, 'pressure']),
        label: `${group} ${sce} pressure`,
        displayName: `${group} ${sce} pressure${shift ? ` (${shift})` : ''}`,
        category: 'shift',
        unit: '',
        reportDate,
        value: press,
        equipmentId: sce,
        sourceFile,
        sheetName: plantWs.name,
        columnKey: 'pressure',
      })
    );
    points.push(
      makePoint({
        metricKey: slugKey([...baseParts, 'temperature']),
        label: `${group} ${sce} temperature`,
        displayName: `${group} ${sce} temperature${shift ? ` (${shift})` : ''}`,
        category: 'shift',
        unit: '',
        reportDate,
        value: temp,
        equipmentId: sce,
        sourceFile,
        sheetName: plantWs.name,
        columnKey: 'temperature',
      })
    );
  });

  return { skipped: false, kind: 'shift', points, highlights, reportDate };
}

module.exports = { parse };

