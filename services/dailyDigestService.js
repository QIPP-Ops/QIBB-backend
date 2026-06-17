const Notification = require('../models/Notification');
const ShiftReport = require('../models/ShiftReport');
const PlantIngestionState = require('../models/PlantIngestionState');
const { sendAdminBulkEmail } = require('./adminEmailService');
const { seriesForGeneration } = require('./plantReports/operationalOverview');
const { emailCallout, emailSectionTitle } = require('./emailHtmlHelpers');

function pad(n) {
  return String(n).padStart(2, '0');
}

function fmtYmd(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function yesterdayYmd(ref = new Date()) {
  const d = new Date(ref);
  d.setUTCDate(d.getUTCDate() - 1);
  return fmtYmd(d);
}

function digestSubjectDate(ref = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(ref);
}

function dayRangeUtc(ymd) {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(`${ymd}T23:59:59.999Z`);
  return { start, end };
}

async function shiftReportsSection(ymd) {
  const reports = await ShiftReport.find({ date: ymd }).sort({ crew: 1, shift: 1 }).lean();
  if (!reports.length) {
    return '<p><em>No shift reports submitted for yesterday.</em></p>';
  }
  const rows = reports
    .map(
      (r) =>
        `<li>${r.employeeName || r.empId} — crew ${r.crew || '—'}, ${r.shift === 'N' ? 'Night' : 'Day'} shift (${r.status || 'normal'})</li>`
    )
    .join('');
  return `<p><strong>${reports.length}</strong> report(s) submitted:</p><ul>${rows}</ul>`;
}

async function chemistryAlarmsSection(ymd) {
  const { start, end } = dayRangeUtc(ymd);
  const rows = await Notification.find({
    type: 'chemistry_alarm',
    createdAt: { $gte: start, $lte: end },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  if (!rows.length) return '<p><em>No chemistry alarms yesterday.</em></p>';
  const items = rows.map((n) => `<li>${n.title}: ${n.body}</li>`).join('');
  return `<ul>${items}</ul>`;
}

async function leaveIssuesSection(ymd) {
  const { start, end } = dayRangeUtc(ymd);
  const rows = await Notification.find({
    type: 'leave_conflict',
    createdAt: { $gte: start, $lte: end },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  if (!rows.length) return '<p><em>No leave conflicts or staffing alerts yesterday.</em></p>';
  const conflicts = [];
  const staffing = [];
  for (const n of rows) {
    if (/staffing below minimum/i.test(n.body)) staffing.push(n);
    else conflicts.push(n);
  }
  let html = '';
  if (conflicts.length) {
    html += `<p><strong>Leave conflicts</strong></p><ul>${conflicts.map((n) => `<li>${n.body}</li>`).join('')}</ul>`;
  }
  if (staffing.length) {
    html += `<p><strong>Staffing below minimum</strong></p><ul>${staffing.map((n) => `<li>${n.body}</li>`).join('')}</ul>`;
  }
  if (!html) html = '<p><em>No leave conflicts or staffing alerts yesterday.</em></p>';
  return html;
}

async function ingestStatsSection() {
  const state = await PlantIngestionState.findOne({ key: 'global' }).lean();
  if (!state?.lastSuccessAt) {
    return '<p><em>No successful plant ingest on record.</em></p>';
  }
  const at = new Date(state.lastSuccessAt).toISOString();
  return `<ul>
    <li>Last success: ${at}</li>
    <li>Files processed: ${state.filesProcessed ?? state.filesScanned ?? '—'}</li>
    <li>Points upserted: ${state.pointsUpserted ?? '—'}</li>
    <li>Metrics discovered: ${state.metricsDiscovered ?? '—'}</li>
  </ul>`;
}

async function generationSection(ymd) {
  try {
    const series = await seriesForGeneration(ymd, ymd);
    const row = series.find((r) => r.date === ymd);
    const mwh = row?.value;
    if (mwh == null || !Number.isFinite(mwh)) {
      return '<p><em>Generation MWh not available for yesterday.</em></p>';
    }
    return `<p><strong>${Number(mwh).toLocaleString('en-US', { maximumFractionDigits: 1 })} MWh</strong> (yesterday)</p>`;
  } catch (err) {
    console.warn('[daily-digest] generation lookup failed:', err.message);
    return '<p><em>Generation MWh could not be loaded.</em></p>';
  }
}

async function buildDailyDigestHtml(ref = new Date()) {
  const ymd = yesterdayYmd(ref);
  return {
    ymd,
    subjectDate: digestSubjectDate(ref),
    html: `
      ${emailCallout(`<p>Operations summary for <strong>${ymd}</strong> (day ending yesterday, AST).</p>`)}
      ${emailSectionTitle('Shift reports')}
      ${await shiftReportsSection(ymd)}
      ${emailSectionTitle('Chemistry alarms')}
      ${await chemistryAlarmsSection(ymd)}
      ${emailSectionTitle('Leave conflicts &amp; staffing')}
      ${await leaveIssuesSection(ymd)}
      ${emailSectionTitle('Last ingest')}
      ${await ingestStatsSection()}
      ${emailSectionTitle('Generation')}
      ${await generationSection(ymd)}
    `,
  };
}

async function sendDailyDigest(ref = new Date()) {
  const { subjectDate, html } = await buildDailyDigestHtml(ref);
  const subject = `QIPP Daily Operations Summary — ${subjectDate}`;
  return sendAdminBulkEmail({ subject, bodyHtml: html });
}

module.exports = {
  digestSubjectDate,
  yesterdayYmd,
  buildDailyDigestHtml,
  sendDailyDigest,
};
