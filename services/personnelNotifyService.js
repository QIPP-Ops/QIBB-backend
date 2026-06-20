const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const {
  emailCallout,
  emailCtaButton,
  emailDetailTable,
} = require('./emailHtmlHelpers');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { logAction } = require('./auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

function buildChangeRows(before, after, fields) {
  const rows = [];
  for (const field of fields) {
    const oldVal = before?.[field];
    const newVal = after?.[field];
    if (oldVal === undefined && newVal === undefined) continue;
    if (String(oldVal ?? '') === String(newVal ?? '')) continue;
    const label = field === 'crew' ? 'Crew' : field === 'role' ? 'Role' : field;
    rows.push({
      label,
      value: `${oldVal ?? '—'} → ${newVal ?? '—'}`,
    });
  }
  return rows;
}

async function notifyPersonnelChanges({
  user,
  actor,
  before,
  after,
  fields = ['crew', 'role'],
  req,
}) {
  const changes = buildChangeRows(before, after, fields);
  if (!changes.length) return { sent: false, reason: 'no_changes' };

  const email = String(user?.email || '').trim();
  if (!email || isPlaceholderEmail(email)) {
    return { sent: false, reason: 'no_email' };
  }
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'email_not_configured' };
  }

  const actorName = actor?.name || 'Administrator';
  const html = emailTemplate(
    'Personnel record updated',
    `
      ${emailCallout(`<p>Hi <strong>${user.name || user.empId}</strong>,</p><p>Your personnel record in QIPP was updated.</p>`)}
      ${emailDetailTable(changes)}
      ${emailDetailTable([{ label: 'Updated by', value: actorName }])}
      ${emailCtaButton(`${getFrontendBaseUrl()}/personnel`, 'Open QIPP')}
    `
  );

  await sendMail({
    to: email,
    subject: 'Your QIPP personnel record was updated',
    html,
  });

  await logAction({
    actor,
    action: AUDIT_ACTIONS.PERSONNEL_CHANGE_NOTIFIED,
    targetType: 'employee',
    targetId: user.empId,
    targetName: user.name,
    before: { crew: before?.crew, role: before?.role },
    after: { crew: after?.crew, role: after?.role, notified: true },
    req,
  });

  return { sent: true };
}

module.exports = {
  buildChangeRows,
  notifyPersonnelChanges,
};
