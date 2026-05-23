/**
 * Build data/ptw-authorization-2026.json from the official 63-person table.
 * Preserves authorizations/can* flags from existing JSON when names match.
 */
const fs = require('fs');
const path = require('path');

const TABLE = [
  ['Abdullah Alamri', 'SCE', '31.12.2027'],
  ['Mustafa Salem', 'SCE', '30.11.2027'],
  ['Mustafa Al Ansari', 'SS', '30.11.2027'],
  ['Syed Shahanwaz', 'SS', '30.11.2027'],
  ['Abdul Hameed Abdul Rasheed', 'SS', '30.09.2027'],
  ['K.K.N. Srinivasu', 'SS', '30.11.2027'],
  ['Shaheer Yousaf', 'CCR', '31.12.2026'],
  ['Veera Venkata', 'CCR', '30.11.2027'],
  ['Juma Khan', 'CCR', '02.03.2027'],
  ['Ahmed Meshref', 'CCR', '30.11.2027'],
  ['Saleh Alamri', 'CCR', '31.12.2027'],
  ['Adam Alhuzum', 'CCR', '31.12.2027'],
  ['Mohammad Algarni', 'CCR', '07.12.2027'],
  ['Ahmed Fathy', 'CCR', '31.12.2028'],
  ['Arshad Hassan', 'CCR', '31.12.2028'],
  ['Abdullah Al Hajri', 'LO', '31.12.2028'],
  ['Norbie Cruze', 'LO', '06.12.2027'],
  ['Saravanakumar Madhaiyan', 'LO', '30.11.2027'],
  ['M. Afnan Shafi', 'LO', '07.12.2027'],
  ['Abdulwahab Alshehab', 'LO', '31.12.2027'],
  ['Izhar Ali', 'LO', '06.12.2027'],
  ['Purushothoman Devaraj', 'LO', '30.11.2027'],
  ['Mohammed Alghamdi', 'LO', '30.11.2027'],
  ['Ahmed Alsaqoor', 'LO', '30.11.2027'],
  ['Mark Anthony', 'LO', '31.12.2028'],
  ['Saad Alenezi', 'LO', '31.12.2028'],
  ['Mohammed Aldawsari', 'LO', '31.12.2028'],
  ['Rajeesh Muniasamy', 'LO', '31.12.2028'],
  ['Mohammed Fahad Al Mulhim', 'LO', '31.12.2028'],
  ['Abdulaziz Dhaifallah Alharbi', 'LO', '31.12.2028'],
  ['Khaled Alsaidan', 'MMD Sup.', '06.12.2027'],
  ['Abdullah Muhanna', 'MMD Sup.', '01.12.2027'],
  ['Mohammad Alrobia', 'MMD Sup.', '09.12.2027'],
  ['Mohammed AlRamdan', 'MMD Sup.', '31.12.2027'],
  ['Mohammad Alam', 'MMD Tech', '10.12.2027'],
  ['Pankaj Kumar', 'MMD Tech', '02.12.2027'],
  ['M. Alhammadi', 'MMD Tech', '04.05.2026'],
  ['Satya Narayana Vadde', 'MMD Tech', '31.12.2026'],
  ['S. Vigneshwaran', 'MMD Tech', '03.05.2026'],
  ['Raj Kumar Tiwari', 'MMD Tech', '31.12.2026'],
  ['Shaik Mujtaba Ahmed', 'MMD Tech', '04.12.2027'],
  ['Mohammad Salih Ibrahim', 'EMD Sup.', '05.12.2027'],
  ['Mohammed Faqihi', 'EMD Sup.', '31.12.2026'],
  ['Imran Ali', 'EMD Sup.', '08.12.2027'],
  ['Dhanfordjim Ebreo', 'EMD Tech', '08.12.2027'],
  ['Nasser Almutairi', 'EMD Tech', '08.12.2027'],
  ['Suresh Raj', 'EMD Tech', '08.12.2027'],
  ['Imran Javed', 'IMD Sup.', '31.12.2027'],
  ['Murugananthan Sakthivel', 'IMD Tech', '01.12.2027'],
  ['Mohammad Khan Saddam', 'IMD Tech', '04.12.2027'],
  ['Syed Nadeem Ulhaq', 'IMD Tech', '31.12.2027'],
  ['Muhammed Munir', 'IMD Tech', '09.12.2027'],
  ['Malik Ashraf', 'IMD Tech', '01.12.2027'],
  ['Abdulaziz Alfardan', 'IMD Tech', '07.05.2026'],
  ['Khalid Alahmadi', 'IMD Tech', '31.12.2026'],
  ['Rampal', 'AYTB', '31.12.2026'],
  ['Md. Manjar Hussain', 'AYTB', '31.12.2026'],
  ['Omprakash', 'AYTB', '31.12.2026'],
  ['Md. Tabre', 'AYTB', '31.12.2026'],
  ['Indra', 'AYTB', '31.12.2026'],
  ['M. Shoib', 'STOM', '09.12.2027'],
  ['Abdul Aleem', 'STOM', '31.12.2026'],
  ['Jaypee Ebreo', 'STOM', '04.12.2027'],
];

function normName(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();
}

function parseValidityDmy(dmy) {
  const m = String(dmy || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function defaultForDesignation(designation) {
  const d = designation.toLowerCase();
  if (d === 'sce' || d === 'ss') {
    return {
      authorizations: [
        'safetyCoordinator',
        'safetyControllerB',
        'permitIssuer',
        'isolationAuthority',
        'voltageLow',
        'voltageHigh',
      ],
      canIssue: true,
      canReceive: false,
      canApprove: true,
      canPerform: true,
    };
  }
  if (d === 'ccr') {
    return {
      authorizations: ['permitIssuer', 'isolationAuthority'],
      canIssue: true,
      canReceive: false,
      canApprove: false,
      canPerform: true,
    };
  }
  if (d.startsWith('lo')) {
    return {
      authorizations: ['permitReceiverStandard', 'skilledPerson'],
      canIssue: false,
      canReceive: true,
      canApprove: false,
      canPerform: false,
    };
  }
  return {
    authorizations: ['skilledPerson'],
    canIssue: false,
    canReceive: false,
    canApprove: false,
    canPerform: true,
  };
}

const existingPath = path.join(__dirname, '../data/ptw-authorization-2026.json');
const existing = fs.existsSync(existingPath)
  ? JSON.parse(fs.readFileSync(existingPath, 'utf8'))
  : [];
const byName = new Map(existing.map((p) => [normName(p.name), p]));

const personnel = TABLE.map(([name, designation, validityDmy]) => {
  const prev = byName.get(normName(name)) || byName.get(normName(name.replace(/\s+/g, '')));
  const base = prev
    ? {
        authorizations: prev.authorizations || [],
        empNo: prev.empNo || '',
        empId: prev.empId || prev.empNo || '',
        remarks: prev.remarks || '',
        canIssue: !!prev.canIssue,
        canReceive: !!prev.canReceive,
        canApprove: !!prev.canApprove,
        canPerform: !!prev.canPerform,
      }
    : defaultForDesignation(designation);

  return {
    name,
    designation,
    empNo: base.empNo,
    empId: base.empId,
    authorizations: base.authorizations,
    validUntil: parseValidityDmy(validityDmy),
    remarks: base.remarks,
    canIssue: base.canIssue,
    canReceive: base.canReceive,
    canApprove: base.canApprove,
    canPerform: base.canPerform,
  };
});

if (personnel.length !== 63) {
  console.error('Expected 63 entries, got', personnel.length);
  process.exit(1);
}

const out = path.join(__dirname, '../data/ptw-authorization-2026.json');
fs.writeFileSync(out, JSON.stringify(personnel, null, 2) + '\n');
console.log(`Wrote ${personnel.length} personnel to ${out}`);
