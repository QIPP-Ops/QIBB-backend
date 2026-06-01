const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, parseDmyFromFilename, makePoint } = require('./common');

function parse({ wb, filename, sourceFile }) {
  const reportDate = parseDmyFromFilename(filename);
  if (!reportDate) return { skipped: true, kind: 'environment', points: [], highlights: [], reportDate: null };

  const ws = wb.worksheets[0];
  if (!ws) return { skipped: true, kind: 'environment', points: [], highlights: [], reportDate };

  const points = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const param = String(cellText(row.getCell(1)) || cellText(row.getCell(2)) || '').trim();
    if (!param || /^parameters?$/i.test(param)) return;
    const unit = String(cellText(row.getCell(3)) || cellText(row.getCell(4)) || '').trim();

    for (let col = 4; col <= Math.min(ws.columnCount || 40, 40); col++) {
      const val = parseNullableNumber(row.getCell(col));
      if (val == null) continue;
      points.push(
        makePoint({
          metricKey: slugKey(['environment', param, `c${col}`]),
          label: `${param}`,
          displayName: `${param}${unit ? ` (${unit})` : ''}`,
          category: 'environment',
          unit,
          reportDate,
          value: val,
          equipmentId: '',
          sourceFile,
          sheetName: ws.name,
          columnKey: `col${col}`,
        })
      );
    }
  });

  return { skipped: false, kind: 'environment', points, highlights: [], reportDate };
}

module.exports = { parse };

