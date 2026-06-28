const AttendanceRecord = require('../models/AttendanceRecord');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Attach saved attendance to schedule cells for past dates only.
 * Privacy: call after buildRosterSchedule; filterScheduleForViewer redacts leave balances only.
 */
async function enrichScheduleWithAttendance(schedule) {
  if (!schedule?.rows?.length) return schedule;

  const today = todayStr();
  const pastDates = (schedule.dates || []).filter((d) => d < today);
  if (!pastDates.length) return schedule;

  const empIds = [...new Set(schedule.rows.map((r) => r.empId).filter(Boolean))];
  if (!empIds.length) return schedule;

  const startDate = pastDates[0];
  const endDate = pastDates[pastDates.length - 1];

  const records = await AttendanceRecord.find({
    empId: { $in: empIds },
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  const byKey = new Map(records.map((r) => [`${r.empId}|${r.date}`, r]));

  return {
    ...schedule,
    rows: schedule.rows.map((row) => ({
      ...row,
      cells: (row.cells || []).map((cell) => {
        if (!cell?.date || cell.date >= today) return cell;
        const record = byKey.get(`${row.empId}|${cell.date}`);
        if (!record) return cell;
        return {
          ...cell,
          attendance: {
            status: record.status,
            isLate: Boolean(record.isLate),
            isLeftEarly: Boolean(record.isLeftEarly),
            derivedFromLeave: Boolean(record.derivedFromLeave),
          },
        };
      }),
    })),
  };
}

module.exports = {
  enrichScheduleWithAttendance,
  todayStr,
};
