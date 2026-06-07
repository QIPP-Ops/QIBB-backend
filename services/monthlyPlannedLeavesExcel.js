const ExcelJS = require('exceljs');
const AdminUser = require('../models/AdminUser');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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

function toYmd(d) {
  return d.toISOString().slice(0, 10);
}

function leaveOverlapsMonth(leave, monthStart, monthEnd) {
  if (!leave?.start || !leave?.end) return false;
  const s = new Date(`${String(leave.start).slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${String(leave.end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  return s <= monthEnd && e >= monthStart;
}

function daysInMonthOverlap(leave, monthStart, monthEnd) {
  const s = new Date(`${String(leave.start).slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${String(leave.end).slice(0, 10)}T00:00:00Z`);
  const overlapStart = s < monthStart ? monthStart : s;
  const overlapEnd = e > monthEnd ? monthEnd : e;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / 86400000) + 1;
}

/**
 * Build an Excel workbook listing roster leave segments overlapping the given month.
 */
async function buildMonthlyPlannedLeavesWorkbook(yearMonth) {
  const { ym, start, end } = parseYearMonth(yearMonth);
  const monthStart = start;
  const monthEnd = end;

  const users = await AdminUser.find({ isApproved: true, isActive: { $ne: false } })
    .select('name fullName empId crew role leaves')
    .lean();

  const rows = [];
  for (const user of users) {
    for (const leave of user.leaves || []) {
      if (!leaveOverlapsMonth(leave, monthStart, monthEnd)) continue;
      rows.push({
        empId: user.empId || '',
        name: user.fullName || user.name || '',
        crew: user.crew || '',
        role: user.role || '',
        leaveStart: String(leave.start).slice(0, 10),
        leaveEnd: String(leave.end).slice(0, 10),
        daysInMonth: daysInMonthOverlap(leave, monthStart, monthEnd),
        leaveType: leave.type || '',
      });
    }
  }

  rows.sort((a, b) => {
    const c = a.crew.localeCompare(b.crew);
    if (c !== 0) return c;
    return a.leaveStart.localeCompare(b.leaveStart);
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QIPP';
  const sheet = workbook.addWorksheet(`Planned Leaves ${ym}`);
  sheet.columns = [
    { header: 'Emp ID', key: 'empId', width: 12 },
    { header: 'Name', key: 'name', width: 32 },
    { header: 'Crew', key: 'crew', width: 8 },
    { header: 'Role', key: 'role', width: 24 },
    { header: 'Leave Start', key: 'leaveStart', width: 14 },
    { header: 'Leave End', key: 'leaveEnd', width: 14 },
    { header: 'Days in Month', key: 'daysInMonth', width: 14 },
    { header: 'Leave Type', key: 'leaveType', width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FF2E2044' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF9F7FC' },
  };

  for (const row of rows) {
    sheet.addRow(row);
  }

  if (rows.length === 0) {
    sheet.addRow({
      empId: '',
      name: '(No leave segments overlap this month)',
      crew: '',
      role: '',
      leaveStart: '',
      leaveEnd: '',
      daysInMonth: '',
      leaveType: '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `planned-leaves-${ym}.xlsx`,
    rowCount: rows.length,
    monthLabel: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
      .toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

module.exports = {
  buildMonthlyPlannedLeavesWorkbook,
  parseYearMonth,
};
