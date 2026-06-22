/**
 * Build qipp-crew-calendar.json from roster + employee leave balances.
 * Run: node scripts/build-crew-calendar-seed.js
 */
const fs = require('fs');
const path = require('path');

const roster = require('../data/roster.json');
const personnelEmails = require('../data/personnel-emails.json');

// Inline from seedEmployeeData.js — annual + bank leave balances
const LEAVE_BALANCES = {
  'Abdulwahab Mohammed Al Shehab': { annual: 7.83, bank: 4, carryForward: 0 },
  'Abdul Hameed AbdulRasheed': { annual: 3.83, bank: 0, carryForward: 0 },
  'Sami Hamdan Al Harbi': { annual: 10.41, bank: 44, carryForward: 0 },
  'Abdullah Faleh Al Hajri': { annual: 10.41, bank: 0.5, carryForward: 0 },
  'Bakr Abdulmajeed Al Khabeerani': { annual: 8.03, bank: 2, carryForward: 0 },
  'Abdulrahman Shabib AlBaqami': { annual: -8.83, bank: 2, carryForward: 0 },
  'Faris Shaya AlDawsari': { annual: -5.83, bank: 0, carryForward: 0 },
  'Mohammad Abdullah AlGarni': { annual: 4.91, bank: 3, carryForward: 0 },
  'Saad Salem AlHajri': { annual: 9.16, bank: 0, carryForward: 0 },
  'Abdulhadi Mohammed AlMohammedSaleh': { annual: 9.16, bank: 0, carryForward: 0 },
  'Ali Mashabab AlQahtani': { annual: 8.16, bank: 4, carryForward: 0 },
  'Saad Mohammed AlShahrani': { annual: 9.16, bank: 4, carryForward: 0 },
  'Abdullah Abdulrahman Alamri': { annual: 7.58, bank: 4, carryForward: 0 },
  'Saleh Mohammed Saleh Alamri': { annual: 10, bank: 5, carryForward: 0 },
  'Saad Fadel Saad Alenezi': { annual: -1.41, bank: 2, carryForward: 0 },
  'Mohammed Abdullah Alghamdi': { annual: -2.83, bank: 1, carryForward: 0 },
  'Rashed Ghalib Alhajri': { annual: 10.41, bank: 5, carryForward: 0 },
  'Abdulaziz Dhaifallah Alharbi': { annual: 9.33, bank: 0, carryForward: 0 },
  'Syed Shahnawaz Ahmed': { annual: -1.16, bank: 0.58, carryForward: 0 },
  'Muhammad Afnan Shafi': { annual: 9.16, bank: 2, carryForward: 0 },
  'Mark Anthony Villaluz Ramirez': { annual: 9.24, bank: 0.66, carryForward: 0 },
  'Lakshmi Appala Rama Durga Prasad Rowthu': { annual: 9.16, bank: 0, carryForward: 0 },
  'Devaraj Purushothaman': { annual: 1.16, bank: 0.66, carryForward: 0 },
  'Somanathan Nair Prathapan': { annual: 10.83, bank: 0, carryForward: 0 },
  'Veera Venkata Prasad Vaka': { annual: 9.41, bank: 2, carryForward: 0 },
  'Mustafa Salem Mustafa': { annual: 9.41, bank: 28, carryForward: 0 },
  'Rajesh Muniasamy': { annual: 4.89, bank: 0, carryForward: 0 },
  'Izhar Ali Muhammad': { annual: 1.16, bank: 5, carryForward: 0 },
  'Ahmed Mostafa Mohamed Meshref': { annual: 10.83, bank: 0, carryForward: 0 },
  'Saravanakumar Madhaiyan': { annual: -6.75, bank: 5, carryForward: 0 },
  'Shaheer Yousaf Latif Ur Rehman': { annual: 8.91, bank: 0, carryForward: 0 },
  'Kanaka Naga Srinivasu Kolli': { annual: 9.24, bank: 0, carryForward: 0 },
  'Khaled Saleh Khulusi': { annual: 1.16, bank: 3.63, carryForward: 0 },
  'Juma Khan': { annual: 2.83, bank: 0, carryForward: 0 },
  'Bader Ibrahim Alsubeet': { annual: 10, bank: 4, carryForward: 0 },
  'Ahmed Fathy Ibrahim AbduelKader': { annual: 9.24, bank: 5, carryForward: 0 },
  'Moustafa Elansary Hewaidy': { annual: 10.83, bank: 10, carryForward: 0 },
  'Mohammed Hassan Hakami': { annual: 9.16, bank: 0, carryForward: 0 },
  'Walid Elshahhat Hussein Fayad': { annual: 3.16, bank: 0.76, carryForward: 0 },
  'Mohammed Fahad Al Mulhim': { annual: 7.58, bank: 0, carryForward: 0 },
  'Norbie Vianzon Cruz': { annual: 10.58, bank: 6, carryForward: 0 },
  'Hassan Arshad': { annual: 10.41, bank: 4, carryForward: 0 },
  'Yasir Essa Althuwayqib': { annual: 9.16, bank: 1, carryForward: 0 },
  'Ahmed Salem Alsaqoor': { annual: 2.16, bank: 1, carryForward: 0 },
  'Alaa Alrefaei': { annual: 6.87, bank: 0, carryForward: 0 },
  'Fawaz Mari Saeed Alqahtani': { annual: 3, bank: 3, carryForward: 0 },
  'Zaid Hadi Almarri': { annual: 7.2, bank: 0, carryForward: 0 },
};

const ROLE_MAP = {
  Supervisor: 'Shift Supervisor',
  'Shift in Charge': 'Shift Supervisor',
  'Shift in Charge Engineer': 'Shift in Charge Engineer',
  'CCR Operator': 'CCR Operator',
  'Local Operator': 'Field Operator',
  'Filed Operator': 'Field Operator',
};

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBalances(fullName, displayName) {
  for (const [key, val] of Object.entries(LEAVE_BALANCES)) {
    const nk = normalizeName(key);
    const nf = normalizeName(fullName);
    const nd = normalizeName(displayName);
    if (nk === nf || nk === nd || nf.includes(nk) || nk.includes(nf)) return val;
  }
  return { annual: null, bank: null, carryForward: 0 };
}

function findEmail(fullName, empId) {
  const byEmp = personnelEmails.find((p) => p.empId && empId && String(p.empId) === String(empId));
  if (byEmp) return byEmp.email;
  const nf = normalizeName(fullName);
  const match = personnelEmails.find((p) => {
    const np = normalizeName(p.name);
    return np === nf || np.includes(nf) || nf.includes(np);
  });
  return match?.email || null;
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function daysBetween(start, end) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.round((e - s) / 86400000) + 1;
}

function formatDateRange(start, end) {
  const fmt = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function mapRole(role) {
  return ROLE_MAP[role] || role;
}

const TIMESHEET_PERIOD = 'Jun 2026';
const TIMESHEET_STATUS = 'Submitted';
const PLANNED_HOURS = 168;
const RECORDED_HOURS = 152;

const members = roster.map((row) => {
  const fullName = row.fullName || row.name;
  const balances = findBalances(fullName, row.name);
  const upcomingTimeOff = (row.leaves || []).map((lv) => ({
    startDate: lv.start,
    endDate: lv.end,
    dates: formatDateRange(lv.start, lv.end),
    days: daysBetween(lv.start, lv.end),
    status: lv.type === 'Planned' ? 'Planned' : 'Approved',
    type: lv.type || 'Annual Leave',
  }));

  return {
    id: String(row.empId || row.id),
    empId: String(row.empId || row.id),
    name: fullName,
    displayName: row.name,
    initials: initialsFromName(fullName),
    jobTitle: mapRole(row.role),
    crew: row.crew,
    location: 'Qurayyah Independent Power Plant',
    cluster: 'Central Eastern Cluster',
    companyCode: 'NOMC-NOQY',
    workSchedule: '12QY3',
    upcomingTimeOff,
    leaveBalances: {
      annualLeaveDays: balances.annual,
      carryForwardDays: balances.carryForward,
      bankLeaveDays: balances.bank,
    },
    timesheet: {
      period: TIMESHEET_PERIOD,
      status: TIMESHEET_STATUS,
      plannedHours: PLANNED_HOURS,
      recordedHours: RECORDED_HOURS,
    },
    email: findEmail(fullName, row.empId),
  };
});

const payload = {
  source: 'ACWA SuccessFactors People Profile (Qurayyah NOMC-NOQY)',
  generatedAt: new Date().toISOString(),
  workScheduleDefault: '12QY3',
  location: 'Qurayyah Independent Power Plant',
  cluster: 'Central Eastern Cluster',
  companyCode: 'NOMC-NOQY',
  memberCount: members.length,
  members,
};

const outPath = path.join(__dirname, '../data/qipp-crew-calendar.json');
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Wrote ${members.length} crew members to ${outPath}`);
console.log(`With upcoming leave: ${members.filter((m) => m.upcomingTimeOff.length).length}`);
