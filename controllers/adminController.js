const AdminConfig = require('../models/AdminConfig');
const AdminUser   = require('../models/AdminUser');
const bcrypt      = require('bcryptjs');
const { logRosterEvent } = require('../services/rosterAuditService');
const { logPtwEvent } = require('../services/ptwAuditService');
const PtwAuditLog = require('../models/PtwAuditLog');
const { isPlaceholderEmail } = require('../utils/placeholderEmail');
const { syncPlaceholderEmailForUser } = require('../services/personnelEmailLookup');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

// ─── Status / PIN / Lock ─────────────────────────────────────────────────────

exports.getStatus = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) return res.json({ editingLocked: false });
    res.json({ editingLocked: config.editingLocked });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching status', error: err.message });
  }
};

const { loadMetricKeyRegistry } = require('../services/metricKeyRegistry');
const {
  healthFromLastDataPoint,
  healthLabel,
  FRESH_HOURS,
  STALE_HOURS,
} = require('../utils/blobHealth');
const {
  getEmailDomainPolicy,
  normalizeDomainList,
  DEFAULT_ALLOWED_DOMAINS,
  DEFAULT_AUTO_APPROVED_DOMAINS,
} = require('../services/emailDomainPolicy');

const TREND_BLOB_PAGES = ['home', 'historical-trends', 'trend-studio'];
const TREND_DATA_SOURCE = 'Azure qipp-data → trends-bundle';

function trendBlobLabels() {
  return loadMetricKeyRegistry().blobs || {};
}

exports.getTrendSources = async (_req, res) => {
  try {
    const {
      buildTrendsBundleFromSixBlobs,
      slugMetricKey,
    } = require('../services/plantReports/buildTrendsBundleFromSixBlobs');
    const {
      KIND_TO_FILE,
      readBundledRaw,
    } = require('../services/plantReports/trendsBlobBundle');
    const {
      BLOB_FILE_KIND,
      normalizeTrendBlobByKind,
    } = require('../services/plantReports/trendBlobNormalize');
    const { getSyncState } = require('../services/plantReports/syncTrendsBlobsService');

    const { payload } = buildTrendsBundleFromSixBlobs();
    const sync = getSyncState();
    const syncAt = sync.lastResult?.lastRunAt || payload?.generatedAt || null;
    const now = Date.now();

    const rows = Object.keys(KIND_TO_FILE).map((kind) => {
      const normalizeKind = BLOB_FILE_KIND[kind] || kind;
      const raw = readBundledRaw(kind);
      const blobRows = raw != null ? normalizeTrendBlobByKind(normalizeKind, raw) : [];
      const metricKeys = [...new Set(blobRows.map((row) => slugMetricKey(row.metric)).filter(Boolean))];
      const dates = blobRows.map((row) => String(row.date || '').slice(0, 10)).filter(Boolean).sort();
      const lastDataPoint = dates[dates.length - 1] ?? null;

      let healthStatus = healthFromLastDataPoint(lastDataPoint, now);
      if (!lastDataPoint && sync.errors?.length) healthStatus = 'red';
      else if (!lastDataPoint && syncAt) {
        const syncAgeMs = now - new Date(syncAt).getTime();
        healthStatus = syncAgeMs <= 7 * 24 * 60 * 60 * 1000 ? 'yellow' : 'red';
      }

      return {
        trendId: kind,
        name: trendBlobLabels()[kind] || kind,
        pages: [...TREND_BLOB_PAGES],
        dataSource: TREND_DATA_SOURCE,
        lastDataPoint,
        healthStatus,
        healthLabel: healthLabel(healthStatus),
        metricKeys,
        matchedFilePatterns: [KIND_TO_FILE[kind]],
        bundleMeta: {
          metricsInKind: metricKeys.length,
          pointsInKind: blobRows.length,
          kindsLoaded: payload?.bundleMeta?.kindsLoaded ?? [],
          lastSyncAt: syncAt,
        },
      };
    });

    const worst = rows.reduce(
      (acc, r) => (r.healthStatus === 'red' ? 'red' : acc === 'red' ? 'red' : r.healthStatus === 'yellow' ? 'yellow' : acc),
      'green'
    );

    res.json({
      success: true,
      data: rows,
      summary: {
        worstStatus: worst,
        freshHours: FRESH_HOURS,
        staleHours: STALE_HOURS,
        hasStale: rows.some((r) => r.healthStatus !== 'green'),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching trend sources', error: err.message });
  }
};

exports.getEmailDomains = async (_req, res) => {
  try {
    const policy = await getEmailDomainPolicy();
    res.json({
      allowedEmailDomains: policy.allowed,
      autoApprovedEmailDomains: policy.autoApproved,
      defaults: {
        allowedEmailDomains: DEFAULT_ALLOWED_DOMAINS,
        autoApprovedEmailDomains: DEFAULT_AUTO_APPROVED_DOMAINS,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching email domains', error: err.message });
  }
};

exports.patchEmailDomains = async (req, res) => {
  try {
    const allowed = normalizeDomainList(req.body?.allowedEmailDomains);
    const autoApproved = normalizeDomainList(req.body?.autoApprovedEmailDomains);
    if (!allowed.length) {
      return res.status(400).json({ message: 'At least one allowed email domain is required.' });
    }
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    config.allowedEmailDomains = allowed;
    config.autoApprovedEmailDomains = autoApproved.length ? autoApproved : allowed;
    await config.save();
    res.json({
      allowedEmailDomains: config.allowedEmailDomains,
      autoApprovedEmailDomains: config.autoApprovedEmailDomains,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error saving email domains', error: err.message });
  }
};

exports.getConfig = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) { config = new AdminConfig(); await config.save(); }
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching configuration', error: err.message });
  }
};

exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length < 4) return res.status(400).json({ message: 'PIN must be at least 4 digits.' });
    const hash = await bcrypt.hash(pin, 10);
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig({ pinHash: hash });
    else config.pinHash = hash;
    await config.save();
    res.json({ message: 'PIN updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Error setting PIN', error: err.message });
  }
};

exports.checkPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const config = await AdminConfig.findOne();
    if (!config || !config.pinHash) return res.status(404).json({ message: 'No PIN set.' });
    const valid = await bcrypt.compare(pin, config.pinHash);
    if (!valid) return res.status(401).json({ message: 'Invalid PIN.' });
    res.json({ message: 'PIN valid.' });
  } catch (err) {
    res.status(500).json({ message: 'Error checking PIN', error: err.message });
  }
};

exports.setLock = async (req, res) => {
  try {
    const { locked } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    const beforeLocked = !!config.editingLocked;
    config.editingLocked = !!locked;
    await config.save();
    try {
      const { notifyRosterLockChange } = require('../services/notificationService');
      const actor = await AdminUser.findById(req.user?.id).select('name email').lean();
      const actorName = actor?.name || actor?.email || 'Administrator';
      await notifyRosterLockChange(!!locked, actorName);
    } catch (notifyErr) {
      console.warn('[lock] notification skipped:', notifyErr.message);
    }
    await logAction({
      actor: req.user,
      action: config.editingLocked ? AUDIT_ACTIONS.ROSTER_LOCKED : AUDIT_ACTIONS.ROSTER_UNLOCKED,
      targetType: 'system',
      targetId: 'editingLocked',
      targetName: 'Roster editing lock',
      before: { editingLocked: beforeLocked },
      after: { editingLocked: config.editingLocked },
      req,
    });
    res.json({ message: `Editing lock set to ${!!locked}`, editingLocked: config.editingLocked });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling lock', error: err.message });
  }
};

// ─── Crews / Roles (accepts {crew} OR {name}) ────────────────────────────────

exports.addCrew = async (req, res) => {
  try {
    const crew = (req.body.crew || req.body.name || '').toString().trim();
    if (!crew) return res.status(400).json({ message: 'Crew name is required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    if (!config.availableCrews.includes(crew)) {
      config.availableCrews.push(crew);
      await config.save();
    }
    res.json(config.availableCrews);
  } catch (err) {
    res.status(500).json({ message: 'Error adding crew', error: err.message });
  }
};

exports.removeCrew = async (req, res) => {
  try {
    const { crew } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableCrews = config.availableCrews.filter(c => c !== crew);
    await config.save();
    res.json(config.availableCrews);
  } catch (err) {
    res.status(500).json({ message: 'Error removing crew', error: err.message });
  }
};

exports.patchCrew = async (req, res) => {
  try {
    const current = decodeURIComponent(String(req.params.crewId || ''));
    const next = (req.body?.name || '').toString().trim();
    if (!current || !next) return res.status(400).json({ message: 'Crew id and name are required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    const idx = config.availableCrews.findIndex((c) => c === current);
    if (idx >= 0) {
      config.availableCrews[idx] = next;
    } else if (!config.availableCrews.includes(next)) {
      config.availableCrews.push(next);
    }
    config.availableCrews = [...new Set(config.availableCrews.map((c) => String(c).trim()).filter(Boolean))];
    await config.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.CREW_RENAMED,
      targetType: 'crew',
      targetId: current,
      targetName: next,
      before: { name: current },
      after: { name: next },
      req,
    });
    res.json(config.availableCrews);
  } catch (err) {
    res.status(500).json({ message: 'Error updating crew', error: err.message });
  }
};

exports.addRole = async (req, res) => {
  try {
    const role = (req.body.role || req.body.name || '').toString().trim();
    if (!role) return res.status(400).json({ message: 'Role name is required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    if (!config.availableRoles.includes(role)) {
      config.availableRoles.push(role);
      await config.save();
      await logAction({
        actor: req.user,
        action: AUDIT_ACTIONS.SYSTEM_ROLE_ADDED,
        targetType: 'system_role',
        targetId: role,
        targetName: role,
        after: { role },
        req,
      });
    }
    res.json(config.availableRoles);
  } catch (err) {
    res.status(500).json({ message: 'Error adding role', error: err.message });
  }
};

exports.removeRole = async (req, res) => {
  try {
    const role = decodeURIComponent(req.params.role);
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.availableRoles = config.availableRoles.filter(r => r !== role);
    await config.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SYSTEM_ROLE_DELETED,
      targetType: 'system_role',
      targetId: role,
      targetName: role,
      before: { role },
      req,
    });
    res.json(config.availableRoles);
  } catch (err) {
    res.status(500).json({ message: 'Error removing role', error: err.message });
  }
};

exports.patchRole = async (req, res) => {
  try {
    const current = decodeURIComponent(String(req.params.roleId || ''));
    const next = (req.body?.name || '').toString().trim();
    if (!current || !next) return res.status(400).json({ message: 'Role id and name are required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    const idx = config.availableRoles.findIndex((r) => r === current);
    if (idx >= 0) {
      config.availableRoles[idx] = next;
    } else if (!config.availableRoles.includes(next)) {
      config.availableRoles.push(next);
    }
    config.availableRoles = [...new Set(config.availableRoles.map((r) => String(r).trim()).filter(Boolean))];
    await config.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.SYSTEM_ROLE_RENAMED,
      targetType: 'system_role',
      targetId: current,
      targetName: next,
      before: { role: current },
      after: { role: next },
      req,
    });
    res.json(config.availableRoles);
  } catch (err) {
    res.status(500).json({ message: 'Error updating role', error: err.message });
  }
};

// ─── User Management ─────────────────────────────────────────────────────────

exports.getPendingUsers = async (req, res) => {
  try {
    const users = await AdminUser.find({ isApproved: false }).select('-passwordHash');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching pending users', error: err.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { filterProtectedAccounts } = require('../utils/protectedAccounts');
    const users = await AdminUser.find().select('-passwordHash');
    res.json(filterProtectedAccounts(users));
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users', error: err.message });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { crew, role, empId, color } = req.body;

    const updates = { isApproved: true };
    if (crew)  updates.crew  = crew;
    if (role)  updates.role  = role;
    if (empId) updates.empId = String(empId).trim();
    if (color) updates.color = color;

    const user = await AdminUser.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const actor = await AdminUser.findById(req.user.id).select('-passwordHash');
    await logRosterEvent({
      action: 'USER_APPROVED',
      actor,
      target: user,
      summary: `Approved ${user.name} (${user.email}) — empId ${user.empId}, crew ${user.crew}`,
      metadata: { crew: user.crew, role: user.role, empId: user.empId },
    });

    res.json({ message: 'User approved.', user });
  } catch (err) {
    res.status(500).json({ message: 'Error approving user', error: err.message });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isProtectedAccountEmail } = require('../utils/protectedAccounts');
    const user = await AdminUser.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (isProtectedAccountEmail(user.email)) {
      return res.status(403).json({ message: 'This system account cannot be deleted.' });
    }
    await AdminUser.findByIdAndDelete(id);

    const actor = await AdminUser.findById(req.user.id).select('-passwordHash');
    await logRosterEvent({
      action: 'USER_REJECTED',
      actor,
      target: user,
      summary: `Rejected registration for ${user.email}`,
    });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.ADMIN_REMOVED,
      targetType: 'admin_user',
      targetId: user._id?.toString(),
      targetName: user.name,
      before: { email: user.email, accessRole: user.accessRole },
      req,
    });

    res.json({ message: 'User rejected and removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Error rejecting user', error: err.message });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { isSuperAdmin } = require('../middleware/superAdmin');
    const { id } = req.params;
    const { accessRole, canOpsLead } = req.body;
    const patch = {};
    if (accessRole !== undefined) {
      if (!['admin', 'viewer', 'management'].includes(accessRole)) {
        return res.status(400).json({ message: 'accessRole must be admin, viewer, or management.' });
      }
      patch.accessRole = accessRole;
    }
    if (canOpsLead !== undefined) patch.canOpsLead = Boolean(canOpsLead);
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'accessRole or canOpsLead required.' });
    }

    const target = await AdminUser.findById(id);
    if (!target) return res.status(404).json({ message: 'User not found.' });

    if (patch.accessRole) {
      const promotingToAdmin = patch.accessRole === 'admin' && target.accessRole !== 'admin';
      const demotingAdmin = target.accessRole === 'admin' && patch.accessRole !== 'admin';
      if ((promotingToAdmin || demotingAdmin) && !isSuperAdmin(req)) {
        return res.status(403).json({
          message: 'Only admin@acwaops.com may grant or revoke administrator access.',
        });
      }
    }

    const user = await AdminUser.findByIdAndUpdate(id, patch, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const actor = await AdminUser.findById(req.user.id).select('-passwordHash');
    const parts = [];
    if (patch.accessRole) parts.push(`access ${patch.accessRole}`);
    if (patch.canOpsLead !== undefined) parts.push(`ops lead ${patch.canOpsLead ? 'on' : 'off'}`);
    await logRosterEvent({
      action: 'USER_ROLE_CHANGED',
      actor,
      target: user,
      summary: `Portal access for ${user.name} (${user.empId}): ${parts.join(', ')}`,
      metadata: patch,
    });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.ROLE_CHANGED,
      targetType: 'employee',
      targetId: user._id?.toString(),
      targetName: user.name,
      before: { accessRole: target.accessRole, canOpsLead: target.canOpsLead },
      after: { accessRole: user.accessRole, canOpsLead: user.canOpsLead },
      req,
    });

    const body = { message: 'User role updated.', user };
    const actorId = String(req.user?.userId || req.user?.id || '');
    if (actorId && String(user._id) === actorId) {
      const jwt = require('jsonwebtoken');
      const { buildJwtPayload, JWT_EXPIRES_IN } = require('../utils/jwtAuth');
      body.token = jwt.sign(buildJwtPayload(user), process.env.JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });
    }
    res.json(body);
  } catch (err) {
    res.status(500).json({ message: 'Error updating user role', error: err.message });
  }
};

exports.clearPlaceholderEmails = async (req, res) => {
  try {
    const { isSuperAdmin } = require('../middleware/superAdmin');
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only admin@acwaops.com may clear placeholder emails.' });
    }
    const users = await AdminUser.find({ email: { $exists: true, $ne: '' } });
    let updated = 0;
    let unchanged = 0;
    for (const u of users) {
      if (!isPlaceholderEmail(u.email)) {
        unchanged += 1;
        continue;
      }
      const { updated: didUpdate, email } = syncPlaceholderEmailForUser(u);
      if (didUpdate && email) {
        u.email = email;
        await u.save();
        updated += 1;
      } else {
        unchanged += 1;
      }
    }
    res.json({
      message: `Synced ${updated} placeholder email(s) from personnel roster.`,
      updated,
      unchanged,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error syncing placeholder emails', error: err.message });
  }
};

// ─── Curriculum CRUD ─────────────────────────────────────────────────────────

exports.getCurriculum = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) { config = new AdminConfig(); await config.save(); }
    res.json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching curriculum', error: err.message });
  }
};

exports.addCurriculumItem = async (req, res) => {
  try {
    const { category, title, description, link, duration } = req.body;
    if (!category || !title) return res.status(400).json({ message: 'Category and title are required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    config.curriculum.push({ category, title, description, link, duration });
    await config.save();
    res.status(201).json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error adding curriculum item', error: err.message });
  }
};

exports.updateCurriculumItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, title, description, link, duration } = req.body;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const item = config.curriculum.id(id);
    if (!item) return res.status(404).json({ message: 'Curriculum item not found.' });
    if (category    !== undefined) item.category    = category;
    if (title       !== undefined) item.title       = title;
    if (description !== undefined) item.description = description;
    if (link        !== undefined) item.link        = link;
    if (duration    !== undefined) item.duration    = duration;
    await config.save();
    res.json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error updating curriculum item', error: err.message });
  }
};

exports.deleteCurriculumItem = async (req, res) => {
  try {
    const { id } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    config.curriculum = config.curriculum.filter(item => item._id.toString() !== id);
    await config.save();
    res.json(config.curriculum);
  } catch (err) {
    res.status(500).json({ message: 'Error deleting curriculum item', error: err.message });
  }
};

// ─── PTW Personnel CRUD (flexible body) ──────────────────────────────────────

exports.getPtwPersonnel = async (req, res) => {
  try {
    let config = await AdminConfig.findOne();
    if (!config) { config = new AdminConfig(); await config.save(); }
    if (!config.ptwPersonnel?.length) {
      try {
        const { ensurePtwPersonnelSeeded } = require('../services/ptwAutoSeed');
        await ensurePtwPersonnelSeeded();
        config = await AdminConfig.findOne();
      } catch (seedErr) {
        console.warn('[ptw] auto-seed on GET failed:', seedErr.message);
      }
    }
    res.json(config?.ptwPersonnel || []);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching PTW personnel', error: err.message });
  }
};

exports.seedPtwAuthorization = async (req, res) => {
  try {
    const { ensurePtwPersonnelSeeded } = require('../services/ptwAutoSeed');
    const result = await ensurePtwPersonnelSeeded({ force: req.body?.force === true });
    res.json({
      message: result.seeded
        ? `PTW list loaded with ${result.count} entries`
        : `PTW list unchanged (${result.count} entries)`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ message: 'PTW seed failed', error: err.message });
  }
};

async function ptwActor(req) {
  if (!req.user?.id) return { email: req.user?.email, name: req.user?.name };
  const u = await AdminUser.findById(req.user.id).select('name email').lean();
  return u || { email: req.user?.email, name: req.user?.name };
}

exports.addPtwPersonnel = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ message: 'Name is required.' });
    let config = await AdminConfig.findOne();
    if (!config) config = new AdminConfig();
    config.ptwPersonnel.push(body);
    await config.save();
    const added = config.ptwPersonnel[config.ptwPersonnel.length - 1];
    const actor = await ptwActor(req);
    await logPtwEvent({
      action: 'PTW_PERSON_ADDED',
      actor,
      target: added,
      summary: `Added ${body.name} to PTW authorization list`,
      metadata: { person: body },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.PTW_AUTH_PERSON_ADDED,
      targetType: 'ptw_auth_person',
      targetId: added?._id?.toString(),
      targetName: added?.name,
      after: added,
      req,
    });
    res.status(201).json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error adding PTW personnel', error: err.message });
  }
};

exports.updatePtwPersonnel = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const person = config.ptwPersonnel.id(id);
    if (!person) return res.status(404).json({ message: 'PTW personnel not found.' });
    const before = person.toObject ? person.toObject() : { ...person };
    Object.assign(person, updates);
    await config.save();
    const actor = await ptwActor(req);
    await logPtwEvent({
      action: 'PTW_PERSON_UPDATED',
      actor,
      target: person,
      summary: `Updated PTW authorization for ${person.name}`,
      metadata: { before, after: updates },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.PTW_AUTH_PERSON_UPDATED,
      targetType: 'ptw_auth_person',
      targetId: person?._id?.toString(),
      targetName: person?.name,
      before,
      after: person.toObject ? person.toObject() : person,
      req,
    });
    res.json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error updating PTW personnel', error: err.message });
  }
};

exports.deletePtwPersonnel = async (req, res) => {
  try {
    const { id } = req.params;
    let config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const removed = config.ptwPersonnel.find((p) => p._id.toString() === id);
    config.ptwPersonnel = config.ptwPersonnel.filter(p => p._id.toString() !== id);
    await config.save();
    const actor = await ptwActor(req);
    await logPtwEvent({
      action: 'PTW_PERSON_REMOVED',
      actor,
      target: removed,
      summary: `Removed ${removed?.name || 'person'} from PTW authorization list`,
      metadata: { removed },
    });
    await logAction({
      actor,
      action: AUDIT_ACTIONS.PTW_AUTH_PERSON_DELETED,
      targetType: 'ptw_auth_person',
      targetId: removed?._id?.toString(),
      targetName: removed?.name,
      before: removed,
      req,
    });
    res.json(config.ptwPersonnel);
  } catch (err) {
    res.status(500).json({ message: 'Error deleting PTW personnel', error: err.message });
  }
};

exports.getPtwAuditLog = async (req, res) => {
  const { isSuperAdmin } = require('../middleware/superAdmin');
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: 'Only the designated super administrator may view audit logs.' });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const rows = await PtwAuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching PTW audit log', error: err.message });
  }
};
