const { cellText, parseNumber, slugKey } = require('../excelUtils');

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Daily water consumption master — one point per calendar day column (unified metric keys). */
function parseWaterWorkbook(wb, reportDate, sourceFile) {
  const points = [];
  const master = wb.getWorksheet('master') || wb.worksheets[0];
  if (!master) return points;

  const [yStr, mStr] = String(reportDate || '').split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const maxDay =
    Number.isFinite(year) && Number.isFinite(month) ? daysInMonth(year, month) : 31;

  master.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const label = cellText(row.getCell(1));
    if (!label || /^detal/i.test(label)) return;

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 2) return;
      const n = parseNumber(cellText(cell));
      if (n == null) return;
      const dayCol = col - 1;
      if (dayCol < 1 || dayCol > maxDay) return;

      let pointDate = reportDate;
      if (Number.isFinite(year) && Number.isFinite(month)) {
        pointDate = `${yStr}-${mStr}-${String(dayCol).padStart(2, '0')}`;
      }

      points.push({
        metricKey: slugKey(['water', label]),
        label,
        category: 'water',
        unit: label.toLowerCase().includes('level') ? 'm³' : 'm³',
        reportDate: pointDate,
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
