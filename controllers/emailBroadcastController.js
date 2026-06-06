const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const { sendMail, emailTemplate, isEmailConfigured } = require('../services/emailService');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

const DEFAULT_PRESETS = [
  {
    id: 'leave-deadline-full',
    name: 'Use leave balance before deadline',
    subject: 'Reminder: use your annual leave balance before {{deadline}}',
    body:
      '<p>Dear {{name}},</p><p>Please plan and use your remaining annual leave balance before <strong>{{deadline}}</strong>.</p><p>Contact your supervisor or HR if you need support scheduling leave.</p>',
  },
  {
    id: 'leave-deadline-half',
    name: 'Use 50% of balance before deadline',
    subject: 'Reminder: use at least 50% of your leave balance before {{deadline}}',
    body:
      '<p>Dear {{name}},</p><p>Policy requires using at least <strong>50%</strong> of your annual leave balance before <strong>{{deadline}}</strong>.</p><p>Please submit leave in the timesheet portal.</p>',
  },
  {
    id: 'shift-report',
    name: 'Shift report reminder',
    subject: 'Shift report pending — {{date}}',
    body:
      '<p>Dear {{name}},</p><p>Your shift report for <strong>{{date}}</strong> has not been submitted yet. Please complete it in QIPP.</p>',
  },
];

async function getOrCreateConfig() {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = new AdminConfig();
    await config.save();
  }
  if (!Array.isArray(config.emailPresets) || config.emailPresets.length === 0) {
    config.emailPresets = DEFAULT_PRESETS;
    await config.save();
  }
  return config;
}

function substituteTemplate(text, vars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function parseRecipientFilters(body) {
  return {
    crews: Array.isArray(body.crews) ? body.crews.map(String) : [],
    roles: Array.isArray(body.roles) ? body.roles.map(String) : [],
    accessRoles: Array.isArray(body.accessRoles) ? body.accessRoles.map(String) : [],
    empIds: Array.isArray(body.empIds) ? body.empIds.map(String) : [],
    all: Boolean(body.all),
  };
}

async function resolveRecipients(filters) {
  const query = { isApproved: true, isActive: { $ne: false } };
  if (!filters.all) {
    const or = [];
    if (filters.crews.length) or.push({ crew: { $in: filters.crews } });
    if (filters.roles.length) or.push({ role: { $in: filters.roles } });
    if (filters.accessRoles.length) or.push({ accessRole: { $in: filters.accessRoles } });
    if (filters.empIds.length) or.push({ empId: { $in: filters.empIds } });
    if (!or.length) return [];
    query.$or = or;
  }
  const users = await AdminUser.find(query).select('name email crew role accessRole empId').lean();
  return users.filter((u) => u.email && !isPlaceholderEmail(u.email));
}

exports.listEmailPresets = async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json({ presets: config.emailPresets || DEFAULT_PRESETS });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.saveEmailPresets = async (req, res) => {
  try {
    const presets = Array.isArray(req.body?.presets) ? req.body.presets : null;
    if (!presets?.length) {
      return res.status(400).json({ message: 'presets array is required' });
    }
    const config = await getOrCreateConfig();
    config.emailPresets = presets.map((p) => ({
      id: String(p.id || p.name || '').trim() || `preset-${Date.now()}`,
      name: String(p.name || '').trim(),
      subject: String(p.subject || '').trim(),
      body: String(p.body || '').trim(),
    }));
    await config.save();
    res.json({ presets: config.emailPresets });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.sendEmailBroadcast = async (req, res) => {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: 'SMTP is not configured on the server.' });
    }

    const {
      subject,
      bodyHtml,
      presetId,
      variables = {},
      cc = [],
      bcc = [],
      dryRun = false,
    } = req.body || {};

    const config = await getOrCreateConfig();
    let finalSubject = String(subject || '').trim();
    let finalBody = String(bodyHtml || '').trim();

    if (presetId) {
      const preset = (config.emailPresets || []).find((p) => p.id === presetId);
      if (!preset) return res.status(404).json({ message: 'Preset not found' });
      finalSubject = preset.subject;
      finalBody = preset.body;
    }

    if (!finalSubject || !finalBody) {
      return res.status(400).json({ message: 'subject and body are required' });
    }

    const filters = parseRecipientFilters(req.body);
    const recipients = await resolveRecipients(filters);
    if (!recipients.length) {
      return res.status(400).json({ message: 'No recipients matched the selected filters.' });
    }

    if (dryRun) {
      return res.json({
        dryRun: true,
        recipientCount: recipients.length,
        recipients: recipients.map((r) => ({
          name: r.name,
          email: r.email,
          crew: r.crew,
          empId: r.empId,
        })),
      });
    }

    const ccList = [...new Set([].concat(cc || []).map((e) => String(e).trim()).filter(Boolean))];
    const bccList = [...new Set([].concat(bcc || []).map((e) => String(e).trim()).filter(Boolean))];

    let sent = 0;
    const failures = [];

    for (const user of recipients) {
      const vars = {
        name: user.name,
        email: user.email,
        crew: user.crew,
        role: user.role,
        empId: user.empId,
        deadline: variables.deadline || '',
        date: variables.date || '',
      };
      const subj = substituteTemplate(finalSubject, vars);
      const html = emailTemplate(subj, substituteTemplate(finalBody, vars));
      try {
        await sendMail({
          to: user.email,
          subject: subj,
          html,
          ...(ccList.length ? { cc: ccList.join(', ') } : {}),
          ...(bccList.length ? { bcc: bccList.join(', ') } : {}),
        });
        sent += 1;
      } catch (err) {
        failures.push({ email: user.email, message: err.message });
      }
    }

    await logAction({
      actor: req.user,
      action: 'ADMIN_EMAIL_BROADCAST',
      targetType: 'email_broadcast',
      targetName: finalSubject,
      after: { sent, failed: failures.length, presetId: presetId || null },
      req,
    });

    res.json({ sent, failed: failures.length, failures });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
