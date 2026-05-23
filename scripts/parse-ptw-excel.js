/**
 * Parse PTW Authorization List xlsx → data/ptw-authorization-2026.json
 * Usage: node scripts/parse-ptw-excel.js "path/to/file.xlsx"
 */
const fs = require('fs');
const path = require('path');

const xlsxPath =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE || '',
    'Desktop/trabajo/(No subject)/Copy of Update  PTW Authorization List (1).xlsx'
  );

if (!fs.existsSync(xlsxPath)) {
  console.error('File not found:', xlsxPath);
  process.exit(1);
}

const XLSX = require('xlsx');
const wb = XLSX.readFile(xlsxPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

function cellOn(val) {
  const v = String(val ?? '').trim().toLowerCase();
  if (!v) return false;
  return v === '1' || v === 'x' || v === 'yes' || v === 'y' || v === '✓';
}

function parseValidity(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return s;
}

const personnel = [];
const DATA_START = 9;

for (let i = DATA_START; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !Array.isArray(row)) continue;

  const name = String(row[1] || '').trim();
  if (!name || /^name$/i.test(name) || /^sr\.?$/i.test(name)) continue;
  if (/^location manager/i.test(name) || /^ptw/i.test(name)) continue;

  const designation = String(row[2] || '').trim();
  const empNo = String(row[3] || '').trim();
  const authorizations = [];

  if (cellOn(row[4])) authorizations.push('safetyCoordinator');
  if (cellOn(row[5])) authorizations.push('safetyControllerA');
  if (cellOn(row[6])) authorizations.push('safetyControllerB');
  if (cellOn(row[7])) authorizations.push('safetyControllerC');
  if (cellOn(row[8])) authorizations.push('permitIssuer');
  if (cellOn(row[9])) authorizations.push('isolationAuthority');
  if (cellOn(row[10])) authorizations.push('skilledPerson');
  if (cellOn(row[11])) authorizations.push('permitReceiverStandard');
  if (cellOn(row[12])) authorizations.push('permitReceiverAccess');
  if (cellOn(row[16])) authorizations.push('voltageLow');
  if (cellOn(row[17])) authorizations.push('voltageHigh');
  if (cellOn(row[19])) authorizations.push('standbyPerson');

  if (!authorizations.length && !designation) continue;

  personnel.push({
    name,
    designation,
    empNo,
    empId: empNo,
    authorizations,
    validUntil: parseValidity(row[21]),
    remarks: String(row[20] || '').trim(),
    canIssue: authorizations.includes('permitIssuer'),
    canReceive:
      authorizations.includes('permitReceiverStandard') ||
      authorizations.includes('permitReceiverAccess'),
    canApprove:
      authorizations.includes('safetyCoordinator') ||
      authorizations.includes('safetyControllerA'),
    canPerform: authorizations.includes('isolationAuthority'),
  });
}

const out = path.join(__dirname, '../data/ptw-authorization-2026.json');
fs.writeFileSync(out, JSON.stringify(personnel, null, 2));
console.log(`Wrote ${personnel.length} personnel to ${out}`);
