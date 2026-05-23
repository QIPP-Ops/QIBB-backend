const PtwAuditLog = require('../models/PtwAuditLog');

async function logPtwEvent({ action, actor, target, summary, metadata = {} }) {
  try {
    await PtwAuditLog.create({
      action,
      actorId: actor?._id || actor?.id || null,
      actorEmail: actor?.email || '',
      actorName: actor?.name || actor?.email || 'System',
      targetPersonId: target?._id?.toString() || metadata?.personId || '',
      targetName: target?.name || '',
      summary,
      metadata,
    });
  } catch (err) {
    console.error('PTW audit log failed:', err.message);
  }
}

module.exports = { logPtwEvent };
