const path = require('path');
const fs = require('fs');

/** QIPP / ACWA brand palette for Excel exports. */
const QIPP_EXCEL_FILL = {
  header: 'FF2E2044',
  accent: 'FF9273DA',
  banner: 'FFD2F050',
  check: 'FF22C55E',
  light: 'FFF9F7FC',
  section: 'FFF3F0F9',
  white: 'FFFFFFFF',
  border: 'FFE3DCF5',
  tableBorder: 'FF2E2044',
  mutedText: 'FF6B5E8A',
};

function styleExcelCell(cell, opts = {}) {
  cell.font = {
    bold: opts.bold,
    color: opts.fontColor ? { argb: opts.fontColor } : undefined,
    size: opts.size ?? 10,
  };
  if (opts.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  }
  if (opts.align) cell.alignment = opts.align;
  const borderColor = opts.tableBorder ? QIPP_EXCEL_FILL.tableBorder : QIPP_EXCEL_FILL.border;
  cell.border = {
    top: { style: 'thin', color: { argb: borderColor } },
    left: { style: 'thin', color: { argb: borderColor } },
    bottom: { style: 'thin', color: { argb: borderColor } },
    right: { style: 'thin', color: { argb: borderColor } },
  };
}

function mergeExcelRow(ws, row, fromCol, toCol) {
  ws.mergeCells(row, fromCol, row, toCol);
}

function resolveLogoPath() {
  const candidates = [
    path.join(__dirname, '../../QIBB-frontend/public/acwa-operations-logo.png'),
    path.join(__dirname, '../public/acwa-operations-logo.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function addQippReportHeader(workbook, worksheet, colCount, meta) {
  let r = 1;

  mergeExcelRow(worksheet, r, 1, colCount);
  styleExcelCell(worksheet.getCell(r, 1), {
    fill: QIPP_EXCEL_FILL.light,
    align: { horizontal: 'left', vertical: 'middle' },
  });
  worksheet.getRow(r).height = 36;

  const logoPath = meta.logoPath || resolveLogoPath();
  if (logoPath) {
    const imageId = workbook.addImage({
      buffer: fs.readFileSync(logoPath),
      extension: 'png',
    });
    worksheet.addImage(imageId, {
      tl: { col: 0.15, row: r - 1 + 0.25 },
      ext: { width: 88, height: 28 },
    });
  }
  r++;

  mergeExcelRow(worksheet, r, 1, colCount);
  const bannerCell = worksheet.getCell(r, 1);
  bannerCell.value = meta.subtitle ? `${meta.title}\n${meta.subtitle}` : meta.title;
  styleExcelCell(bannerCell, {
    bold: true,
    fill: QIPP_EXCEL_FILL.banner,
    fontColor: QIPP_EXCEL_FILL.header,
    align: { horizontal: 'center', vertical: 'middle', wrapText: true },
    size: meta.subtitle ? 11 : 12,
  });
  worksheet.getRow(r).height = meta.subtitle ? 32 : 24;
  r++;

  if (meta.metaTriplet) {
    const third = Math.max(1, Math.floor(colCount / 3));
    const midEnd = third * 2;
    mergeExcelRow(worksheet, r, 1, third);
    mergeExcelRow(worksheet, r, third + 1, midEnd);
    mergeExcelRow(worksheet, r, midEnd + 1, colCount);
    worksheet.getCell(r, 1).value = meta.metaTriplet.left;
    worksheet.getCell(r, third + 1).value = meta.metaTriplet.center;
    worksheet.getCell(r, midEnd + 1).value = meta.metaTriplet.right;
    for (let c = 1; c <= colCount; c++) {
      styleExcelCell(worksheet.getCell(r, c), {
        bold: true,
        fill: QIPP_EXCEL_FILL.light,
        align: { horizontal: 'left', vertical: 'middle', wrapText: true },
        size: 9,
        tableBorder: true,
      });
    }
    worksheet.getRow(r).height = 20;
    r++;
  }

  if (meta.footerNote) {
    mergeExcelRow(worksheet, r, 1, colCount);
    worksheet.getCell(r, 1).value = meta.footerNote;
    styleExcelCell(worksheet.getCell(r, 1), {
      fill: QIPP_EXCEL_FILL.light,
      fontColor: QIPP_EXCEL_FILL.mutedText,
      align: { horizontal: 'right', vertical: 'middle' },
      size: 8,
    });
    r++;
  }

  return r;
}

function addQippSectionBand(worksheet, row, colCount, label) {
  mergeExcelRow(worksheet, row, 1, colCount);
  const cell = worksheet.getCell(row, 1);
  cell.value = label;
  styleExcelCell(cell, {
    bold: true,
    fill: QIPP_EXCEL_FILL.accent,
    fontColor: QIPP_EXCEL_FILL.white,
    align: { horizontal: 'left', vertical: 'middle' },
    size: 10,
    tableBorder: true,
  });
  worksheet.getRow(row).height = 20;
}

function addQippTableHeaderRow(worksheet, row, labels, opts = {}) {
  labels.forEach((label, i) => {
    const cell = worksheet.getCell(row, i + 1);
    cell.value = label;
    styleExcelCell(cell, {
      bold: true,
      fill: opts.accentSubRow ? QIPP_EXCEL_FILL.accent : QIPP_EXCEL_FILL.header,
      fontColor: QIPP_EXCEL_FILL.white,
      align: { horizontal: 'center', vertical: 'middle', wrapText: true },
      size: opts.accentSubRow ? 8 : 9,
      tableBorder: true,
    });
  });
  worksheet.getRow(row).height = opts.accentSubRow ? 18 : 22;
}

module.exports = {
  QIPP_EXCEL_FILL,
  styleExcelCell,
  mergeExcelRow,
  addQippReportHeader,
  addQippSectionBand,
  addQippTableHeaderRow,
  resolveLogoPath,
};
