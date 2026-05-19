const { cellText, parseNumber, slugKey } = require('../excelUtils');

function parseGtTable(ws, reportDate, sourceFile, category, prefix) {
  const points = [];
  let headers = {};

  ws.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const gt = cellText(row.getCell(2));
    if (!/^GT-\d+/i.test(gt)) return;

    if (rowNum <= 4) {
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (col < 3) return;
        const h = cellText(cell);
        if (h && !/^GT/i.test(h)) headers[col] = h.slice(0, 60);
      });
      return;
    }

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 3) return;
      const n = parseNumber(cellText(cell));
      if (n == null) return;
      const param = headers[col] || `col${col}`;
      const filterTag = cellText(row.getCell(11)) || cellText(row.getCell(9)) || '';
      const equipmentId = filterTag ? `${gt} ${filterTag}` : gt;
      points.push({
        metricKey: slugKey([prefix, gt, param]),
        label: `${gt} — ${param}`,
        category,
        unit: /dp|mbar|bar|psi/i.test(param) ? '' : '',
        reportDate,
        value: n,
        equipmentId,
        sourceFile,
        sheetName: ws.name,
        columnKey: param,
      });
    });
  });

  return points;
}

function parseGtFilterWorkbook(wb, reportDate, sourceFile, kind) {
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const category = kind === 'air' ? 'filters' : 'filters';
  const prefix = kind === 'air' ? 'gt_air' : 'gt_fg';
  return parseGtTable(ws, reportDate, sourceFile, category, prefix);
}

module.exports = { parseGtFilterWorkbook };
