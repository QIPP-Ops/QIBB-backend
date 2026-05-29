const SystemSettings = require('../models/SystemSettings');

const SHIFT_REPORT_REMINDERS_KEY = 'shiftReportEmailReminders';

async function getSetting(key, defaultValue) {
  const row = await SystemSettings.findOne({ key }).lean();
  if (!row) return defaultValue;
  return row.value;
}

async function setSetting(key, value) {
  return SystemSettings.findOneAndUpdate(
    { key },
    { $set: { value } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

async function isShiftReportEmailRemindersEnabled() {
  const v = await getSetting(SHIFT_REPORT_REMINDERS_KEY, true);
  return v !== false;
}

async function setShiftReportEmailRemindersEnabled(enabled) {
  return setSetting(SHIFT_REPORT_REMINDERS_KEY, Boolean(enabled));
}

module.exports = {
  SHIFT_REPORT_REMINDERS_KEY,
  getSetting,
  setSetting,
  isShiftReportEmailRemindersEnabled,
  setShiftReportEmailRemindersEnabled,
};
