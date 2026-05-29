const Notification = require('../models/Notification');
const AdminUser = require('../models/AdminUser');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { sendAdminBulkEmail } = require('./adminEmailService');
const { isShiftReportEmailRemindersEnabled } = require('./systemSettingsService');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { MANAGEMENT_JOB_ROLES } = require('./shiftScheduleService');

/** Recipient matrix per notification type. */
const RECIPIENT_MATRIX = {
  shift_missing: { member: true, supervisor: true, admin: 'digest' },
  chemistry_alarm: { member: true, supervisor: true, admin: 'immediate' },
  quiz_assigned: { member: true, supervisor: false, admin: false },
  quiz_completed: { member: false, supervisor: false, admin: true },
  quiz_prize_claimed: { member: false, supervisor: false, admin: true },
  leave_conflict: { member: false, supervisor: false, admin: true },
  roster_lock: { member: true, supervisor: true, admin: true },
  roster_unlock: { member: true, supervisor: true, admin: true },
  ingest_complete: { member: false, supervisor: false, admin: true },
};

function isSupervisorRole(role) {
  if (!role) return false;
  const r = String(role).toLowerCase();
  return (
    MANAGEMENT_JOB_ROLES.has(role) ||
    r.includes('shift in charge') ||
    r.includes('supervisor') ||
    r.includes('sic')
  );
}

async function listAdmins() {
  return AdminUser.find({ accessRole: 'admin', isApproved: true }).select('_id email name empId').lean();
}

async function findSupervisorsForCrew(crew) {
  if (!crew) return [];
  return AdminUser.find({
    isApproved: true,
    crew,
    $or: [
      { role: { $in: [...MANAGEMENT_JOB_ROLES] } },
      { role: /shift in charge/i },
      { role: /supervisor/i },
    ],
  })
    .select('_id email name empId role crew')
    .lean();
}

async function deliverEmail(user, subject, htmlBody) {
  const email = (user.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return false;
  try {
    await sendMail({ to: email, subject, html: emailTemplate(subject, htmlBody) });
    return true;
  } catch (err) {
    console.error('[notification] email failed:', err.message);
    return false;
  }
}

async function createNotification({
  type,
  recipientUserId,
  title,
  body = '',
  link = '',
  metadata = {},
  dedupeKey = '',
  sendEmail = false,
}) {
  if (dedupeKey) {
    const existing = await Notification.findOne({ dedupeKey, recipientUserId }).lean();
    if (existing) return existing;
  }

  const doc = await Notification.create({
    type,
    recipientUserId,
    title,
    body,
    link,
    metadata,
    dedupeKey: dedupeKey || undefined,
  });

  if (sendEmail) {
    const user = await AdminUser.findById(recipientUserId).lean();
    if (user) {
      const sent = await deliverEmail(user, title, `<p>${body}</p>${link ? `<p><a href="${link}">Open in QIPP</a></p>` : ''}`);
      if (sent) {
        doc.emailSentAt = new Date();
        await doc.save();
      }
    }
  }

  return doc;
}

async function notifyShiftMissing({ member, shiftDate, shiftLabel, supervisors, adminDigest = false }) {
  const type = 'shift_missing';
  const matrix = RECIPIENT_MATRIX[type];
  const base = getFrontendBaseUrlSafe();
  const shiftEmailsEnabled = await isShiftReportEmailRemindersEnabled();

  if (matrix.member && member?._id) {
    await createNotification({
      type,
      recipientUserId: member._id,
      title: 'Shift report missing',
      body: `You haven't submitted your ${shiftLabel} shift report for ${shiftDate}.`,
      link: `${base}/personnel`,
      dedupeKey: `shift-missing:self:${member.empId}:${shiftDate}:${shiftLabel}`,
      sendEmail: shiftEmailsEnabled,
    });
  }

  if (matrix.supervisor) {
    for (const sup of supervisors || []) {
      await createNotification({
        type,
        recipientUserId: sup._id,
        title: 'Shift report missing',
        body: `${member.name} has not submitted the ${shiftLabel} shift report for ${shiftDate}.`,
        link: `${base}/management`,
        dedupeKey: `shift-missing:sic:${sup.empId}:${member.empId}:${shiftDate}:${shiftLabel}`,
        sendEmail: shiftEmailsEnabled,
      });
    }
  }

  if (matrix.admin === 'digest' && adminDigest) {
    const admins = await listAdmins();
    for (const admin of admins) {
      await createNotification({
        type,
        recipientUserId: admin._id,
        title: `Shift report digest — ${shiftLabel} ${shiftDate}`,
        body: adminDigest,
        link: `${base}/management`,
        dedupeKey: `shift-missing:digest:${shiftDate}:${shiftLabel}:${admin.empId}`,
        sendEmail: shiftEmailsEnabled,
      });
    }
  }
}

async function notifyChemistryAlarm({ chemists, supervisors, admins, metricLabel, value, limitLabel, reportDate }) {
  const type = 'chemistry_alarm';
  const base = getFrontendBaseUrlSafe();
  const body = `${metricLabel} = ${value} (${limitLabel}) on ${reportDate}`;

  for (const u of chemists || []) {
    await createNotification({
      type,
      recipientUserId: u._id,
      title: 'Chemistry alarm',
      body,
      link: `${base}/chemistry`,
      dedupeKey: `chem-alarm:${u.empId}:${metricLabel}:${reportDate}`,
      sendEmail: true,
    });
  }
  for (const u of supervisors || []) {
    await createNotification({
      type,
      recipientUserId: u._id,
      title: 'Chemistry alarm',
      body,
      link: `${base}/chemistry`,
      dedupeKey: `chem-alarm:sic:${u.empId}:${metricLabel}:${reportDate}`,
      sendEmail: true,
    });
  }
  for (const u of admins || []) {
    await createNotification({
      type,
      recipientUserId: u._id,
      title: 'Chemistry alarm',
      body,
      link: `${base}/chemistry`,
      dedupeKey: `chem-alarm:admin:${u.empId}:${metricLabel}:${reportDate}`,
      sendEmail: false,
    });
  }

  await sendAdminBulkEmail({
    subject: `Chemistry Alarm — ${metricLabel} out of range`,
    bodyHtml: `<p>${body}</p><p><a href="${base}/chemistry">Open chemistry dashboard</a></p>`,
  });
}

async function notifyRosterLockChange(locked, actorName = 'Administrator') {
  const type = locked ? 'roster_lock' : 'roster_unlock';
  const title = locked ? 'System roster locked' : 'System roster unlocked';
  const body = locked
    ? 'The administrator has locked the roster. Leave planner edits are disabled.'
    : 'The roster is unlocked. Leave planner edits are enabled again.';
  const base = getFrontendBaseUrlSafe();
  const users = await AdminUser.find({ isApproved: true }).select('_id empId').lean();
  for (const u of users) {
    await createNotification({
      type,
      recipientUserId: u._id,
      title,
      body,
      link: `${base}/leave`,
      dedupeKey: `${type}:${u.empId}:${new Date().toISOString().slice(0, 13)}`,
      sendEmail: false,
    });
  }

  const stateLabel = locked ? 'Locked' : 'Unlocked';
  await sendAdminBulkEmail({
    subject: `Roster ${stateLabel} by ${actorName}`,
    bodyHtml: `<p>The system roster was <strong>${stateLabel.toLowerCase()}</strong> by ${actorName}.</p>`,
    superAdminOnly: true,
  });
}

async function notifyIngestComplete(summary) {
  const admins = await listAdmins();
  const base = getFrontendBaseUrlSafe();
  for (const admin of admins) {
    await createNotification({
      type: 'ingest_complete',
      recipientUserId: admin._id,
      title: 'Plant data ingest complete',
      body: summary,
      link: `${base}/admin-portal/trends`,
      dedupeKey: `ingest:${new Date().toISOString().slice(0, 16)}:${admin.empId}`,
      sendEmail: false,
    });
  }
}

async function notifyQuizAssigned(userId, quizTitle, metadata = {}) {
  await createNotification({
    type: 'quiz_assigned',
    recipientUserId: userId,
    title: 'Quiz assigned',
    body: `You have been assigned: ${quizTitle}`,
    link: `${getFrontendBaseUrlSafe()}/trainings`,
    metadata: { quizTitle, ...metadata },
    dedupeKey: `quiz-assigned:${userId}:${quizTitle}`,
    sendEmail: true,
  });
}

async function notifyQuizCompleted(adminId, userName, quizTitle, metadata = {}) {
  await createNotification({
    type: 'quiz_completed',
    recipientUserId: adminId,
    title: 'Quiz completed',
    body: `${userName} completed ${quizTitle}`,
    link: `${getFrontendBaseUrlSafe()}/trainings`,
    metadata: { quizTitle, userName, ...metadata },
    dedupeKey: `quiz-done:${adminId}:${userName}:${quizTitle}`,
    sendEmail: false,
  });
}

async function notifyQuizPrizeClaimed(adminId, userName, quizTitle) {
  await createNotification({
    type: 'quiz_prize_claimed',
    recipientUserId: adminId,
    title: 'Prize claimed',
    body: `${userName} claimed their prize for ${quizTitle}`,
    link: `${getFrontendBaseUrlSafe()}/trainings`,
    metadata: { quizTitle, userName },
    dedupeKey: `quiz-prize:${adminId}:${userName}:${quizTitle}`,
    sendEmail: false,
  });

  await sendAdminBulkEmail({
    subject: `Prize Claim — ${userName} completed ${quizTitle}`,
    bodyHtml: `<p><strong>${userName}</strong> claimed their prize after completing <strong>${quizTitle}</strong>.</p>`,
    superAdminOnly: true,
  });
}

async function notifyLeaveConflict(message) {
  const admins = await listAdmins();
  for (const admin of admins) {
    await createNotification({
      type: 'leave_conflict',
      recipientUserId: admin._id,
      title: 'Leave conflict detected',
      body: message,
      link: `${getFrontendBaseUrlSafe()}/leave`,
      dedupeKey: `leave-conflict:${admin.empId}:${message.slice(0, 80)}`,
      sendEmail: false,
    });
  }
}

function getFrontendBaseUrlSafe() {
  try {
    const { getFrontendBaseUrl } = require('../config/frontendUrl');
    return getFrontendBaseUrl();
  } catch {
    return 'https://qipp.live';
  }
}

module.exports = {
  RECIPIENT_MATRIX,
  isSupervisorRole,
  findSupervisorsForCrew,
  listAdmins,
  createNotification,
  notifyShiftMissing,
  notifyChemistryAlarm,
  notifyRosterLockChange,
  notifyIngestComplete,
  notifyQuizAssigned,
  notifyQuizCompleted,
  notifyQuizPrizeClaimed,
  notifyLeaveConflict,
};
