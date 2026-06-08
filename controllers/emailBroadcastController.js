const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');
const { sendMail, emailTemplate, isEmailConfigured } = require('../services/emailService');
const { logAction } = require('../services/auditLogService');
const {
  mergeEmailPresets,
  findEmailPreset,
  loadBundledEmailPresets,
} = require('../services/emailPresetsService');
const { resolveDeliverableEmail } = require('../services/personnelEmailLookup');

async function getOrCreateConfig() {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = new AdminConfig();
    await config.save();
  }
  return config;
}

function getMergedPresets(config) {
  return mergeEmailPresets(config?.emailPresets);
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
  return users
    .map((user) => {
      const email = resolveDeliverableEmail(user);
      if (!email) return null;
      return { ...user, email };
    })
    .filter(Boolean);
}

exports.listEmailPresets = async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json({ presets: getMergedPresets(config) });
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
    res.json({ presets: getMergedPresets(config) });
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
      month: monthParam,
    } = req.body || {};

    const config = await getOrCreateConfig();
    const mergedPresets = getMergedPresets(config);
    let finalSubject = String(subject || '').trim();
    let finalBody = String(bodyHtml || '').trim();

    if (presetId) {
      const preset = findEmailPreset(mergedPresets, presetId);
      if (!preset) return res.status(404).json({ message: 'Preset not found' });
      finalSubject = preset.subject;
      finalBody = preset.body;
    }

    if (!finalSubject || !finalBody) {
      return res.status(400).json({ message: 'subject and body are required' });
    }

    let leaveAttachment = null;
    if (presetId === 'monthly-planned-leaves') {
      const yearMonth = String(monthParam || variables.month || '').trim();
      if (!yearMonth) {
        return res.status(400).json({ message: 'month (YYYY-MM) is required for monthly planned leaves preset' });
      }
      try {
        const { buildMonthlyPlannedLeavesWorkbook } = require('../services/monthlyPlannedLeavesExcel');
        leaveAttachment = await buildMonthlyPlannedLeavesWorkbook(yearMonth);
        variables.month = leaveAttachment.monthLabel;
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
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
        attachment: leaveAttachment
          ? { filename: leaveAttachment.filename, rowCount: leaveAttachment.rowCount }
          : null,
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
        month: variables.month || '',
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
          ...(leaveAttachment
            ? {
                attachments: [
                  {
                    filename: leaveAttachment.filename,
                    content: leaveAttachment.buffer,
                    contentType:
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  },
                ],
              }
            : {}),
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

exports._internals = {
  resolveRecipients,
  getMergedPresets,
  loadBundledEmailPresets,
};
