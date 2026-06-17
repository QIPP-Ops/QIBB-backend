const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const {
  emailCallout,
  emailCtaButton,
  emailDetailTable,
} = require('./emailHtmlHelpers');

const DEFAULT_NOTIFY =
  process.env.LEAVE_PLANNER_NOTIFY_EMAIL || 'm.algarni@nomac.com';

const LEAVE_ACTIONS = new Set([
  'LEAVE_APPLIED',
  'LEAVE_REMOVED',
  'SHIFT_OVERRIDE_SET',
  'SHIFT_OVERRIDE_CLEARED',
]);

function isLeavePlannerAction(action) {
  return LEAVE_ACTIONS.has(action);
}

async function notifyLeavePlannerEdit({ action, actor, target, summary, metadata = {} }) {
  if (!isLeavePlannerAction(action)) return;

  const to = (process.env.LEAVE_PLANNER_NOTIFY_EMAIL || DEFAULT_NOTIFY).trim();
  if (!to || !isEmailConfigured()) return;

  try {
    const base = getFrontendBaseUrl();
    const body = `
      ${emailCallout('<p>A change was made in the <strong>Leave Planner</strong>.</p>')}
      ${emailDetailTable([
        { label: 'Action', value: action.replace(/_/g, ' ') },
        { label: 'Summary', value: summary || '—' },
        { label: 'By', value: actor?.name || actor?.email || 'Unknown' },
        ...(target?.name
          ? [{ label: 'Employee', value: `${target.name}${target.empId ? ` (${target.empId})` : ''}` }]
          : []),
      ])}
      ${emailCtaButton(`${base}/leave`, 'Open leave planner')}
    `;
    await sendMail({
      to,
      subject: `QIPP Leave Planner — ${action.replace(/_/g, ' ')}`,
      html: emailTemplate('Leave planner update', body),
    });
  } catch (err) {
    console.error('Leave planner notification email failed:', err.message);
  }
}

module.exports = { notifyLeavePlannerEdit, isLeavePlannerAction };
