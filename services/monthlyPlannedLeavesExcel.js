const path = require('path');
const ExcelJS = require('exceljs');
const AdminUser = require('../models/AdminUser');
const {
  addQippReportHeader,
  addQippSectionBand,
  addQippTableHeaderRow,
  styleExcelCell,
  QIPP_EXCEL_FILL,
} = require('../utils/qippExcelExport');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ROSTER_PATH = path.join(__dirname, '../data/roster.json');

function parseYearMonth(yearMonth) {
  const ym = String(yearMonth || '').trim();
  if (!MONTH_RE.test(ym)) {
    throw new Error('month must be YYYY-MM (e.g. 2026-06)');
  }
  const [year, month] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { ym, start, end };
}

function toYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function leaveOverlapsMonth(leave, monthStart, monthEnd) {
  const startYmd = toYmd(leave?.start);
  const endYmd = toYmd(leave?.end);
  if (!startYmd || !endYmd) return false;
  const s = new Date(`${startYmd}T00:00:00Z`);
  const e = new Date(`${endYmd}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  return s <= monthEnd && e >= monthStart;
}

function daysInMonthOverlap(leave, monthStart, monthEnd) {
  const startYmd = toYmd(leave.start);
  const endYmd = toYmd(leave.end);
  if (!startYmd || !endYmd) return 0;
  const s = new Date(`${startYmd}T00:00:00Z`);
  const e = new Date(`${endYmd}T00:00:00Z`);
  const overlapStart = s < monthStart ? monthStart : s;
  const overlapEnd = e > monthEnd ? monthEnd : e;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / 86400000) + 1;
}

function normalizeCrewLabel(crew) {
  const raw = String(crew || 'General').trim();
  const upper = raw.toUpperCase();
  if (!raw || upper === 'GENERAL' || upper === 'G') return 'General';
  const stripped = upper.startsWith('CREW ') ? upper.replace(/^CREW\s+/i, '').trim() : upper;
  if (/^[A-D]$/.test(stripped)) return `Crew ${stripped}`;
  return raw;
}

function rowKey(empId, leaveStart, leaveEnd, leaveType) {
  return `${String(empId || '').trim()}|${leaveStart}|${leaveEnd}|${leaveType}`;
}

function pushLeaveRow(rows, seen, user, leave, monthStart, monthEnd) {
  if (!leaveOverlapsMonth(leave, monthStart, monthEnd)) return;
  const leaveStart = toYmd(leave.start);
  const leaveEnd = toYmd(leave.end);
  const leaveType = String(leave.type || 'Planned').trim();
  const empId = String(user.empId || '').trim();
  const key = rowKey(empId, leaveStart, leaveEnd, leaveType);
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({
    empId,
    name: user.fullName || user.name || '',
    crew: normalizeCrewLabel(user.crew),
    role: user.role || '',
    leaveStart,
    leaveEnd,
    daysInMonth: daysInMonthOverlap(leave, monthStart, monthEnd),
    leaveType,
  });
}

function loadRosterJsonRows(monthStart, monthEnd) {
  let roster = [];
  try {
    roster = require(ROSTER_PATH);
  } catch {
    return [];
  }
  if (!Array.isArray(roster)) return [];

  const rows = [];
  const seen = new Set();
  for (const person of roster) {
    for (const leave of person.leaves || []) {
      pushLeaveRow(rows, seen, person, leave, monthStart, monthEnd);
    }
  }
  return rows;
}

async function fetchDbLeaveRows(monthStart, monthEnd) {
  const users = await AdminUser.find({ isActive: { $ne: false } })
    .select('name fullName empId crew role leaves')
    .lean();

  const rows = [];
  const seen = new Set();
  for (const user of users) {
    for (const leave of user.leaves || []) {
      pushLeaveRow(rows, seen, user, leave, monthStart, monthEnd);
    }
  }
  return rows;
}

/**
 * Build an Excel workbook listing all leave segments overlapping the given month.
 * Sources: AdminUser roster records (same as roster API) plus roster.json fallback.
 */
async function buildMonthlyPlannedLeavesWorkbook(yearMonth) {
  const { ym, start, end } = parseYearMonth(yearMonth);
  const monthStart = start;
  const monthEnd = end;

  const dbRows = await fetchDbLeaveRows(monthStart, monthEnd);
  const seen = new Set(
    dbRows.map((row) => rowKey(row.empId, row.leaveStart, row.leaveEnd, row.leaveType))
  );

  const rows = [...dbRows];
  for (const rosterRow of loadRosterJsonRows(monthStart, monthEnd)) {
    const key = rowKey(rosterRow.empId, rosterRow.leaveStart, rosterRow.leaveEnd, rosterRow.leaveType);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(rosterRow);
  }

  rows.sort((a, b) => {
    const c = a.crew.localeCompare(b.crew);
    if (c !== 0) return c;
    return a.leaveStart.localeCompare(b.leaveStart);
  });

  const monthLabel = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const columns = [
    'Emp ID',
    'Name',
    'Crew',
    'Role',
    'Leave Start',
    'Leave End',
    'Days in Month',
    'Leave Type',
  ];
  const colCount = columns.length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QIPP';
  const sheet = workbook.addWorksheet(`Planned Leaves ${ym}`);

  const headerEndRow = await addQippReportHeader(workbook, sheet, colCount, {
    title: 'PLANNED LEAVES',
    subtitle: monthLabel,
    metaTriplet: {
      left: `Month: ${ym}`,
      center: `Rows: ${rows.length}`,
      right: 'Plant: QIPP',
    },
  });
  addQippSectionBand(sheet, headerEndRow, colCount, 'Leave segments');
  const tableHeaderRow = headerEndRow + 1;
  addQippTableHeaderRow(sheet, tableHeaderRow, columns);

  sheet.columns = [
    { width: 12 },
    { width: 32 },
    { width: 8 },
    { width: 24 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
  ];

  const dataRows =
    rows.length > 0
      ? rows
      : [
          {
            empId: '',
            name: '(No leave segments overlap this month)',
            crew: '',
            role: '',
            leaveStart: '',
            leaveEnd: '',
            daysInMonth: '',
            leaveType: '',
          },
        ];

  dataRows.forEach((row, i) => {
    const r = tableHeaderRow + 1 + i;
    const values = [
      row.empId,
      row.name,
      row.crew,
      row.role,
      row.leaveStart,
      row.leaveEnd,
      row.daysInMonth,
      row.leaveType,
    ];
    const dataFill = i % 2 === 0 ? QIPP_EXCEL_FILL.white : QIPP_EXCEL_FILL.light;
    values.forEach((value, colIdx) => {
      const cell = sheet.getCell(r, colIdx + 1);
      cell.value = value;
      styleExcelCell(cell, {
        fill: dataFill,
        align: { horizontal: colIdx === 0 ? 'center' : 'left', vertical: 'middle', wrapText: true },
        tableBorder: true,
      });
    });
  });

  sheet.views = [{ state: 'frozen', ySplit: tableHeaderRow, xSplit: 0 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `planned-leaves-${ym}.xlsx`,
    rowCount: rows.length,
    monthLabel,
  };
}

module.exports = {
  buildMonthlyPlannedLeavesWorkbook,
  parseYearMonth,
  toYmd,
  leaveOverlapsMonth,
};
