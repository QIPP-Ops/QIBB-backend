const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, parseDmyFromFilename, makePoint, isNullText } = require('./common');

const GT_RE = /^GT[-#]?\s*(\d{2})$/i;

function parse({ wb, filename, sourceFile }) {
  const reportDate = parseDmyFromFilename(filename);
  if (!reportDate) return { skipped: true, kind: 'gt_air_filter', points: [], highlights: [], reportDate: null };

  const ws = wb.worksheets[0];
  if (!ws) return { skipped: true, kind: 'gt_air_filter', points: [], highlights: [], reportDate };

  const header = {};
  for (const r of [1, 2, 3]) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = String(cellText(cell) || '').trim().toLowerCase();
      if (!h) return;
      header[col] = h;
    });
    if (Object.keys(header).length >= 3) break;
  }

  const points = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum <= 3) return;
    const gtRaw = String(cellText(row.getCell(2)) || cellText(row.getCell(1)) || '').trim();
    const m = gtRaw.match(GT_RE);
    if (!m) return;
    const gtNum = m[1];
    const equipmentId = `GT-${gtNum}`;

    const statusText = String(cellText(row.getCell(10)) || cellText(row.getCell(9)) || '').trim();
    const isShutdown = /shut\s*down/i.test(statusText) || isNullText(statusText);

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 3) return;
      const keyLabel = header[col] || `col${col}`;
      if (/remark/i.test(keyLabel)) return;

      let val = isShutdown ? null : parseNullableNumber(cell);
      // negative DP values are valid (keep) for this parser.

      points.push(
        makePoint({
          metricKey: slugKey(['gt_air_intake_filter_dp', equipmentId, keyLabel]),
          label: `${equipmentId} ${keyLabel}`,
          displayName: `${equipmentId} ${keyLabel}`,
          category: 'filters',
          unit: /psig/i.test(keyLabel) ? 'psig' : '',
          reportDate,
          value: val,
          equipmentId,
          sourceFile,
          sheetName: ws.name,
          columnKey: keyLabel,
        })
      );
    });
  });

  return { skipped: false, kind: 'gt_air_filter', points, highlights: [], reportDate };
}

module.exports = { parse };

