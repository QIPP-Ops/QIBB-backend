const { slugKey, cellText } = require('../excelUtils');
const { parseNullableNumber, parseDmyFromFilename, makePoint, isNullText } = require('./common');

const GT_RE = /^GT[-#]?\s*(\d{2})$/i;

function parse({ wb, filename, sourceFile }) {
  const reportDate = parseDmyFromFilename(filename);
  if (!reportDate) return { skipped: true, kind: 'gt_fg_filter', points: [], highlights: [], reportDate: null };

  const ws = wb.worksheets[0];
  if (!ws) return { skipped: true, kind: 'gt_fg_filter', points: [], highlights: [], reportDate };

  const header = {};
  // assume header on row 1 or 2
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
  const highlights = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum <= 3) return;
    const gtRaw = String(cellText(row.getCell(2)) || cellText(row.getCell(1)) || '').trim();
    const m = gtRaw.match(GT_RE);
    if (!m) return;
    const gtNum = m[1];
    const equipmentId = `GT-${gtNum}`;

    // If row indicates shutdown, null-out all metrics.
    const statusText = String(cellText(row.getCell(11)) || cellText(row.getCell(9)) || '').trim();
    const isShutdown = /shut\s*down/i.test(statusText) || isNullText(statusText);

    row.eachCell({ includeEmpty: false }, (cell, col) => {
      if (col < 3) return;
      const keyLabel = header[col] || `col${col}`;
      if (/remark/i.test(keyLabel)) return;

      let val = isShutdown ? null : parseNullableNumber(cell);

      // 3500 in date fields => null (applies if a date-ish header but numeric 3500)
      if (val === 3500 && /date/i.test(keyLabel)) val = null;

      // negative DP => null (physically impossible); other negatives kept
      if (typeof val === 'number' && val < 0 && /dp/i.test(keyLabel)) val = null;

      // default HA=1.0 for all GT DP metrics (if HA not present, store explicit HA metric)
      if (/^ha$/i.test(keyLabel)) {
        if (val == null) val = 1.0;
      }

      points.push(
        makePoint({
          metricKey: slugKey(['gt_fg_filter_dp', equipmentId, keyLabel]),
          label: `${equipmentId} ${keyLabel}`,
          displayName: `${equipmentId} ${keyLabel}`,
          category: 'filters',
          unit: /bar/i.test(keyLabel) ? 'bar' : '',
          reportDate,
          value: val,
          equipmentId,
          sourceFile,
          sheetName: ws.name,
          columnKey: keyLabel,
        })
      );
    });

    // Ensure HA exists even if sheet has no HA column
    if (!Object.values(header).some((h) => h === 'ha')) {
      points.push(
        makePoint({
          metricKey: slugKey(['gt_fg_filter_dp', equipmentId, 'ha']),
          label: `${equipmentId} HA`,
          displayName: `${equipmentId} HA`,
          category: 'filters',
          unit: '',
          reportDate,
          value: 1.0,
          equipmentId,
          sourceFile,
          sheetName: ws.name,
          columnKey: 'ha',
        })
      );
    }

    const remark = String(cellText(row.getCell(12)) || '').trim();
    if (remark) {
      highlights.push({
        reportDate,
        sourceFile,
        sheetName: ws.name,
        category: 'filters_remark',
        text: remark.slice(0, 2000),
        author: '',
        crew: '',
        occurredAt: new Date(`${reportDate}T00:00:00Z`),
      });
    }
  });

  return { skipped: false, kind: 'gt_fg_filter', points, highlights, reportDate };
}

module.exports = { parse };

