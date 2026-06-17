const SystemSettings = require('../models/SystemSettings');

const SHIFT_REPORT_REMINDERS_KEY = 'shiftReportEmailReminders';
const SHIFT_REPORT_REMINDERS_BY_CREW_KEY = 'shiftReportEmailRemindersByCrew';

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

/** @deprecated Legacy global flag — default off; prefer per-crew settings. */
async function isShiftReportEmailRemindersEnabled(crew) {
  if (crew) {
    return isShiftReportEmailRemindersEnabledForCrew(crew);
  }
  const v = await getSetting(SHIFT_REPORT_REMINDERS_KEY, false);
  return v === true;
}

async function setShiftReportEmailRemindersEnabled(enabled) {
  return setSetting(SHIFT_REPORT_REMINDERS_KEY, Boolean(enabled));
}

async function getShiftReportRemindersByCrewMap() {
  const v = await getSetting(SHIFT_REPORT_REMINDERS_BY_CREW_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {};
}

async function isShiftReportEmailRemindersEnabledForCrew(crew) {
  if (!crew) return false;
  const map = await getShiftReportRemindersByCrewMap();
  return map[crew] === true;
}

async function setShiftReportReminderForCrew(crew, enabled) {
  const map = await getShiftReportRemindersByCrewMap();
  map[crew] = Boolean(enabled);
  return setSetting(SHIFT_REPORT_REMINDERS_BY_CREW_KEY, map);
}

module.exports = {
  SHIFT_REPORT_REMINDERS_KEY,
  SHIFT_REPORT_REMINDERS_BY_CREW_KEY,
  getSetting,
  setSetting,
  isShiftReportEmailRemindersEnabled,
  setShiftReportEmailRemindersEnabled,
  getShiftReportRemindersByCrewMap,
  isShiftReportEmailRemindersEnabledForCrew,
  setShiftReportReminderForCrew,
};
