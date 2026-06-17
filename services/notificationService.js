const Notification = require('../models/Notification');
const AdminUser = require('../models/AdminUser');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { sendAdminBulkEmail } = require('./adminEmailService');
const {
  emailCallout,
  emailCtaButton,
} = require('./emailHtmlHelpers');
const { isShiftReportEmailRemindersEnabledForCrew } = require('./systemSettingsService');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { MANAGEMENT_JOB_ROLES } = require('./shiftScheduleService');

/** Recipient matrix per notification type. */
const RECIPIENT_MATRIX = {
  shift_missing: { member: true, supervisor: true, admin: 'digest_super' },
  chemistry_alarm: { member: true, supervisor: true, admin: 'super' },
  quiz_assigned: { member: true, supervisor: false, admin: false },
  quiz_completed: { member: false, supervisor: false, admin: 'super' },
  quiz_prize_claimed: { member: false, supervisor: false, admin: 'super' },
  leave_conflict: { member: false, supervisor: false, admin: 'super' },
  roster_lock: { member: false, supervisor: false, admin: 'super' },
  roster_unlock: { member: false, supervisor: false, admin: 'super' },
  ingest_complete: { member: false, supervisor: false, admin: 'super' },
};

const SYSTEM_DIGEST_NOTIFICATION_TYPES = [
  'roster_lock',
  'roster_unlock',
  'ingest_complete',
  'leave_conflict',
];

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

async function findSuperAdminUser() {
  const email = String(SUPER_ADMIN_EMAIL || '').trim();
  if (!email) return null;
  return AdminUser.findOne({
    email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    isApproved: true,
  })
    .select('_id email name empId')
    .lean();
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
      const sent = await deliverEmail(
        user,
        title,
        `<p>${body}</p>${link ? emailCtaButton(link, 'Open in QIPP') : ''}`
      );
      if (sent) {
        doc.emailSentAt = new Date();
        await doc.save();
      }
    }
  }

  return doc;
}

async function notifyShiftMissing({
  member,
  shiftDate,
  shiftLabel,
  supervisors,
  adminDigest = false,
  crew = null,
}) {
  const type = 'shift_missing';
  const matrix = RECIPIENT_MATRIX[type];
  const base = getFrontendBaseUrlSafe();
  const reminderCrew = crew || member?.crew || null;
  const shiftEmailsEnabled = await isShiftReportEmailRemindersEnabledForCrew(reminderCrew);

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

  if (matrix.admin === 'digest_super' && adminDigest) {
    const superAdmin = await findSuperAdminUser();
    if (superAdmin) {
      await createNotification({
        type,
        recipientUserId: superAdmin._id,
        title: `Shift report digest — ${shiftLabel} ${shiftDate}`,
        body: adminDigest,
        link: `${base}/management`,
        dedupeKey: `shift-missing:digest:${shiftDate}:${shiftLabel}:${superAdmin.empId}`,
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

  const superAdmin = await findSuperAdminUser();
  if (superAdmin) {
    await createNotification({
      type,
      recipientUserId: superAdmin._id,
      title: 'Chemistry alarm',
      body,
      link: `${base}/chemistry`,
      dedupeKey: `chem-alarm:admin:${superAdmin.empId}:${metricLabel}:${reportDate}`,
      sendEmail: false,
    });
  }

  await sendAdminBulkEmail({
    subject: `Chemistry Alarm — ${metricLabel} out of range`,
    bodyHtml: `
      ${emailCallout(`<p><strong>${metricLabel}</strong> is out of range: <strong>${value}</strong> (${limitLabel}) on ${reportDate}.</p>`, 'warning')}
      <p>Review the chemistry dashboard and confirm corrective actions if required.</p>
      ${emailCtaButton(`${base}/chemistry`, 'Open chemistry dashboard')}
    `,
  });
}

async function notifyRosterLockChange(locked, actorName = 'Administrator') {
  const type = locked ? 'roster_lock' : 'roster_unlock';
  const title = locked ? 'System roster locked' : 'System roster unlocked';
  const body = locked
    ? 'The administrator has locked the roster. Leave planner edits are disabled.'
    : 'The roster is unlocked. Leave planner edits are enabled again.';
  const base = getFrontendBaseUrlSafe();
  const superAdmin = await findSuperAdminUser();
  if (superAdmin) {
    await createNotification({
      type,
      recipientUserId: superAdmin._id,
      title,
      body,
      link: `${base}/leave`,
      dedupeKey: `${type}:${superAdmin.empId}:${new Date().toISOString().slice(0, 13)}`,
      sendEmail: false,
    });
  }

  const stateLabel = locked ? 'Locked' : 'Unlocked';
  await sendAdminBulkEmail({
    subject: `Roster ${stateLabel} by ${actorName}`,
    bodyHtml: `
      ${emailCallout(`<p>The system roster was <strong>${stateLabel.toLowerCase()}</strong> by ${actorName}.</p>`)}
      <p>${locked
        ? 'Leave planner edits are currently disabled for personnel until the roster is unlocked again.'
        : 'Leave planner edits are enabled again for approved personnel.'}</p>
      ${emailCtaButton(`${base}/leave`, 'Open leave planner')}
    `,
    superAdminOnly: true,
  });
}

async function notifyIngestComplete(summary) {
  const superAdmin = await findSuperAdminUser();
  if (!superAdmin) return;
  const base = getFrontendBaseUrlSafe();
  await createNotification({
    type: 'ingest_complete',
    recipientUserId: superAdmin._id,
    title: 'Plant data ingest complete',
    body: summary,
    link: `${base}/admin-portal/trends`,
    dedupeKey: `ingest:${new Date().toISOString().slice(0, 16)}:${superAdmin.empId}`,
    sendEmail: false,
  });
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

async function notifyQuizCompleted(_adminId, userName, quizTitle, metadata = {}) {
  const superAdmin = await findSuperAdminUser();
  if (!superAdmin) return;
  await createNotification({
    type: 'quiz_completed',
    recipientUserId: superAdmin._id,
    title: 'Quiz completed',
    body: `${userName} completed ${quizTitle}`,
    link: `${getFrontendBaseUrlSafe()}/trainings`,
    metadata: { quizTitle, userName, ...metadata },
    dedupeKey: `quiz-done:${superAdmin.empId}:${userName}:${quizTitle}`,
    sendEmail: false,
  });
}

async function notifyQuizPrizeClaimed(_adminId, userName, quizTitle) {
  const superAdmin = await findSuperAdminUser();
  if (!superAdmin) return;
  await createNotification({
    type: 'quiz_prize_claimed',
    recipientUserId: superAdmin._id,
    title: 'Prize claimed',
    body: `${userName} claimed their prize for ${quizTitle}`,
    link: `${getFrontendBaseUrlSafe()}/trainings`,
    metadata: { quizTitle, userName },
    dedupeKey: `quiz-prize:${superAdmin.empId}:${userName}:${quizTitle}`,
    sendEmail: false,
  });

  await sendAdminBulkEmail({
    subject: `Prize Claim — ${userName} completed ${quizTitle}`,
    bodyHtml: `
      ${emailCallout(`<p><strong>${userName}</strong> claimed their prize after completing <strong>${quizTitle}</strong>.</p>`)}
      <p>Review the training record in QIPP if follow-up is required.</p>
      ${emailCtaButton(`${getFrontendBaseUrlSafe()}/trainings`, 'Open Training Hub')}
    `,
    superAdminOnly: true,
  });
}

async function notifyKpiSubmitted({ employee }) {
  const base = getFrontendBaseUrlSafe();
  const name = employee?.name || employee?.empId || 'Employee';
  const kpiCount = Array.isArray(employee?.kpis) ? employee.kpis.length : 0;
  await sendAdminBulkEmail({
    subject: `KPI submitted for review — ${name}`,
    bodyHtml: `
      ${emailCallout(`<p><strong>${name}</strong> (${employee?.empId || '—'}) submitted ${kpiCount} KPI goal${kpiCount === 1 ? '' : 's'} for review.</p>`)}
      <p>Please review the submission and finalize goals when ready.</p>
      ${emailCtaButton(`${base}/settings`, 'Open admin KPI review')}
    `,
    superAdminOnly: true,
  });
}

async function notifyKpiFinalized({ employee, reviewNotes = '' }) {
  const base = getFrontendBaseUrlSafe();
  const email = (employee?.email || '').trim();
  if (!email || isPlaceholderEmail(email) || !isEmailConfigured()) return { sent: false };

  const kpiLines = (employee?.kpis || [])
    .map((k) => `<li><strong>${k.title}</strong> — weight ${k.weight ?? 0}% · progress ${k.progress ?? 0}%</li>`)
    .join('');
  const notesBlock = reviewNotes
    ? emailCallout(`<p><strong>Review notes:</strong> ${String(reviewNotes).replace(/</g, '&lt;')}</p>`)
    : '';

  try {
    await sendMail({
      to: email,
      subject: 'Your KPI goals have been finalized',
      html: emailTemplate(
        'KPI goals finalized',
        `<p>Hi <strong>${employee.name || ''}</strong>,</p>
        ${emailCallout('<p>Your KPI goals have been reviewed and finalized by the administrator.</p>')}
        ${notesBlock}
        ${kpiLines ? `<ul class="info-list">${kpiLines}</ul>` : ''}
        ${emailCtaButton(`${base}/settings/kpi`, 'View your KPI goals')}`
      ),
    });
    return { sent: true };
  } catch (err) {
    console.error('[notification] KPI finalize email failed:', err.message);
    return { sent: false };
  }
}

async function notifyLeaveConflict(message) {
  const superAdmin = await findSuperAdminUser();
  if (!superAdmin) return;
  await createNotification({
    type: 'leave_conflict',
    recipientUserId: superAdmin._id,
    title: 'Leave conflict detected',
    body: message,
    link: `${getFrontendBaseUrlSafe()}/leave`,
    dedupeKey: `leave-conflict:${superAdmin.empId}:${message.slice(0, 80)}`,
    sendEmail: false,
  });
}

function getFrontendBaseUrlSafe() {
  try {
    const { getFrontendBaseUrl } = require('../config/frontendUrl');
    return getFrontendBaseUrl();
  } catch {
    return 'https://qipp.live';
  }
}

function isShiftReportDigestNotification(doc) {
  return (
    doc.type === 'shift_missing' &&
    (String(doc.title || '').includes('digest') || String(doc.dedupeKey || '').startsWith('shift-missing:digest:'))
  );
}

module.exports = {
  RECIPIENT_MATRIX,
  SYSTEM_DIGEST_NOTIFICATION_TYPES,
  isShiftReportDigestNotification,
  isSupervisorRole,
  findSupervisorsForCrew,
  findSuperAdminUser,
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
  notifyKpiSubmitted,
  notifyKpiFinalized,
};
