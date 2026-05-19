const { cellText, parseNumber, slugKey } = require('../excelUtils');

function parseShiftReportWorkbook(wb, reportDate, sourceFile) {
  const points = [];
  const highlights = [];

  const plantWs = wb.getWorksheet('Plant Status ') || wb.getWorksheet('Plant Status');
  if (plantWs) {
    plantWs.eachRow((row, rowNum) => {
      if (rowNum < 6) return;
      const group = cellText(row.getCell(3));
      if (!/^Group#\s*\d/i.test(group)) return;
      const gt = cellText(row.getCell(4));
      const power = parseNumber(cellText(row.getCell(5)));
      const eff = parseNumber(cellText(row.getCell(6)));
      if (power != null) {
        points.push({
          metricKey: slugKey(['shift', group, gt, 'power_mw']),
          label: `${group} ${gt} power MW`,
          category: 'shift',
          unit: 'MW',
          reportDate,
          value: power,
          equipmentId: gt,
          sourceFile,
          sheetName: plantWs.name,
          columnKey: 'power',
        });
      }
      if (eff != null) {
        points.push({
          metricKey: slugKey(['shift', group, gt, 'efficiency']),
          label: `${group} ${gt} efficiency`,
          category: 'shift',
          unit: '%',
          reportDate,
          value: eff,
          equipmentId: gt,
          sourceFile,
          sheetName: plantWs.name,
          columnKey: 'efficiency',
        });
      }
    });
  }

  const activities = wb.getWorksheet('Day to Day activites') || wb.getWorksheet('Day to Day activities');
  if (activities) {
    const cutoff = new Date(reportDate);
    cutoff.setDate(cutoff.getDate() - 2);
    activities.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const desc = cellText(row.getCell(11));
      if (!desc || desc.length < 10 || desc.includes('[object Object]')) return;
      const dateCell = row.getCell(1).value;
      let rowDate = reportDate;
      if (dateCell instanceof Date) rowDate = dateCell.toISOString().slice(0, 10);
      if (new Date(rowDate) < cutoff) return;
      const author = cellText(row.getCell(3));
      highlights.push({
        reportDate: rowDate,
        sourceFile,
        sheetName: activities.name,
        category: 'shift_activity',
        text: desc.slice(0, 2000),
        author,
        crew: cellText(row.getCell(5)),
        occurredAt: dateCell instanceof Date ? dateCell : new Date(rowDate),
      });
    });
  }

  return { points, highlights };
}

module.exports = { parseShiftReportWorkbook };
