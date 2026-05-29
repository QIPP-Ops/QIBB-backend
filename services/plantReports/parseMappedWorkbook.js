const { cellText, parseNumber, slugKey, inferDateFromFilename } = require('./excelUtils');
const { parseCellRef } = require('./cellRef');

function parseDateValue(raw, fallbackDate) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw || '').trim();
  if (!s) return fallbackDate;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return fallbackDate;
}

function sheetForMapping(wb) {
  return wb.worksheets[0];
}

/**
 * Extract plant metric points using admin-defined FileMapping.
 */
function parseMappedWorkbook(wb, mapping, reportDate, sourceFile) {
  const sheet = sheetForMapping(wb);
  if (!sheet || !mapping?.metrics?.length) return [];

  const dateRef = parseCellRef(mapping.dateCell);
  if (!dateRef) return [];

  const headerRow = Math.max(1, parseInt(mapping.headerRow, 10) || 1);
  const fallbackDate = reportDate || inferDateFromFilename(sourceFile);
  const points = [];
  const category = `mapped:${slugKey(['map', mapping.name])}`;

  const metricCols = mapping.metrics
    .map((m) => {
      const nameRef = parseCellRef(m.nameCellRef);
      const valueRef = parseCellRef(m.valueCellRef);
      if (!nameRef || !valueRef) return null;
      return {
        nameCol: nameRef.col,
        valueCol: valueRef.col,
        nameRow: nameRef.row,
        valueRow: valueRef.row,
        displayName: (m.displayName || '').trim(),
        sampleName: '',
      };
    })
    .filter(Boolean);

  if (!metricCols.length) return [];

  if (mapping.orientation === 'column') {
    const dateRow = dateRef.row;
    const maxCol = Math.min(sheet.columnCount || 200, 200);

    for (let c = 1; c <= maxCol; c++) {
      if (c <= dateRef.col) continue;
      const dateRaw = sheet.getRow(dateRow).getCell(c).value;
      const pointDate = parseDateValue(dateRaw, fallbackDate);
      if (!pointDate) continue;

      for (const mc of metricCols) {
        const nameRaw = cellText(sheet.getRow(mc.nameRow).getCell(c));
        const valueRaw = cellText(sheet.getRow(mc.valueRow).getCell(c));
        const value = parseNumber(valueRaw);
        if (value == null && (valueRaw == null || String(valueRaw).trim() === '')) {
          continue;
        }
        const label = mc.displayName || nameRaw || `Metric ${c}`;
        const metricKey = slugKey(['mapped', mapping.name, label]);

        points.push({
          metricKey,
          label,
          category,
          unit: '',
          reportDate: pointDate,
          value: value == null ? null : value,
          equipmentId: '',
          sourceFile,
          sheetName: sheet.name,
          columnKey: `col${c}`,
          displayName: mc.displayName || label,
        });
      }
    }
  } else {
    const dateCol = dateRef.col;
    const maxRow = Math.min(sheet.rowCount || 5000, 5000);

    for (let r = headerRow + 1; r <= maxRow; r++) {
      const row = sheet.getRow(r);
      const dateRaw = row.getCell(dateCol).value;
      const pointDate = parseDateValue(dateRaw, fallbackDate);
      const hasDate = dateRaw != null && String(cellText(row.getCell(dateCol))).trim() !== '';

      for (const mc of metricCols) {
        const nameRaw = cellText(row.getCell(mc.nameCol));
        const valueRaw = cellText(row.getCell(mc.valueCol));
        if (!nameRaw && valueRaw === '' && !hasDate) continue;

        const value = parseNumber(valueRaw);
        if (value == null && (valueRaw == null || String(valueRaw).trim() === '')) {
          continue;
        }

        const label = mc.displayName || nameRaw || `Row ${r}`;
        const metricKey = slugKey(['mapped', mapping.name, label]);

        points.push({
          metricKey,
          label,
          category,
          unit: '',
          reportDate: pointDate,
          value: value == null ? null : value,
          equipmentId: '',
          sourceFile,
          sheetName: sheet.name,
          columnKey: `row${r}`,
          displayName: mc.displayName || label,
        });
      }
    }
  }

  return points.filter((p) => p.value != null && Number.isFinite(p.value));
}

module.exports = { parseMappedWorkbook, parseDateValue };
