const { sendOverdueCourseReminders } = require('../services/courseReminderService');

/** 07:00 AST = 04:00 UTC */
const CRON_UTC = '0 4 * * *';

let started = false;
let lastRunKey = '';

function parseCronMinuteHour(cronExpr) {
  const parts = String(cronExpr).trim().split(/\s+/);
  if (parts.length < 2) return null;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  if (Number.isNaN(minute) || Number.isNaN(hour)) return null;
  return { minute, hour };
}

function startCourseReminderCron(cronExpr = CRON_UTC) {
  if (started) return;
  started = true;

  const schedule = parseCronMinuteHour(cronExpr);
  if (!schedule) {
    console.error('[course-reminder] invalid cron expression:', cronExpr);
    return;
  }

  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() !== schedule.hour || now.getUTCMinutes() !== schedule.minute) return;
    const runKey = now.toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      const result = await sendOverdueCourseReminders({ now });
      console.log(
        `[course-reminder] overdue check: sent=${result.sent} skipped=${result.skipped} checked=${result.checked}`
      );
    } catch (err) {
      console.error('[course-reminder] failed:', err.message);
    }
  };

  setInterval(tick, 60 * 1000);
  console.log(`[course-reminder] scheduler registered (${cronExpr} UTC)`);
}

module.exports = {
  CRON_UTC,
  startCourseReminderCron,
};
