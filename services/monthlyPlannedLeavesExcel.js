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

function formatReadableDate(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDateRange(startYmd, endYmd) {
  if (!startYmd || !endYmd) return '';
  return `${formatReadableDate(startYmd)} – ${formatReadableDate(endYmd)}`;
}

function rowKey(empId, leaveStart, leaveEnd, leaveType) {
  return `${String(empId || '').trim()}|${leaveStart}|${leaveEnd}|${leaveType}`;
}

function employeeGroupKey(empId, name) {
  const id = String(empId || '').trim();
  if (id) return id;
  return `name:${String(name || '').trim().toLowerCase()}`;
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

function groupRowsByEmployee(flatRows) {
  const groups = new Map();

  for (const row of flatRows) {
    const key = employeeGroupKey(row.empId, row.name);
    if (!groups.has(key)) {
      groups.set(key, {
        empId: row.empId,
        name: row.name,
        crew: row.crew,
        role: row.role,
        leaves: [],
      });
    }
    groups.get(key).leaves.push({
      leaveStart: row.leaveStart,
      leaveEnd: row.leaveEnd,
      daysInMonth: row.daysInMonth,
      leaveType: row.leaveType,
    });
  }

  const grouped = Array.from(groups.values());
  for (const group of grouped) {
    group.leaves.sort((a, b) => a.leaveStart.localeCompare(b.leaveStart));
    group.totalDaysInMonth = group.leaves.reduce((sum, leave) => sum + leave.daysInMonth, 0);
  }

  grouped.sort((a, b) => {
    const c = a.crew.localeCompare(b.crew);
    if (c !== 0) return c;
    return a.name.localeCompare(b.name);
  });

  return grouped;
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

function writeEmployeeGroupRows(sheet, startRow, group, groupIndex) {
  const leaveCount = group.leaves.length;
  const endRow = startRow + leaveCount - 1;
  const dataFill = groupIndex % 2 === 0 ? QIPP_EXCEL_FILL.white : QIPP_EXCEL_FILL.light;

  const identityCols = [
    { col: 1, value: group.empId },
    { col: 2, value: group.name },
    { col: 3, value: group.crew },
    { col: 4, value: group.role },
  ];

  for (const { col, value } of identityCols) {
    const cell = sheet.getCell(startRow, col);
    cell.value = value;
    styleExcelCell(cell, {
      fill: dataFill,
      bold: col === 2,
      align: { horizontal: col === 1 ? 'center' : 'left', vertical: 'middle', wrapText: true },
      tableBorder: true,
    });
    if (leaveCount > 1) {
      sheet.mergeCells(startRow, col, endRow, col);
    }
  }

  const totalCell = sheet.getCell(startRow, 8);
  totalCell.value = group.totalDaysInMonth;
  styleExcelCell(totalCell, {
    fill: dataFill,
    bold: true,
    align: { horizontal: 'center', vertical: 'middle' },
    tableBorder: true,
  });
  if (leaveCount > 1) {
    sheet.mergeCells(startRow, 8, endRow, 8);
  }

  group.leaves.forEach((leave, i) => {
    const r = startRow + i;
    const leaveValues = [
      { col: 5, value: formatDateRange(leave.leaveStart, leave.leaveEnd) },
      { col: 6, value: leave.daysInMonth },
      { col: 7, value: leave.leaveType },
    ];
    leaveValues.forEach(({ col, value }) => {
      const cell = sheet.getCell(r, col);
      cell.value = value;
      styleExcelCell(cell, {
        fill: dataFill,
        align: {
          horizontal: col === 6 ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        },
        tableBorder: true,
      });
    });
    sheet.getRow(r).height = 20;
  });

  return endRow + 1;
}

/**
 * Build an Excel workbook listing all leave segments overlapping the given month.
 * Sources: AdminUser roster records (same as roster API) plus roster.json fallback.
 * Rows are grouped by employee so all leave periods for one person appear together.
 */
async function buildMonthlyPlannedLeavesWorkbook(yearMonth) {
  const { ym, start, end } = parseYearMonth(yearMonth);
  const monthStart = start;
  const monthEnd = end;

  const dbRows = await fetchDbLeaveRows(monthStart, monthEnd);
  const seen = new Set(
    dbRows.map((row) => rowKey(row.empId, row.leaveStart, row.leaveEnd, row.leaveType))
  );

  const flatRows = [...dbRows];
  for (const rosterRow of loadRosterJsonRows(monthStart, monthEnd)) {
    const key = rowKey(rosterRow.empId, rosterRow.leaveStart, rosterRow.leaveEnd, rosterRow.leaveType);
    if (seen.has(key)) continue;
    seen.add(key);
    flatRows.push(rosterRow);
  }

  const employeeGroups = groupRowsByEmployee(flatRows);
  const segmentCount = flatRows.length;

  const monthLabel = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
    .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const columns = [
    'Emp ID',
    'Name',
    'Crew',
    'Role',
    'Leave Period',
    'Days in Month',
    'Leave Type',
    'Total Days',
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
      center: `Employees: ${employeeGroups.length}`,
      right: 'Plant: QIPP',
    },
  });
  addQippSectionBand(sheet, headerEndRow, colCount, 'Leave by employee');
  const tableHeaderRow = headerEndRow + 1;
  addQippTableHeaderRow(sheet, tableHeaderRow, columns);

  sheet.columns = [
    { width: 12 },
    { width: 32 },
    { width: 10 },
    { width: 24 },
    { width: 28 },
    { width: 14 },
    { width: 20 },
    { width: 12 },
  ];

  let nextRow = tableHeaderRow + 1;

  if (employeeGroups.length === 0) {
    const values = ['', '(No leave overlaps this month)', '', '', '', '', '', ''];
    const dataFill = QIPP_EXCEL_FILL.white;
    values.forEach((value, colIdx) => {
      const cell = sheet.getCell(nextRow, colIdx + 1);
      cell.value = value;
      styleExcelCell(cell, {
        fill: dataFill,
        align: { horizontal: 'left', vertical: 'middle', wrapText: true },
        tableBorder: true,
      });
    });
    nextRow++;
  } else {
    employeeGroups.forEach((group, groupIndex) => {
      nextRow = writeEmployeeGroupRows(sheet, nextRow, group, groupIndex);
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: tableHeaderRow, xSplit: 0 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `planned-leaves-${ym}.xlsx`,
    rowCount: segmentCount,
    employeeCount: employeeGroups.length,
    monthLabel,
  };
}

module.exports = {
  buildMonthlyPlannedLeavesWorkbook,
  parseYearMonth,
  toYmd,
  leaveOverlapsMonth,
  groupRowsByEmployee,
  formatDateRange,
};
