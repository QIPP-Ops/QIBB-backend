/**
 * One-time cleanup: remove in-app notifications that were wrongly sent to
 * regular users (viewer / management / legacy user role) for system-level digests.
 *
 * Affected types:
 *   - roster_lock, roster_unlock
 *   - ingest_complete
 *   - leave_conflict
 *   - shift_missing admin digest (title contains "digest" or dedupeKey shift-missing:digest:*)
 *
 * Usage:
 *   Set COSMOS_URI or MONGODB_URI, then:
 *     node scripts/cleanupMisroutedNotifications.js
 *   Dry-run (no deletes):
 *     DRY_RUN=1 node scripts/cleanupMisroutedNotifications.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const AdminUser = require('../models/AdminUser');
const {
  SYSTEM_DIGEST_NOTIFICATION_TYPES,
  isShiftReportDigestNotification,
} = require('../services/notificationService');

const uri = process.env.COSMOS_URI || process.env.MONGODB_URI;
if (!uri) {
  console.error('Set COSMOS_URI (or MONGODB_URI) before running.');
  process.exit(1);
}

const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').toLowerCase());

function isNonAdminRecipient(user) {
  if (!user) return false;
  const accessRole = String(user.accessRole || '').toLowerCase();
  if (accessRole === 'viewer' || accessRole === 'management') return true;
  const role = String(user.role || '').toLowerCase();
  return role === 'user' || role === 'viewer';
}

function isMisroutedSystemDigest(notification, recipient) {
  if (!isNonAdminRecipient(recipient)) return false;
  if (SYSTEM_DIGEST_NOTIFICATION_TYPES.includes(notification.type)) return true;
  return isShiftReportDigestNotification(notification);
}

async function run() {
  await mongoose.connect(uri, { retryWrites: false });

  const notifications = await Notification.find({
    $or: [
      { type: { $in: SYSTEM_DIGEST_NOTIFICATION_TYPES } },
      { type: 'shift_missing', title: /digest/i },
      { type: 'shift_missing', dedupeKey: /^shift-missing:digest:/ },
    ],
  })
    .select('_id type title dedupeKey recipientUserId')
    .lean();

  const recipientIds = [...new Set(notifications.map((n) => String(n.recipientUserId)))];
  const users = await AdminUser.find({ _id: { $in: recipientIds } })
    .select('_id email empId accessRole role')
    .lean();
  const userById = Object.fromEntries(users.map((u) => [String(u._id), u]));

  const toDelete = notifications.filter((n) =>
    isMisroutedSystemDigest(n, userById[String(n.recipientUserId)])
  );

  console.log(
    `[cleanup-misrouted-notifications] scanned=${notifications.length} misrouted=${toDelete.length} dryRun=${DRY_RUN}`
  );

  if (!toDelete.length) {
    await mongoose.disconnect();
    return;
  }

  const byType = {};
  for (const n of toDelete) {
    byType[n.type] = (byType[n.type] || 0) + 1;
  }
  console.log('[cleanup-misrouted-notifications] by type:', byType);

  if (!DRY_RUN) {
    const ids = toDelete.map((n) => n._id);
    const result = await Notification.deleteMany({ _id: { $in: ids } });
    console.log(`[cleanup-misrouted-notifications] deleted=${result.deletedCount}`);
  } else {
    console.log('[cleanup-misrouted-notifications] DRY_RUN — no documents deleted');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[cleanup-misrouted-notifications] failed:', err.message);
  process.exit(1);
});
