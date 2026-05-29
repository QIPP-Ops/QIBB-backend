const AdminUser = require('../models/AdminUser');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function listOptedInAdminUsers() {
  return AdminUser.find({
    accessRole: 'admin',
    isApproved: true,
    receiveEmailNotifications: true,
  })
    .select('_id email name empId receiveEmailNotifications accessRole')
    .lean();
}

async function listPortalAdminsForToggle() {
  return AdminUser.find({ accessRole: 'admin', isApproved: true })
    .select('_id email name empId receiveEmailNotifications accessRole')
    .lean();
}

async function resolveAdminRecipientEmails({ superAdminOnly = false, includeOptedIn = true } = {}) {
  const emails = new Set();
  const superEmail = normalizeEmail(SUPER_ADMIN_EMAIL);
  if (superEmail) emails.add(superEmail);

  if (!superAdminOnly && includeOptedIn) {
    const optedIn = await listOptedInAdminUsers();
    for (const u of optedIn) {
      const e = normalizeEmail(u.email);
      if (e && !isPlaceholderEmail(e)) emails.add(e);
    }
  }
  return [...emails];
}

async function sendAdminBulkEmail({ subject, bodyHtml, superAdminOnly = false, includeOptedIn = true }) {
  if (!isEmailConfigured()) return { sent: 0, recipients: [] };

  const recipients = await resolveAdminRecipientEmails({ superAdminOnly, includeOptedIn });
  let sent = 0;
  for (const to of recipients) {
    try {
      await sendMail({
        to,
        subject,
        html: emailTemplate(subject, bodyHtml),
      });
      sent += 1;
    } catch (err) {
      console.error('[admin-email] send failed:', to, err.message);
    }
  }
  return { sent, recipients };
}

async function setReceiveEmailNotifications(userId, enabled) {
  const user = await AdminUser.findOneAndUpdate(
    { _id: userId, accessRole: 'admin' },
    { $set: { receiveEmailNotifications: Boolean(enabled) } },
    { new: true }
  )
    .select('_id email name empId receiveEmailNotifications accessRole')
    .lean();
  return user;
}

module.exports = {
  normalizeEmail,
  listOptedInAdminUsers,
  listPortalAdminsForToggle,
  resolveAdminRecipientEmails,
  sendAdminBulkEmail,
  setReceiveEmailNotifications,
  SUPER_ADMIN_EMAIL,
};
