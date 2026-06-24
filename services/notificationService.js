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
  quiz_assigned: { member: true, supervisor: false, admin: false },
  quiz_completed: { member: false, supervisor: false, admin: 'super' },
  quiz_prize_claimed: { member: false, supervisor: false, admin: 'super' },
  leave_conflict: { member: false, supervisor: false, admin: 'super' },
  roster_lock: { member: false, supervisor: false, admin: 'super' },
  roster_unlock: { member: false, supervisor: false, admin: 'super' },
};

const SYSTEM_DIGEST_NOTIFICATION_TYPES = [
  'roster_lock',
  'roster_unlock',
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
    recipientEmpId: metadata?.recipientEmpId || '',
    title,
    body,
    message: body,
    leaveId: metadata?.leaveId || '',
    read: false,
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

async function notifyKpiPendingFinal({ employee }) {
  const base = getFrontendBaseUrlSafe();
  const name = employee?.name || employee?.empId || 'Employee';
  const { findPlantManagerUser } = require('./plantManagerService');
  const plantManager = await findPlantManagerUser();
  if (plantManager?.email) {
    try {
      await sendMail({
        to: plantManager.email,
        subject: `KPI goals awaiting your final approval — ${name}`,
        html: emailTemplate(
          'KPI final approval required',
          `<p>Hi <strong>${plantManager.name || 'Plant Manager'}</strong>,</p>
          ${emailCallout(`<p><strong>${name}</strong> (${employee?.empId || '—'}) has KPI goals ready for your final approval.</p>`)}
          ${emailCtaButton(`${base}/settings`, 'Review KPI queue')}`
        ),
      });
    } catch (err) {
      console.error('[notification] KPI pending final email failed:', err.message);
    }
  }
  await sendAdminBulkEmail({
    subject: `KPI sent for plant manager approval — ${name}`,
    bodyHtml: `
      ${emailCallout(`<p><strong>${name}</strong> (${employee?.empId || '—'}) is awaiting plant manager final KPI approval.</p>`)}
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

async function notifySafetyObservationReminder({ recipientUserId, empId, name, count, month }) {
  const base = getFrontendBaseUrlSafe();
  const remaining = Math.max(0, 2 - (count || 0));
  await createNotification({
    type: 'safety_observation_reminder',
    recipientUserId,
    title: 'Safety observation quota reminder',
    body: `You have submitted ${count || 0} of 2 required safety observations for ${month}. ${remaining} more needed.`,
    link: `${base}/personnel#safety-observations`,
    dedupeKey: `safety-reminder:${empId}:${month}`,
    sendEmail: true,
    metadata: { empId, count, month, remaining },
  });
  const user = await AdminUser.findById(recipientUserId).select('email name').lean();
  if (user?.email) {
    await deliverEmail(
      user,
      'Safety observation reminder — QIPP',
      `<p>Hi <strong>${name || user.name || ''}</strong>,</p>
      ${emailCallout(`<p>You have submitted <strong>${count || 0}</strong> of <strong>2</strong> required safety observations for <strong>${month}</strong>.</p>`)}
      ${emailCtaButton(`${base}/personnel#safety-observations`, 'Register observation')}`
    );
  }
}

const LEAVE_NOTIFICATION_TYPES = new Set([
  'leave_approved',
  'leave_rejected',
  'leave_pending',
  'delegation_request',
  'delegation_approved',
  'delegation_declined',
]);

const LEAVE_NOTIFICATION_TITLES = {
  leave_approved: 'Leave approved',
  leave_rejected: 'Leave rejected',
  leave_pending: 'Leave pending approval',
  delegation_request: 'Cover request',
  delegation_approved: 'Cover request approved',
  delegation_declined: 'Cover request declined',
};

function leaveNotificationLink(leaveId) {
  const base = getFrontendBaseUrlSafe();
  return leaveId ? `${base}/leave` : `${base}/leave`;
}

async function createLeavePushNotification(empId, type, message, leaveId = '') {
  if (!empId || !type || !message) return null;
  const user = await AdminUser.findOne({ empId: String(empId).trim() })
    .select('_id empId')
    .lean();
  if (!user) return null;

  const title = LEAVE_NOTIFICATION_TITLES[type] || 'Notification';
  const dedupeKey = leaveId
    ? `${type}:${empId}:${leaveId}:${Date.now().toString().slice(0, 13)}`
    : `${type}:${empId}:${message.slice(0, 40)}`;

  return createNotification({
    type,
    recipientUserId: user._id,
    recipientEmpId: user.empId,
    title,
    body: message,
    message,
    leaveId: leaveId || '',
    link: leaveNotificationLink(leaveId),
    metadata: { leaveId: leaveId || null, recipientEmpId: user.empId },
    dedupeKey,
    sendEmail: false,
  }).then(async (doc) => {
    if (doc && doc.read !== true) {
      doc.read = false;
      if (typeof doc.save === 'function') await doc.save();
    }
    return doc;
  });
}

async function getUnreadForUser(empId) {
  const user = await AdminUser.findOne({ empId: String(empId).trim() }).select('_id').lean();
  if (!user) return 0;
  return Notification.countDocuments({
    recipientUserId: user._id,
    $or: [{ read: false }, { readAt: null }],
  });
}

async function markAllReadForEmpId(empId) {
  const user = await AdminUser.findOne({ empId: String(empId).trim() }).select('_id').lean();
  if (!user) return { modifiedCount: 0 };
  const now = new Date();
  const result = await Notification.updateMany(
    {
      recipientUserId: user._id,
      $or: [{ read: false }, { readAt: null }],
    },
    { $set: { read: true, readAt: now } }
  );
  return result;
}

module.exports = {
  RECIPIENT_MATRIX,
  SYSTEM_DIGEST_NOTIFICATION_TYPES,
  LEAVE_NOTIFICATION_TYPES,
  isShiftReportDigestNotification,
  isSupervisorRole,
  findSupervisorsForCrew,
  findSuperAdminUser,
  listAdmins,
  createNotification,
  createLeavePushNotification,
  getUnreadForUser,
  markAllReadForEmpId,
  notifyShiftMissing,
  notifyRosterLockChange,
  notifyQuizAssigned,
  notifyQuizCompleted,
  notifyQuizPrizeClaimed,
  notifyLeaveConflict,
  notifyKpiSubmitted,
  notifyKpiPendingFinal,
  notifyKpiFinalized,
  notifySafetyObservationReminder,
};
