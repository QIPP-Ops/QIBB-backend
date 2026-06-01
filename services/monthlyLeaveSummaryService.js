const AdminUser = require('../models/AdminUser');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');

const CREW_ORDER = ['General', 'Crew A', 'Crew B', 'Crew C', 'Crew D'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthBoundsUtc(ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { monthStart, monthEnd };
}

function formatMonthLabel(ref = new Date()) {
  return `${MONTH_NAMES_LONG[ref.getUTCMonth()]} ${ref.getUTCFullYear()}`;
}

function formatDateDdMmmYyyy(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_NAMES_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function normalizeCrewLabel(crew) {
  const raw = String(crew || 'General').trim();
  const upper = raw.toUpperCase();
  if (!raw || upper === 'GENERAL' || upper === 'G') return 'General';
  const stripped = upper.startsWith('CREW ') ? upper.replace(/^CREW\s+/i, '').trim() : upper;
  if (/^[A-D]$/.test(stripped)) return `Crew ${stripped}`;
  return raw;
}

function computeOverlapDays(leaveStart, leaveEnd, monthStart, monthEnd) {
  const start = new Date(Math.max(new Date(leaveStart).getTime(), monthStart.getTime()));
  const end = new Date(Math.min(new Date(leaveEnd).getTime(), monthEnd.getTime()));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const fullDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) + 1;
  return Math.max(0, fullDays);
}

function toOneDecimal(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

async function fetchMonthlyLeaveRecords(ref = new Date()) {
  const { monthStart, monthEnd } = monthBoundsUtc(ref);
  const rows = await AdminUser.aggregate([
    {
      $match: {
        leaves: {
          $elemMatch: {
            start: { $lte: monthEnd },
            end: { $gte: monthStart },
          },
        },
      },
    },
    { $unwind: '$leaves' },
    {
      $match: {
        'leaves.start': { $lte: monthEnd },
        'leaves.end': { $gte: monthStart },
      },
    },
    {
      $project: {
        _id: 0,
        employeeName: '$name',
        role: '$role',
        crew: '$crew',
        leaveType: '$leaves.type',
        start: '$leaves.start',
        end: '$leaves.end',
        totalDays: '$leaves.totalDays',
        appliedOnSap: '$leaves.appliedOnSap',
      },
    },
  ]);

  return rows.map((row) => {
    const overlapDays = computeOverlapDays(row.start, row.end, monthStart, monthEnd);
    return {
      employeeName: row.employeeName || '—',
      role: row.role || '—',
      crew: normalizeCrewLabel(row.crew),
      leaveType: String(row.leaveType || 'Planned'),
      start: row.start,
      end: row.end,
      days: toOneDecimal(row.totalDays != null ? row.totalDays : overlapDays),
      appliedOnSap: Boolean(row.appliedOnSap),
    };
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCrewTableRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="7" style="padding:10px;border:1px solid #eee;font-style:italic;color:#666;">No leave planned this month</td></tr>`;
  }
  return rows
    .map(
      (r) => `<tr>
        <td style="padding:10px;border:1px solid #eee;">${escapeHtml(r.employeeName)}</td>
        <td style="padding:10px;border:1px solid #eee;">${escapeHtml(r.role)}</td>
        <td style="padding:10px;border:1px solid #eee;">${escapeHtml(r.leaveType)}</td>
        <td style="padding:10px;border:1px solid #eee;">${formatDateDdMmmYyyy(r.start)}</td>
        <td style="padding:10px;border:1px solid #eee;">${formatDateDdMmmYyyy(r.end)}</td>
        <td style="padding:10px;border:1px solid #eee;text-align:right;">${toOneDecimal(r.days).toFixed(1)}</td>
        <td style="padding:10px;border:1px solid #eee;">${r.appliedOnSap ? 'Yes' : 'No'}</td>
      </tr>`
    )
    .join('');
}

function buildMonthlyLeaveSummaryHtml(records, ref = new Date()) {
  const monthLabel = formatMonthLabel(ref);
  const grouped = new Map(CREW_ORDER.map((crew) => [crew, []]));
  for (const row of records) {
    const normalizedCrew = normalizeCrewLabel(row.crew);
    if (grouped.has(normalizedCrew)) {
      grouped.get(normalizedCrew).push({ ...row, crew: normalizedCrew });
    }
  }

  const uniqueEmployees = new Set(records.map((r) => r.employeeName));
  const totalLeaveDays = toOneDecimal(records.reduce((sum, r) => sum + Number(r.days || 0), 0));

  const sectionHtml = CREW_ORDER.map((crew) => {
    const rows = grouped.get(crew) || [];
    return `
      <h3 style="margin-top:20px;font-size:16px;color:#9273DA;">${crew}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">
        <thead>
          <tr style="background:#f7f3ff;color:#2E2044;">
            <th style="padding:10px;border:1px solid #eee;text-align:left;">Employee Name</th>
            <th style="padding:10px;border:1px solid #eee;text-align:left;">Role</th>
            <th style="padding:10px;border:1px solid #eee;text-align:left;">Leave Type</th>
            <th style="padding:10px;border:1px solid #eee;text-align:left;">From</th>
            <th style="padding:10px;border:1px solid #eee;text-align:left;">To</th>
            <th style="padding:10px;border:1px solid #eee;text-align:right;">Days</th>
            <th style="padding:10px;border:1px solid #eee;text-align:left;">Applied on SAP</th>
          </tr>
        </thead>
        <tbody>
          ${buildCrewTableRows(rows)}
        </tbody>
      </table>
    `;
  }).join('');

  return `
    <p>Leave summary for <strong>${escapeHtml(monthLabel)}</strong>.</p>
    <p><strong>Total employees on leave:</strong> ${uniqueEmployees.size}<br/>
    <strong>Total leave-days:</strong> ${totalLeaveDays.toFixed(1)}</p>
    ${sectionHtml}
  `;
}

function buildMonthlyLeaveSummaryPayload(records, ref = new Date()) {
  const monthLabel = formatMonthLabel(ref);
  return {
    subject: `Leave Plan — ${monthLabel}`,
    html: buildMonthlyLeaveSummaryHtml(records, ref),
  };
}

async function sendMonthlyLeaveSummary(ref = new Date()) {
  if (!isEmailConfigured()) return { sent: 0, to: null };

  const records = await fetchMonthlyLeaveRecords(ref);
  const { subject, html } = buildMonthlyLeaveSummaryPayload(records, ref);
  const to = 'admin@acwaops.com';
  await sendMail({
    to,
    subject,
    html: emailTemplate(subject, html),
  });
  return { sent: 1, to };
}

module.exports = {
  CREW_ORDER,
  monthBoundsUtc,
  formatMonthLabel,
  normalizeCrewLabel,
  computeOverlapDays,
  fetchMonthlyLeaveRecords,
  buildMonthlyLeaveSummaryHtml,
  buildMonthlyLeaveSummaryPayload,
  sendMonthlyLeaveSummary,
};
