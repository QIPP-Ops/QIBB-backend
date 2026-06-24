const AdminUser = require('../models/AdminUser');
const AttendanceRecord = require('../models/AttendanceRecord');
const LeaveBalanceLog = require('../models/LeaveBalanceLog');
const AdminConfig = require('../models/AdminConfig');
const ShiftOverride = require('../models/ShiftOverride');
const {
  buildRosterSchedule,
  overrideMapFromDocs,
  filterActiveConflicts,
} = require('../services/shiftScheduleService');
const { filterProtectedAccounts } = require('../utils/protectedAccounts');
const { sortRosterEmployees } = require('../utils/rosterRowSort');
const { daysBetweenInclusive } = require('../services/leaveAccrualService');
const { getAllCrewKpis } = require('../services/kpiService');
const { filterConflictsByDelegations } = require('../services/actingCoverService');
const ActingAssignment = require('../models/ActingAssignment');

function fmtDateOnly(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function parseDateOnly(str) {
  if (!str) return null;
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultDateRange() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 30);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  end.setUTCDate(end.getUTCDate() + 60);
  return { start, end };
}

function leaveOverlapsRange(leave, from, to) {
  const ls = new Date(leave.start);
  const le = new Date(leave.end);
  if (Number.isNaN(ls.getTime()) || Number.isNaN(le.getTime())) return false;
  return ls <= to && le >= from;
}

function workingDaysDeducted(leave, logByLeaveId) {
  const leaveId = leave._id?.toString?.() || '';
  const logs = logByLeaveId.get(leaveId) || [];
  const deducted = logs
    .filter((l) => l.changeType === 'deduct')
    .reduce((sum, l) => sum + Math.abs(Number(l.delta) || 0), 0);
  if (deducted > 0) return deducted;
  if (leave.workingDays != null) return leave.workingDays;
  return '';
}

function totalCalendarDays(leave) {
  if (leave.totalDays != null) return leave.totalDays;
  return daysBetweenInclusive(leave.start, leave.end);
}

async function loadOverrideMap(start, end) {
  const startStr = fmtDateOnly(start);
  const endStr = fmtDateOnly(end);
  const docs = await ShiftOverride.find({
    date: { $gte: startStr, $lte: endStr },
  }).lean();
  return overrideMapFromDocs(docs);
}

async function loadActingForRange(start, end) {
  const startStr = fmtDateOnly(start);
  const endStr = fmtDateOnly(end);
  return ActingAssignment.find({
    startDate: { $lte: endStr },
    endDate: { $gte: startStr },
  }).lean();
}

function coverageKey(date, crew) {
  return `${date}|${crew}`;
}

/** GET /api/reports/leave-summary */
exports.getLeaveSummary = async (req, res) => {
  try {
    const from = parseDateOnly(req.query.from) || defaultDateRange().start;
    const to = parseDateOnly(req.query.to) || defaultDateRange().end;
    const crewFilter = String(req.query.crew || '').trim();
    const leaveTypeFilter = String(req.query.leaveType || '').trim();
    const statusFilter = String(req.query.status || '').trim().toLowerCase();

    const users = await AdminUser.find({ 'leaves.0': { $exists: true } })
      .select('empId name crew role leaves createdAt')
      .lean();

    const empIds = users.map((u) => u.empId);
    const balanceLogs = await LeaveBalanceLog.find({
      empId: { $in: empIds },
      changeType: { $in: ['deduct', 'restore'] },
      createdAt: { $gte: from, $lte: to },
    }).lean();

    const logByLeaveId = new Map();
    for (const log of balanceLogs) {
      if (!log.leaveId) continue;
      if (!logByLeaveId.has(log.leaveId)) logByLeaveId.set(log.leaveId, []);
      logByLeaveId.get(log.leaveId).push(log);
    }

    const rows = [];
    for (const user of users) {
      if (crewFilter && user.crew !== crewFilter) continue;
      for (const leave of user.leaves || []) {
        if (!leaveOverlapsRange(leave, from, to)) continue;
        const status = (leave.status || 'approved').toLowerCase();
        if (leaveTypeFilter && leave.type !== leaveTypeFilter) continue;
        if (statusFilter && status !== statusFilter) continue;

        rows.push({
          'Employee ID': user.empId,
          Name: user.name,
          Crew: user.crew,
          Role: user.role,
          'Leave Type': leave.type || '',
          Start: fmtDateOnly(leave.start),
          End: fmtDateOnly(leave.end),
          'Working Days Deducted': workingDaysDeducted(leave, logByLeaveId),
          'Total Calendar Days': totalCalendarDays(leave),
          Status: status,
          'Approved By': status === 'approved' ? '' : '',
          'Applied Date': fmtDateOnly(user.createdAt),
        });
      }
    }

    rows.sort((a, b) => {
      const d = String(b.Start).localeCompare(String(a.Start));
      if (d !== 0) return d;
      return String(a['Employee ID']).localeCompare(String(b['Employee ID']));
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/reports/attendance */
exports.getAttendanceReport = async (req, res) => {
  try {
    const from = String(req.query.from || '').slice(0, 10);
    const to = String(req.query.to || '').slice(0, 10);
    const crewFilter = String(req.query.crew || '').trim();
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const isLateFilter = req.query.isLate;

    const query = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }
    if (crewFilter) query.crew = crewFilter;
    if (statusFilter) query.status = statusFilter;
    if (isLateFilter === 'true') query.isLate = true;
    if (isLateFilter === 'false') query.isLate = false;

    const records = await AttendanceRecord.find(query).sort({ date: -1, empId: 1 }).lean();

    const rows = records.map((r) => ({
      'Employee ID': r.empId,
      Name: r.employeeName || '',
      Crew: r.crew || '',
      Date: r.date,
      Status: r.status,
      'Is Late': r.isLate ? 'Yes' : 'No',
      'Late Minutes': r.lateMinutes ?? 0,
      'Left Early': r.isLeftEarly ? 'Yes' : 'No',
      'Left Early Minutes': r.leftEarlyMinutes ?? 0,
      Remarks: r.remarks || '',
      'Logged By': r.loggedBy || r.loggedByEmail || '',
      'Logged At': r.loggedAt ? new Date(r.loggedAt).toISOString() : '',
      'Derived From Leave': r.derivedFromLeave ? 'Yes' : 'No',
    }));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/reports/balance-snapshot */
exports.getBalanceSnapshot = async (req, res) => {
  try {
    const crewFilter = String(req.query.crew || '').trim();
    const roleFilter = String(req.query.role || '').trim();

    const query = { isApproved: true };
    if (crewFilter) query.crew = crewFilter;
    if (roleFilter) query.role = roleFilter;

    const users = await AdminUser.find(query)
      .select('empId name crew role compensateDayBalance annualLeaveBalance bankLeaveBalance annualLeaveAccrualRate')
      .sort({ crew: 1, name: 1 })
      .lean();

    const rows = filterProtectedAccounts(users).map((u) => ({
      'Employee ID': u.empId,
      Name: u.name,
      Crew: u.crew,
      Role: u.role,
      'Annual Leave Balance': u.annualLeaveBalance ?? 0,
      'Bank Leave Balance': u.bankLeaveBalance ?? 0,
      'Compensate Off Balance': u.compensateDayBalance ?? 0,
      'Annual Accrual Rate': u.annualLeaveAccrualRate ?? 0,
    }));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/reports/staffing-conflicts */
exports.getStaffingConflicts = async (req, res) => {
  try {
    const range = defaultDateRange();
    const from = parseDateOnly(req.query.from) || range.start;
    const to = parseDateOnly(req.query.to) || range.end;
    const crewFilter = String(req.query.crew || '').trim();
    const conflictTypeFilter = String(req.query.conflictType || '').trim().toLowerCase();
    const hasCoverFilter = req.query.hasCover;

    const config = await AdminConfig.findOne().lean();
    const allEmployees = filterProtectedAccounts(
      await AdminUser.find({ hiddenFromLeaveTimesheet: { $ne: true } })
        .select('-passwordHash')
        .lean()
    );
    const employees = sortRosterEmployees(allEmployees);
    const overrideMap = await loadOverrideMap(from, to);
    const actingAssignments = await loadActingForRange(from, to);
    const schedule = buildRosterSchedule(employees, {
      startDate: from,
      endDate: to,
      baseDate: config?.shiftCycleBaseDate || '2026-01-01',
      overrideMap,
      actingAssignments,
    });

    let conflicts = filterActiveConflicts(
      filterConflictsByDelegations(schedule.conflicts, actingAssignments, employees)
    );

    const coverByKey = new Map();
    for (const cov of schedule.coverage || []) {
      coverByKey.set(coverageKey(cov.date, cov.crew), cov);
    }

    let rows = conflicts.map((c) => {
      const primaryCrew = String(c.crew || '').split('/')[0] || c.crew;
      const cover = coverByKey.get(coverageKey(c.date, primaryCrew));
      const hasCover = Boolean(cover?.suggestedBackups?.length);
      return {
        Date: c.date,
        Crew: c.crew,
        Severity: c.severity,
        'Conflict Type': 'Staffing shortfall',
        'Shortfall Roles': (c.below || []).map((b) => b.label).join(', '),
        Message: c.message,
        Employees: (c.employees || []).map((e) => e.name).join(', '),
        'Has Cover': hasCover ? 'Yes' : 'No',
        'Suggested Backups': hasCover
          ? (cover.suggestedBackups || []).map((b) => b.name).join(', ')
          : '',
      };
    });

    if (crewFilter) {
      rows = rows.filter((r) => String(r.Crew).includes(crewFilter));
    }
    if (conflictTypeFilter) {
      rows = rows.filter(
        (r) =>
          String(r['Conflict Type']).toLowerCase().includes(conflictTypeFilter) ||
          String(r.Severity).toLowerCase() === conflictTypeFilter
      );
    }
    if (hasCoverFilter === 'true') rows = rows.filter((r) => r['Has Cover'] === 'Yes');
    if (hasCoverFilter === 'false') rows = rows.filter((r) => r['Has Cover'] === 'No');

    rows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/reports/kpi-scores */
exports.getKpiScores = async (req, res) => {
  try {
    const crewFilter = String(req.query.crew || '').trim();
    const minScore = req.query.minScore != null ? Number(req.query.minScore) : null;
    const maxScore = req.query.maxScore != null ? Number(req.query.maxScore) : null;
    const submissionStatus = String(req.query.submissionStatus || '').trim().toLowerCase();

    const { crews } = await getAllCrewKpis();
    const memberIds = new Set();
    for (const c of crews) {
      for (const m of c.members || []) memberIds.add(m.memberId);
    }

    const statusById = new Map();
    if (memberIds.size) {
      const docs = await AdminUser.find({ _id: { $in: [...memberIds] } })
        .select('_id kpis kpiSubmissionStatus')
        .lean();
      for (const d of docs) {
        statusById.set(String(d._id), d);
      }
    }

    let rows = [];
    for (const crewBlock of crews) {
      if (crewFilter && crewBlock.crewId !== crewFilter) continue;
      for (const m of crewBlock.members || []) {
        const doc = statusById.get(m.memberId);
        const goalScore = doc?.kpis?.length
          ? Math.round(
              doc.kpis.reduce((acc, k) => acc + (Number(k.progress) || 0), 0) /
                doc.kpis.filter((k) => k?.title).length
            )
          : null;
        const unifiedKPI =
          goalScore != null
            ? Math.round(m.individualKPI * 0.5 + goalScore * 0.5)
            : m.individualKPI;
        const kpiSubmissionStatus = (doc?.kpiSubmissionStatus || 'draft').toLowerCase();

        rows.push({
          'Employee ID': m.empId,
          Name: m.name,
          Crew: m.crew,
          Role: m.role,
          'Training Score': m.trainingScore,
          'PTW Score': m.ptwScore,
          'Compliance KPI': m.individualKPI,
          'Goal Score': goalScore ?? '',
          'Unified KPI': unifiedKPI,
          'Submission Status': kpiSubmissionStatus,
          'PTW Status': m.ptwStatus,
        });
      }
    }

    if (submissionStatus) {
      rows = rows.filter((r) => r['Submission Status'] === submissionStatus);
    }
    if (minScore != null && !Number.isNaN(minScore)) {
      rows = rows.filter((r) => Number(r['Unified KPI']) >= minScore);
    }
    if (maxScore != null && !Number.isNaN(maxScore)) {
      rows = rows.filter((r) => Number(r['Unified KPI']) <= maxScore);
    }

    rows.sort((a, b) => Number(b['Unified KPI']) - Number(a['Unified KPI']));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** GET /api/reports/balance-history */
exports.getBalanceHistory = async (req, res) => {
  try {
    const from = parseDateOnly(req.query.from) || defaultDateRange().start;
    const to = parseDateOnly(req.query.to) || defaultDateRange().end;
    const empIdFilter = String(req.query.empId || '').trim();
    const changeTypeFilter = String(req.query.changeType || '').trim();
    const balanceFieldFilter = String(req.query.balanceField || '').trim();

    const query = {
      createdAt: { $gte: from, $lte: to },
    };
    if (empIdFilter) query.empId = empIdFilter;
    if (changeTypeFilter) query.changeType = changeTypeFilter;
    if (balanceFieldFilter) query.balanceField = balanceFieldFilter;

    const logs = await LeaveBalanceLog.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const nameByEmpId = new Map();
    if (logs.length) {
      const users = await AdminUser.find({
        empId: { $in: [...new Set(logs.map((l) => l.empId))] },
      })
        .select('empId name crew')
        .lean();
      for (const u of users) nameByEmpId.set(u.empId, u);
    }

    const rows = logs.map((log) => {
      const user = nameByEmpId.get(log.empId);
      return {
        'Employee ID': log.empId,
        Name: user?.name || '',
        Crew: user?.crew || '',
        'Change Type': log.changeType,
        'Balance Field': log.balanceField,
        Delta: log.delta,
        'Balance Before': log.balanceBefore,
        'Balance After': log.balanceAfter,
        'Leave ID': log.leaveId || '',
        'Performed By': log.performedBy || '',
        Reason: log.reason || '',
        'Created At': log.createdAt ? new Date(log.createdAt).toISOString() : '',
      };
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
