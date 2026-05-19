const { cellText, parseNumber, slugKey, hasNumericInRow } = require('../excelUtils');

const SKIP_VALUES = /^(sd|n\/a|no sample|not working|-)$/i;

function parseRoHrsgWorkbook(wb, reportDate, sourceFile) {
  const points = [];

  for (const ws of wb.worksheets) {
    const name = ws.name.toLowerCase();
    if (name.includes('hrsg')) {
      points.push(...parseChemistryGrid(ws, reportDate, sourceFile, 'hrsg'));
    }
    if (name.includes('ro')) {
      points.push(...parseRoSheet(ws, reportDate, sourceFile));
    }
  }
  return points;
}

/** RO sheet: only rows with at least one numeric in value columns (sparse DMF/CF) */
function parseRoSheet(ws, reportDate, sourceFile) {
  const points = [];
  let section = '';
  let paramCols = [];

  ws.eachRow((row, rowNum) => {
    const c1 = cellText(row.getCell(1));
    if (!c1) return;

    if (/^(pre-treatment|pass \d ro|sampling point|common)/i.test(c1)) {
      section = c1;
      paramCols = [];
      return;
    }

    if (c1 === 'Sampling point' || c1 === 'Unit No.') {
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (col === 1) return;
        const h = cellText(cell).toLowerCase();
        if (h && h !== 'recommendations') paramCols.push({ col, key: h.slice(0, 40) });
      });
      return;
    }

    if (/^dmf\s*-\s*\d|^cf\s*-\s*\d|^(daf|dmf tank|swro|demin|sw tanks)/i.test(c1)) {
      if (!hasNumericInRow(row, 2, 8)) return;

      const equipmentId = c1.replace(/\s+/g, ' ').trim();
      if (paramCols.length) {
        paramCols.forEach(({ col, key }) => {
          const n = parseNumber(cellText(row.getCell(col)));
          if (n == null) return;
          points.push(makePoint(equipmentId, key, n, 'chemistry', reportDate, sourceFile, ws.name, section));
        });
      } else {
        for (let col = 2; col <= 8; col++) {
          const n = parseNumber(cellText(row.getCell(col)));
          if (n == null) continue;
          points.push(makePoint(equipmentId, `param${col}`, n, 'chemistry', reportDate, sourceFile, ws.name, section));
        }
      }
      return;
    }

    if (/^\d+$/.test(c1) && section.toLowerCase().includes('pass')) {
      if (!hasNumericInRow(row, 2, 8)) return;
      const equipmentId = `${section} unit ${c1}`;
      for (let col = 2; col <= 8; col++) {
        const n = parseNumber(cellText(row.getCell(col)));
        if (n == null) continue;
        points.push(makePoint(equipmentId, `param${col}`, n, 'chemistry', reportDate, sourceFile, ws.name, section));
      }
    }
  });

  return points;
}

function parseChemistryGrid(ws, reportDate, sourceFile, category) {
  const points = [];
  let block = '';

  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return;
    const c1 = cellText(row.getCell(1));
    const c6 = cellText(row.getCell(6));

    if (/drum|bfw|ctp|condensate/i.test(c1) && !/^\d+$/.test(c1)) {
      block = c1;
    }

    const units = [c1, c6].filter((u) => /^\d+$/.test(u) || /^bfw$/i.test(u));
    for (const unitId of units) {
      const cols = unitId === c1 ? [2, 3, 4, 5] : [7, 8, 9, 10];
      if (!cols.some((col) => parseNumber(cellText(row.getCell(col))) != null)) continue;

      cols.forEach((col, idx) => {
        const raw = cellText(row.getCell(col));
        if (!raw || SKIP_VALUES.test(raw)) return;
        const n = parseNumber(raw);
        if (n == null) return;
        const param = `p${idx + 1}`;
        points.push(makePoint(
          `${block || 'hrsg'} ${unitId}`.trim(),
          param,
          n,
          category,
          reportDate,
          sourceFile,
          ws.name,
          block
        ));
      });
    }
  });

  return points;
}

function makePoint(equipmentId, param, value, category, reportDate, sourceFile, sheetName, section) {
  return {
    metricKey: slugKey([category, section, equipmentId, param]),
    label: `${equipmentId} — ${param}${section ? ` (${section})` : ''}`,
    category,
    unit: '',
    reportDate,
    value,
    equipmentId,
    sourceFile,
    sheetName,
    columnKey: param,
  };
}

module.exports = { parseRoHrsgWorkbook };
