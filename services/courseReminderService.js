const AdminUser = require('../models/AdminUser');
const CourseAssignment = require('../models/CourseAssignment');
const AdminConfig = require('../models/AdminConfig');
const { sendMail, emailTemplate, isEmailConfigured } = require('./emailService');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { resolveDeliverableEmail } = require('./personnelEmailLookup');
const {
  mergeEmailPresets,
  findEmailPreset,
} = require('./emailPresetsService');

function substituteTemplate(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function getCourseReminderPreset() {
  const config = (await AdminConfig.findOne().lean()) || {};
  return findEmailPreset(mergeEmailPresets(config.emailPresets), 'course-reminder');
}

async function sendCourseReminderEmail(user, courseTitle, courseDescription = '', courseLink = '') {
  const email = resolveDeliverableEmail(user);
  if (!email || !isEmailConfigured()) return { sent: false, reason: 'no_email' };

  const preset = await getCourseReminderPreset();
  const hubLink = courseLink || `${getFrontendBaseUrl()}/trainings`;
  const descriptionHtml = courseDescription
    ? `<p>${String(courseDescription).trim()}</p>`
    : '';
  const vars = {
    name: user.name || 'Team member',
    courseTitle,
    courseDescription: descriptionHtml,
    courseLink: hubLink,
  };
  const subject = substituteTemplate(
    preset?.subject || `Reminder: complete ${courseTitle}`,
    vars
  );
  const bodyInner = substituteTemplate(
    preset?.body ||
      `<p>Dear <strong>{{name}}</strong>,</p><div class="callout"><p>Please complete <strong>{{courseTitle}}</strong> in the Training Hub.</p></div><div class="btn-block"><a href="{{courseLink}}" class="btn">Open Training Hub</a></div><ul class="info-list"><li>Complete all required modules and assessments</li><li>Contact your supervisor if you need support</li></ul>`,
    vars
  );
  await sendMail({ to: email, subject, html: emailTemplate(subject, bodyInner) });
  return { sent: true, email };
}

async function upsertCourseAssignments({
  courseId,
  courseTitle,
  empIds,
  dueDate = null,
  assignedBy = null,
}) {
  const users = await AdminUser.find({
    empId: { $in: empIds },
    isApproved: true,
    isActive: { $ne: false },
  })
    .select('_id empId name email')
    .lean();

  const due = dueDate ? new Date(dueDate) : null;
  const docs = [];
  for (const user of users) {
    const doc = await CourseAssignment.findOneAndUpdate(
      { courseId: String(courseId), userId: user._id },
      {
        $set: {
          courseTitle,
          empId: user.empId,
          dueDate: due,
          assignedBy,
        },
        $setOnInsert: { completedAt: null, lastReminderAt: null },
      },
      { upsert: true, new: true }
    );
    docs.push(doc);
  }
  return { users, assignments: docs };
}

async function sendOverdueCourseReminders({ now = new Date() } = {}) {
  if (!isEmailConfigured()) {
    return { sent: 0, skipped: 0, reason: 'smtp_disabled' };
  }

  const overdue = await CourseAssignment.find({
    completedAt: null,
    dueDate: { $ne: null, $lt: now },
    $or: [
      { lastReminderAt: null },
      { lastReminderAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    ],
  }).lean();

  let sent = 0;
  let skipped = 0;
  for (const row of overdue) {
    const user = await AdminUser.findById(row.userId).select('name email empId').lean();
    if (!user) {
      skipped += 1;
      continue;
    }
    const result = await sendCourseReminderEmail(user, row.courseTitle, '', '');
    if (result.sent) {
      await CourseAssignment.updateOne({ _id: row._id }, { $set: { lastReminderAt: now } });
      sent += 1;
    } else {
      skipped += 1;
    }
  }
  return { sent, skipped, checked: overdue.length };
}

module.exports = {
  sendCourseReminderEmail,
  upsertCourseAssignments,
  sendOverdueCourseReminders,
  substituteTemplate,
};
