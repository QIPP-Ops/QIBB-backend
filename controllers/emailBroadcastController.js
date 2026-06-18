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
const { isValidEmailFormat } = require('../utils/placeholderEmail');

function normalizeEmailList(values) {
  return [...new Set(
    (values || [])
      .map((v) => String(v || '').trim().toLowerCase())
      .filter((v) => v && isValidEmailFormat(v))
  )];
}

function splitEmpIdAndEmailKeys(keys) {
  const empIds = [];
  const emails = [];
  for (const raw of keys || []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    if (value.includes('@')) emails.push(value.toLowerCase());
    else empIds.push(value);
  }
  return { empIds, emails };
}

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
  const fromEmpIds = splitEmpIdAndEmailKeys(
    Array.isArray(body.empIds) ? body.empIds : []
  );

  return {
    crews: Array.isArray(body.crews) ? body.crews.map(String) : [],
    roles: Array.isArray(body.roles) ? body.roles.map(String) : [],
    accessRoles: Array.isArray(body.accessRoles) ? body.accessRoles.map(String) : [],
    empIds: fromEmpIds.empIds,
    emails: normalizeEmailList([
      ...(Array.isArray(body.emails) ? body.emails : []),
      ...fromEmpIds.emails,
    ]),
    all: Boolean(body.all),
  };
}

function parseExplicitRecipients(body) {
  const rows = Array.isArray(body.recipients) ? body.recipients : [];
  return rows
    .map((row) => {
      const email = String(row?.email || '').trim().toLowerCase();
      if (!email || !isValidEmailFormat(email)) return null;
      return {
        name: String(row?.name || '').trim() || 'Colleague',
        email,
        empId: String(row?.empId || '').trim(),
        crew: row?.crew || '',
        role: row?.role || '',
        accessRole: row?.accessRole || '',
      };
    })
    .filter(Boolean);
}

async function resolveRecipients(filters) {
  const query = { isApproved: true, isActive: { $ne: false } };

  if (!filters.all) {
    const or = [];

    if (filters.crews.length) or.push({ crew: { $in: filters.crews } });
    if (filters.roles.length) or.push({ role: { $in: filters.roles } });
    if (filters.accessRoles.length) or.push({ accessRole: { $in: filters.accessRoles } });
    if (filters.empIds.length) or.push({ empId: { $in: filters.empIds } });
    if (filters.emails.length) or.push({ email: { $in: filters.emails } });

    if (!or.length) return [];

    query.$or = or;
  }

  const users = await AdminUser.find(query).select('name fullName email crew role accessRole empId').lean();

  const matched = users.length;
  const recipients = users
    .map((user) => {
      const email = resolveDeliverableEmail(user);
      if (!email) return null;
      return { ...user, email };
    })
    .filter(Boolean);

  if (!recipients.length && matched > 0) {
    console.warn(
      `[email-broadcast] ${matched} user(s) matched filters but none had deliverable email`
    );
  }

  return recipients;
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
        return res.status(400).json({
          message: 'month (YYYY-MM) is required for monthly planned leaves preset',
        });
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
    const explicitRecipients = parseExplicitRecipients(req.body);
    const recipients = explicitRecipients.length
      ? explicitRecipients
      : await resolveRecipients(filters);

    if (!recipients.length) {
      const hasFilters =
        filters.all ||
        filters.crews.length ||
        filters.roles.length ||
        filters.accessRoles.length ||
        filters.empIds.length ||
        filters.emails.length ||
        explicitRecipients.length;

      const hint = hasFilters
        ? 'No recipients had deliverable email addresses. Sync personnel emails or select "Send to all".'
        : 'Select recipients in the list, or enable "Send to all".';

      return res.status(400).json({ message: `No recipients matched the selected filters. ${hint}` });
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

    const courseDescriptionHtml = variables.courseDescription
      ? `<p>${String(variables.courseDescription).trim()}</p>`
      : '';

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
        courseTitle: variables.courseTitle || '',
        courseDescription: courseDescriptionHtml,
        courseLink: variables.courseLink || '',
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

    if (sent === 0 && failures.length) {
      return res.status(502).json({
        message: `All ${failures.length} email(s) failed to send. ${failures[0].message}`,
        sent: 0,
        failed: failures.length,
        failures,
      });
    }

    res.json({ sent, failed: failures.length, failures });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports._internals = {
  resolveRecipients,
  parseRecipientFilters,
  parseExplicitRecipients,
  getMergedPresets,
  loadBundledEmailPresets,
  substituteTemplate,
};
