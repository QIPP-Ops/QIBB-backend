const MetricLimit = require('../models/MetricLimit');
const AdminUser = require('../models/AdminUser');
const { notifyChemistryAlarm, findSupervisorsForCrew, listAdmins } = require('./notificationService');
const { getEmployeeDutyStatus } = require('./onDutyService');

function classifyValue(value, limits) {
  if (value == null || limits == null) return null;
  const v = Number(value);
  if (Number.isNaN(v)) return null;
  if (limits.lowAlarm != null && v < limits.lowAlarm) return 'low_alarm';
  if (limits.highAlarm != null && v > limits.highAlarm) return 'high_alarm';
  if (limits.lowWarning != null && v < limits.lowWarning) return 'low_warning';
  if (limits.highWarning != null && v > limits.highWarning) return 'high_warning';
  return 'ok';
}

function breachLabel(kind) {
  const map = {
    low_alarm: 'below low alarm',
    high_alarm: 'above high alarm',
    low_warning: 'below low warning',
    high_warning: 'above high warning',
  };
  return map[kind] || kind;
}

async function evaluateMetricReading({ metricKey, label, value, reportDate }) {
  const limits = await MetricLimit.findOne({ metricKey }).lean();
  if (!limits) return null;
  const kind = classifyValue(value, limits);
  if (!kind || kind === 'ok') return null;

  const chemists = await AdminUser.find({
    approved: true,
    role: /chemist/i,
  })
    .select('_id empId name crew email')
    .lean();

  const onDutyChemists = [];
  for (const c of chemists) {
    const duty = await getEmployeeDutyStatus(c, reportDate);
    if (duty.onDuty) onDutyChemists.push(c);
  }

  const crews = [...new Set(onDutyChemists.map((c) => c.crew).filter(Boolean))];
  const supervisors = [];
  for (const crew of crews) {
    supervisors.push(...(await findSupervisorsForCrew(crew)));
  }
  const admins = await listAdmins();

  await notifyChemistryAlarm({
    chemists: onDutyChemists,
    supervisors,
    admins,
    metricLabel: label || metricKey,
    value,
    limitLabel: breachLabel(kind),
    reportDate,
  });

  return { metricKey, kind, value, limits };
}

async function listActiveBreaches(readings) {
  const keys = [...new Set(readings.map((r) => r.metricKey))];
  const limitsMap = Object.fromEntries(
    (await MetricLimit.find({ metricKey: { $in: keys } }).lean()).map((l) => [l.metricKey, l])
  );
  return readings
    .map((r) => {
      const limits = limitsMap[r.metricKey];
      const kind = classifyValue(r.value, limits);
      if (!kind || kind === 'ok') return null;
      return { ...r, kind, limits };
    })
    .filter(Boolean);
}

module.exports = {
  classifyValue,
  evaluateMetricReading,
  listActiveBreaches,
};
