const ShiftReportAuditLog = require('../models/ShiftReportAuditLog');

async function logShiftReportEvent({
  action,
  actor = null,
  target = null,
  shiftReportId = null,
  summary,
  metadata = {},
}) {
  try {
    await ShiftReportAuditLog.create({
      action,
      shiftReportId,
      actorId: actor?._id || actor?.id || null,
      actorEmail: actor?.email || '',
      actorName: actor?.name || actor?.email || 'System',
      targetEmpId: target?.empId || metadata?.empId || '',
      targetName: target?.name || metadata?.employeeName || '',
      summary,
      metadata,
    });
  } catch (err) {
    console.error('Shift report audit log failed:', err.message);
  }
}

module.exports = { logShiftReportEvent };
