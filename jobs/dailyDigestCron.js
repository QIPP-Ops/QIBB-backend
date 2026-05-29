const { sendDailyDigest } = require('../services/dailyDigestService');

/** 06:30 AST = 03:30 UTC — cron: 30 3 * * * */
const CRON_UTC = '30 3 * * *';

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

function startDailyDigestCron(cronExpr = CRON_UTC) {
  if (started) return;
  started = true;

  const schedule = parseCronMinuteHour(cronExpr);
  if (!schedule) {
    console.error('[daily-digest] invalid cron expression:', cronExpr);
    return;
  }

  const tick = async () => {
    const now = new Date();
    if (now.getUTCHours() !== schedule.hour || now.getUTCMinutes() !== schedule.minute) return;
    const runKey = now.toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      const result = await sendDailyDigest(now);
      console.log(
        `[daily-digest] sent at 03:30 UTC (06:30 AST): ${result.sent} recipient(s)`
      );
    } catch (err) {
      console.error('[daily-digest] failed:', err.message);
    }
  };

  setInterval(tick, 60 * 1000);
  console.log(`[daily-digest] scheduler registered (${cronExpr} UTC, 06:30 AST)`);
}

module.exports = {
  CRON_UTC,
  startDailyDigestCron,
};
