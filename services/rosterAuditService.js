const RosterAuditLog = require('../models/RosterAuditLog');
const { notifyLeavePlannerEdit } = require('./leaveNotifyService');

async function logRosterEvent({
  action,
  actor = null,
  target = null,
  summary,
  metadata = {},
}) {
  try {
    await RosterAuditLog.create({
      action,
      actorId:    actor?._id || actor?.id || null,
      actorEmail: actor?.email || '',
      actorName:  actor?.name || actor?.email || 'System',
      targetEmpId:  target?.empId || metadata?.empId || '',
      targetName:   target?.name || '',
      targetEmail:  target?.email || metadata?.email || '',
      summary,
      metadata,
    });

    notifyLeavePlannerEdit({ action, actor, target, summary, metadata }).catch(() => {});
  } catch (err) {
    console.error('Roster audit log failed:', err.message);
  }
}

module.exports = { logRosterEvent };
