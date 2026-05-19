const { cellText, parseNumber, slugKey } = require('../excelUtils');

const KEY_ROWS = [
  { match: /total plant load/i, key: 'plant.total_load_mw', unit: 'MW', category: 'energy' },
  { match: /^generation$/i, key: 'plant.generation', unit: '', category: 'energy' },
  { match: /fuel gas \(tons\)/i, key: 'plant.fuel_gas_tons', unit: 'tons', category: 'energy' },
  { match: /heat rate/i, key: 'plant.heat_rate', unit: '', category: 'energy' },
  { match: /net efficiency/i, key: 'plant.net_efficiency', unit: '', category: 'energy' },
];

function parseDailyOperationWorkbook(wb, reportDate, sourceFile) {
  const points = [];
  const ws = wb.worksheets.find((s) => /daily operation/i.test(s.name)) || wb.worksheets[0];
  if (!ws) return points;

  ws.eachRow((row) => {
    const label = cellText(row.getCell(2)) || cellText(row.getCell(3));
    if (!label) return;

    const rule = KEY_ROWS.find((r) => r.match.test(label));
    if (!rule) {
      if (/^group\s*\d/i.test(cellText(row.getCell(2)))) {
        const group = cellText(row.getCell(2));
        const unit = cellText(row.getCell(3));
        const avg = parseNumber(cellText(row.getCell(4)));
        const total = parseNumber(cellText(row.getCell(5)));
        if (avg != null) {
          points.push({
            metricKey: slugKey(['daily_ops', group, unit, 'avg_mw']),
            label: `${group} ${unit} avg MW`,
            category: 'daily_ops',
            unit: 'MW',
            reportDate,
            value: avg,
            equipmentId: `${group}-${unit}`,
            sourceFile,
            sheetName: ws.name,
            columnKey: 'avg',
          });
        }
        if (total != null) {
          points.push({
            metricKey: slugKey(['daily_ops', group, unit, 'total_mwh']),
            label: `${group} ${unit} total MWh`,
            category: 'daily_ops',
            unit: 'MWh',
            reportDate,
            value: total,
            equipmentId: `${group}-${unit}`,
            sourceFile,
            sheetName: ws.name,
            columnKey: 'total',
          });
        }
      }
      return;
    }

    for (let col = 4; col <= 13; col++) {
      const n = parseNumber(cellText(row.getCell(col)));
      if (n == null) continue;
      points.push({
        metricKey: slugKey([rule.key, `c${col}`]),
        label: `${label} (col ${col})`,
        category: rule.category,
        unit: rule.unit,
        reportDate,
        value: n,
        equipmentId: '',
        sourceFile,
        sheetName: ws.name,
        columnKey: `col${col}`,
      });
      break;
    }
  });

  return points;
}

module.exports = { parseDailyOperationWorkbook };
