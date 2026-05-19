const { cellText, parseNumber, slugKey } = require('../excelUtils');

/** Daily water consumption master + day sheets */
function parseWaterWorkbook(wb, reportDate, sourceFile) {
  const points = [];
  const master = wb.getWorksheet('master') || wb.worksheets[0];
  if (!master) return points;

  master.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const label = cellText(row.getCell(1));
    if (!label || /^detal/i.test(label)) return;

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 2) return;
      const n = parseNumber(cellText(cell));
      if (n == null) return;
      const dayCol = col - 1;
      points.push({
        metricKey: slugKey(['water', label, `day${dayCol}`]),
        label: `${label} (day ${dayCol})`,
        category: 'water',
        unit: label.toLowerCase().includes('level') ? 'm³' : 'm³',
        reportDate,
        value: n,
        equipmentId: label.split(/\s/)[0] || '',
        sourceFile,
        sheetName: master.name,
        columnKey: `col${col}`,
      });
    });
  });

  return points;
}

module.exports = { parseWaterWorkbook };
