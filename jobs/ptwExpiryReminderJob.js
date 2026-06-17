const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const { createNotification } = require('../services/notificationService');
const { sendMail, emailTemplate, isEmailConfigured } = require('../services/emailService');
const {
  emailCallout,
  emailHighlightBox,
  emailInfoList,
  emailSignoff,
} = require('../services/emailHtmlHelpers');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { formatPtwAuthRoleName } = require('../utils/ptwAuthRoles');
const {
  parseValidUntil,
  formatExpiryDate,
  daysUntil,
  findAdminUserForPtwPerson,
  resolveMemberEmail,
} = require('../utils/ptwPersonnelMerge');

const REMINDER_DAYS = [90, 30, 14, 7];
const CRON_UTC = '0 6 * * *';

function getFrontendBaseUrlSafe() {
  try {
    const { getFrontendBaseUrl } = require('../config/frontendUrl');
    return getFrontendBaseUrl();
  } catch {
    return 'https://qipp.live';
  }
}

async function findMemberUserForPtwPerson(person) {
  const candidates = await AdminUser.find({ isApproved: true })
    .select('_id name email empId crew')
    .lean();
  return findAdminUserForPtwPerson(person, candidates);
}

async function findCrewAdmins(crew) {
  if (!crew) return [];
  return AdminUser.find({
    accessRole: 'admin',
    isApproved: true,
    crew: String(crew).trim(),
  })
    .select('_id email name empId crew')
    .lean();
}

// ─── In-app notifications (do not change when adjusting email delivery) ───────

async function deliverInAppReminders({
  member,
  crewAdmins,
  memberName,
  roleName,
  expiryFormatted,
  expiryYmd,
  daysLeft,
}) {
  const base = getFrontendBaseUrlSafe();
  const link = `${base}/ptw`;

  if (member?._id) {
    await createNotification({
      type: 'ptw_expiry',
      recipientUserId: member._id,
      title: 'PTW authorization expiring',
      body: `Your PTW authorization for ${roleName} expires on ${expiryFormatted}. Please contact your supervisor to arrange renewal.`,
      link,
      dedupeKey: `ptw-expiry:member:${member.empId}:${expiryYmd}:${daysLeft}`,
      sendEmail: false,
    });
  }

  for (const admin of crewAdmins) {
    await createNotification({
      type: 'ptw_expiry',
      recipientUserId: admin._id,
      title: 'PTW expiry alert',
      body: `${memberName}'s PTW authorization for ${roleName} expires on ${expiryFormatted}. Please follow up on renewal.`,
      link,
      dedupeKey: `ptw-expiry:admin:${admin.empId}:${memberName}:${expiryYmd}:${daysLeft}`,
      sendEmail: false,
    });
  }
}

// ─── Email delivery (alongside in-app; skips placeholder addresses) ───────────

function buildMemberExpiryBody(name, roleName, expiryFormatted, daysLeft) {
  return `
    <p>Dear <strong>${name}</strong>,</p>
    ${emailCallout(`<p>Your PTW authorization for <strong>${roleName}</strong> expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>`, 'warning')}
    ${emailHighlightBox(expiryFormatted, 'sm')}
    ${emailInfoList([
      'Contact your supervisor to arrange renewal before this date',
      'Ensure your authorization records stay current for site access',
    ])}
    ${emailSignoff()}
  `;
}

function buildCrewAdminExpiryBody(memberName, roleName, expiryFormatted, daysLeft) {
  return `
    <p><strong>${memberName}</strong>'s PTW authorization for <strong>${roleName}</strong> expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>
    ${emailCallout('<p>Please follow up on renewal and update PTW records in QIPP.</p>', 'warning')}
    ${emailHighlightBox(expiryFormatted, 'sm')}
    ${emailInfoList([
      'Confirm renewal paperwork is in progress',
      'Coordinate with the team member before the expiry date',
    ])}
    ${emailSignoff()}
  `;
}

async function sendMemberExpiryEmail(member, roleName, expiryFormatted, daysLeft, person) {
  const email = resolveMemberEmail(member, person);
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return false;
  const subject = `PTW Authorization Expiry Reminder — ${roleName}`;
  const name = member?.name || person?.name || 'Colleague';
  try {
    await sendMail({
      to: email,
      subject,
      html: emailTemplate(subject, buildMemberExpiryBody(name, roleName, expiryFormatted, daysLeft)),
    });
    return true;
  } catch (err) {
    console.error('[ptw-expiry] member email failed:', err.message);
    return false;
  }
}

async function sendCrewAdminExpiryEmail(admin, memberName, roleName, expiryFormatted, daysLeft) {
  const email = (admin.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return false;
  const subject = `PTW Expiry Alert — ${memberName}`;
  try {
    await sendMail({
      to: email,
      subject,
      html: emailTemplate(
        subject,
        buildCrewAdminExpiryBody(memberName, roleName, expiryFormatted, daysLeft)
      ),
    });
    return true;
  } catch (err) {
    console.error('[ptw-expiry] crew admin email failed:', err.message);
    return false;
  }
}

async function deliverExpiryEmails({
  member,
  crewAdmins,
  memberName,
  roleName,
  expiryFormatted,
  daysLeft,
  person,
}) {
  if (member || person) {
    await sendMemberExpiryEmail(member, roleName, expiryFormatted, daysLeft, person);
  }
  for (const admin of crewAdmins) {
    await sendCrewAdminExpiryEmail(admin, memberName, roleName, expiryFormatted, daysLeft);
  }
}

async function runPtwExpiryReminderSweep(now = new Date()) {
  const config = await AdminConfig.findOne().lean();
  const personnel = config?.ptwPersonnel || [];
  const results = { checked: 0, reminded: 0 };

  for (const person of personnel) {
    const expiry = parseValidUntil(person.validUntil);
    if (!expiry) continue;
    results.checked += 1;

    const daysLeft = daysUntil(now, expiry);
    if (!REMINDER_DAYS.includes(daysLeft)) continue;

    const member = await findMemberUserForPtwPerson(person);
    const crew = member?.crew || person.crew;
    const crewAdmins = await findCrewAdmins(crew);
    const memberName = person.name || member?.name || 'Team member';
    const roleName = formatPtwAuthRoleName(person.authorizations);
    const expiryFormatted = formatExpiryDate(expiry);
    const expiryYmd = expiry.toISOString().slice(0, 10);

    await deliverInAppReminders({
      member,
      crewAdmins,
      memberName,
      roleName,
      expiryFormatted,
      expiryYmd,
      daysLeft,
    });
    await deliverExpiryEmails({
      member,
      crewAdmins,
      memberName,
      roleName,
      expiryFormatted,
      daysLeft,
      person,
    });
    results.reminded += 1;
  }

  return results;
}

function parseDailyCron(cronExpr) {
  const parts = String(cronExpr).trim().split(/\s+/);
  if (parts.length < 2) return null;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (Number.isNaN(minute) || Number.isNaN(hour)) return null;
  return { minute, hour };
}

let started = false;
let lastRunKey = '';

function startPtwExpiryReminderCron(cronExpr = CRON_UTC) {
  if (started) return;
  started = true;

  const schedule = parseDailyCron(cronExpr);
  if (!schedule) {
    console.error('[ptw-expiry] invalid cron expression:', cronExpr);
    return;
  }

  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() !== schedule.hour || now.getUTCMinutes() !== schedule.minute) return;
    const runKey = now.toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      const result = await runPtwExpiryReminderSweep(now);
      if (result.reminded) {
        console.log(`[ptw-expiry] sent reminders for ${result.reminded} authorization(s)`);
      }
    } catch (err) {
      console.error('[ptw-expiry] sweep failed:', err.message);
    }
  };

  setInterval(tick, 60 * 1000);
  console.log(`[ptw-expiry] scheduler registered (${cronExpr} UTC)`);
}

module.exports = {
  CRON_UTC,
  REMINDER_DAYS,
  parseValidUntil,
  formatExpiryDate,
  findMemberUserForPtwPerson,
  findCrewAdmins,
  deliverInAppReminders,
  deliverExpiryEmails,
  sendMemberExpiryEmail,
  sendCrewAdminExpiryEmail,
  runPtwExpiryReminderSweep,
  startPtwExpiryReminderCron,
};
