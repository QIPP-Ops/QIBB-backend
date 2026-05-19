const { cellText, parseNumber, slugKey } = require('../excelUtils');

function parseEnvironmentWorkbook(wb, reportDate, sourceFile) {
  const points = [];
  const ws = wb.worksheets[0];
  if (!ws) return points;

  ws.eachRow((row, rowNum) => {
    if (rowNum < 20) return;
    const param = cellText(row.getCell(2)) || cellText(row.getCell(3));
    if (!param || param === 'PARAMETERS') return;
    const unit = cellText(row.getCell(4));
    for (const col of [6, 7, 8, 11, 12, 13]) {
      const n = parseNumber(cellText(row.getCell(col)));
      if (n == null) continue;
      points.push({
        metricKey: slugKey(['environment', param, `c${col}`]),
        label: `${param} (${unit || 'value'})`,
        category: 'environment',
        unit: unit || '',
        reportDate,
        value: n,
        equipmentId: param,
        sourceFile,
        sheetName: ws.name,
        columnKey: `col${col}`,
      });
    }
  });

  return points;
}

module.exports = { parseEnvironmentWorkbook };
