const { sendMonthlyLeaveSummary } = require('../services/monthlyLeaveSummaryService');

/** 07:00 AST on day 1 = 04:00 UTC — cron: 0 4 1 * * */
const CRON_UTC = '0 4 1 * *';

let started = false;
let lastRunKey = '';

function parseMonthlyCron(cronExpr) {
  const parts = String(cronExpr).trim().split(/\s+/);
  if (parts.length < 3) return null;
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  const dayOfMonth = parseInt(parts[2], 10);
  if (Number.isNaN(minute) || Number.isNaN(hour) || Number.isNaN(dayOfMonth)) return null;
  return { minute, hour, dayOfMonth };
}

function startMonthlyLeaveSummaryCron(cronExpr = CRON_UTC) {
  if (started) return;
  started = true;

  const schedule = parseMonthlyCron(cronExpr);
  if (!schedule) {
    console.error('[monthly-leave-summary] invalid cron expression:', cronExpr);
    return;
  }

  const tick = async () => {
    const now = new Date();
    if (
      now.getUTCDate() !== schedule.dayOfMonth ||
      now.getUTCHours() !== schedule.hour ||
      now.getUTCMinutes() !== schedule.minute
    ) {
      return;
    }
    const runKey = now.toISOString().slice(0, 16);
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    try {
      await sendMonthlyLeaveSummary(now);
      console.log('[monthly-leave-summary] email sent to admin@acwaops.com');
    } catch (err) {
      console.error('[monthly-leave-summary] failed:', err.message);
    }
  };

  setInterval(tick, 60 * 1000);
  console.log('[monthly-leave-summary] scheduler registered (0 4 1 * * UTC, 07:00 AST)');
}

module.exports = {
  CRON_UTC,
  startMonthlyLeaveSummaryCron,
};
