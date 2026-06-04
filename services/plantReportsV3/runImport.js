const path = require('path');
const ExcelJS = require('exceljs');

const getParser = require('./registry');
const { mergeKind } = require('./jsonStore');
const { VALID_KINDS, validatePayload } = require('./schema');

async function importFile(filePath) {
  try {
    const absolutePath = path.resolve(String(filePath || ''));
    const filename = path.basename(absolutePath);

    const parser = getParser(filename);
    if (!parser) {
      console.log(`No parser found for: ${filename}`);
      return null;
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(absolutePath);

    const result = parser.parse({ wb, filename, sourceFile: absolutePath });

    if (!result || !VALID_KINDS.includes(result.kind)) {
      console.error(`Invalid kind "${result?.kind}" from parser for: ${filename}`);
      return null;
    }

    if (!Array.isArray(result.data) || result.data.length === 0) {
      console.log(`No data parsed from: ${filename}`);
      return null;
    }

    const validation = validatePayload(result);
    if (!validation.valid) {
      console.error(`Validation failed for ${filename}: ${JSON.stringify(validation.errors)}`);
      return null;
    }

    mergeKind(result.kind, result.data);

    console.log(
      `Imported ${result.data.length} records [${result.kind}] from ${filename}`,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return null;
  }
}

module.exports = importFile;

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node services/plantReportsV3/runImport.js <absolute-file-path>');
    process.exit(1);
  }

  importFile(filePath).then((result) => {
    process.exit(result ? 0 : 1);
  });
}
