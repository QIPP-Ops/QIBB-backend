const ExcelJS = require('exceljs');
const { cellText } = require('./excelUtils');
const { colNumberToLetters } = require('./cellRef');

const PREVIEW_ROWS = 60;
const PREVIEW_COLS = 40;

/**
 * First sheet, up to 60 rows × 40 cols as grid for admin mapper UI.
 */
async function previewWorkbookBuffer(buffer, maxRows = PREVIEW_ROWS, maxCols = PREVIEW_COLS) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) {
    return { rows: [], columns: [], sheetName: '' };
  }

  const rowCount = Math.min(maxRows, sheet.rowCount || maxRows);
  const colCount = Math.min(maxCols, sheet.columnCount || maxCols);

  const columns = [];
  for (let c = 1; c <= colCount; c++) {
    columns.push(colNumberToLetters(c));
  }

  const rows = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const cells = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellText(row.getCell(c)));
    }
    rows.push({ rowNum: r, cells });
  }

  return { rows, columns, sheetName: sheet.name };
}

module.exports = { previewWorkbookBuffer, PREVIEW_ROWS, PREVIEW_COLS };
