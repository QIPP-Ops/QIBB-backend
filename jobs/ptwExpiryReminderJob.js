const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const { createNotification } = require('../services/notificationService');
const { sendMail, emailTemplate, isEmailConfigured } = require('../services/emailService');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { formatPtwAuthRoleName } = require('../utils/ptwAuthRoles');

const REMINDER_DAYS = [90, 30, 14, 7];
const CRON_UTC = '0 6 * * *';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysUntil(from, to) {
  const ms = startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime();
  return Math.round(ms / 86400000);
}

function parseValidUntil(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatExpiryDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${mon} ${year}`;
}

function getFrontendBaseUrlSafe() {
  try {
    const { getFrontendBaseUrl } = require('../config/frontendUrl');
    return getFrontendBaseUrl();
  } catch {
    return 'https://qipp.live';
  }
}

async function findMemberUserForPtwPerson(person) {
  const empId = String(person.empId || person.empNo || '').trim();
  if (empId) {
    const byEmp = await AdminUser.findOne({ empId, isApproved: true }).lean();
    if (byEmp) return byEmp;
  }
  const email = String(person.email || '').trim();
  if (email) {
    const byEmail = await AdminUser.findOne({
      email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      isApproved: true,
    }).lean();
    if (byEmail) return byEmail;
  }
  const name = normalizeName(person.name);
  if (!name) return null;
  const candidates = await AdminUser.find({ isApproved: true }).select('_id name email empId crew').lean();
  return candidates.find((u) => normalizeName(u.name) === name) || null;
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

async function sendMemberExpiryEmail(member, roleName, expiryFormatted, overrideEmail) {
  const email = (overrideEmail || member?.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return false;
  const subject = `PTW Authorization Expiry Reminder — ${roleName}`;
  const name = member?.name || 'Colleague';
  const text = `Dear ${name}, your PTW authorization for ${roleName} is expiring on ${expiryFormatted}. Please contact your supervisor to arrange renewal before this date. — Acwa Operations, QIPP`;
  try {
    await sendMail({
      to: email,
      subject,
      html: emailTemplate(subject, `<p>${text}</p>`),
    });
    return true;
  } catch (err) {
    console.error('[ptw-expiry] member email failed:', err.message);
    return false;
  }
}

async function sendCrewAdminExpiryEmail(admin, memberName, roleName, expiryFormatted) {
  const email = (admin.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return false;
  const subject = `PTW Expiry Alert — ${memberName}`;
  const text = `${memberName}'s PTW authorization for ${roleName} expires on ${expiryFormatted}. Please follow up on renewal. — Acwa Operations, QIPP`;
  try {
    await sendMail({
      to: email,
      subject,
      html: emailTemplate(subject, `<p>${text}</p>`),
    });
    return true;
  } catch (err) {
    console.error('[ptw-expiry] crew admin email failed:', err.message);
    return false;
  }
}

async function deliverExpiryEmails({ member, crewAdmins, memberName, roleName, expiryFormatted, person }) {
  const overrideEmail = String(person?.notifyEmail || '').trim();
  if (member || overrideEmail) {
    await sendMemberExpiryEmail(member, roleName, expiryFormatted, overrideEmail);
  }
  for (const admin of crewAdmins) {
    await sendCrewAdminExpiryEmail(admin, memberName, roleName, expiryFormatted);
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
