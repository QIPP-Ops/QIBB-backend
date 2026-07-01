const { normCrew, isGeneralCrew } = require('../utils/rosterRowSort');
const {
  STAFFING_RULES,
  pad,
  crewsMatch,
  fmtDate,
  parseDateOnly,
  leaveOnDate,
  approvedLeavesOnly,
  employeeOnApprovedLeave,
  employeeOnAnyLeave,
} = require('../utils/staffingRulesShared');
const {
  buildGroupBreakdown,
  formatStaffingConflictMessage,
} = require('../utils/staffingConflictDetail');

function normalizedCrewKeys(employees, isGeneralCrewFn) {
  return [
    ...new Set(
      (employees || [])
        .map((e) => normCrew(e.crew))
        .filter((c) => c && c !== 'General' && c !== 'S' && !isGeneralCrewFn(c))
    ),
  ];
}

/**
 * Simulate in-crew auto delegation: spare on-duty crew members whose role can cover
 * an absent person per rolesMatchForCover (e.g. CCR Operator covering Shift in Charge).
 * Cover people already counted in the rule's direct headcount are excluded.
 */
function computeInCrewAutoCoverBoost(
  employees,
  crew,
  dateStr,
  rule,
  shortfallNeeded,
  actingAssignments,
  onLeave
) {
  if (shortfallNeeded <= 0) return 0;

  const { rolesMatchForCover } = require('../utils/roleCoverMatch');
  const { approvedAssignmentsForRange, assignmentActiveOnDate } = require('./actingCoverService');

  const crewMembers = employees.filter((e) => crewsMatch(e.crew, crew));
  const absentInRule = crewMembers.filter((e) => onLeave(e, dateStr) && rule.match(e.role));
  if (!absentInRule.length) return 0;

  const approved = approvedAssignmentsForRange(actingAssignments, dateStr, dateStr);
  const usedCoverIds = new Set();
  for (const a of approved) {
    if (!crewsMatch(a.crew, crew)) continue;
    if (assignmentActiveOnDate(a, dateStr)) {
      usedCoverIds.add(a.coverEmpId);
    }
  }

  const availableCovers = crewMembers.filter(
    (e) => !onLeave(e, dateStr) && !usedCoverIds.has(e.empId) && !rule.match(e.role)
  );

  let boost = 0;
  const autoUsed = new Set();

  for (const absentEmp of absentInRule) {
    if (boost >= shortfallNeeded) break;
    const cover = availableCovers.find(
      (c) =>
        !autoUsed.has(c.empId) &&
        rolesMatchForCover(absentEmp.role, c.role)
    );
    if (cover) {
      boost += 1;
      autoUsed.add(cover.empId);
    }
  }

  return Math.min(boost, shortfallNeeded);
}

function staffingCountsForDate(employees, crew, dateStr, actingAssignments = [], options = {}) {
  if (isGeneralCrew(crew)) return [];

  const { actingCoverCountForRole, approvedAssignmentsForRange } = require('./actingCoverService');
  const { approvedLeaveOnly = false } = options;
  const onLeave = approvedLeaveOnly ? employeeOnApprovedLeave : employeeOnAnyLeave;
  const approved = approvedAssignmentsForRange(actingAssignments, dateStr, dateStr);

  const counts = STAFFING_RULES.map((rule) => {
    const roster = employees.filter((e) => crewsMatch(e.crew, crew) && rule.match(e.role));
    const available = roster.filter((e) => !onLeave(e, dateStr));
    const actingBoost = actingCoverCountForRole(
      employees,
      approved,
      crew,
      dateStr,
      null,
      rule.match
    );
    let totalAvailable = available.length + actingBoost;
    const shortfallBeforeAuto = Math.max(0, rule.min - totalAvailable);
    const autoCoverBoost = computeInCrewAutoCoverBoost(
      employees,
      crew,
      dateStr,
      rule,
      shortfallBeforeAuto,
      actingAssignments,
      onLeave
    );
    totalAvailable += autoCoverBoost;
    return {
      label: rule.label,
      min: rule.min,
      available: totalAvailable,
      rosterSize: roster.length,
      actingCover: actingBoost,
      autoCover: autoCoverBoost,
      shortfall: Math.max(0, rule.min - totalAvailable),
    };
  });

  return counts.filter((c) => c.rosterSize > 0);
}

/** True when available headcount is strictly below the role minimum (at minimum is OK). */
function isBelowMinimum(count) {
  return (count?.shortfall ?? 0) > 0;
}

function hasStaffingShortfall(counts) {
  return (counts || []).some(isBelowMinimum);
}

/** Available headcount for one staffing rule bucket (approved leave excluded by default). */
function countAvailableOnDuty(
  employees,
  crew,
  dateStr,
  ruleLabel,
  actingAssignments = [],
  options = {}
) {
  const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, options);
  const row = counts.find((c) => c.label === ruleLabel);
  return row?.available ?? 0;
}

function shortfallRuleMatchers(below) {
  return (below || [])
    .map((b) => STAFFING_RULES.find((r) => r.label === b.label))
    .filter(Boolean)
    .map((r) => r.match);
}

function employeeInShortfallRole(employee, below) {
  const matchers = shortfallRuleMatchers(below);
  if (!matchers.length) return false;
  return matchers.some((match) => match(employee.role));
}

function calendarDatesInclusive(start, end) {
  const dates = [];
  const cur = parseDateOnly(start);
  const last = parseDateOnly(end);
  while (cur <= last) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Role-based understaffing conflicts for working days in a schedule range.
 */
function buildStaffingShortfallConflicts(employees, options = {}) {
  const {
    dates = [],
    baseDate = '2026-01-01',
    actingAssignments = [],
    approvedLeaveOnly = true,
    getShiftForDate,
    isGeneralCrew,
  } = options;

  if (!getShiftForDate || !isGeneralCrew) return [];

  const crewsToCheck = normalizedCrewKeys(employees, isGeneralCrew);

  const conflicts = [];
  for (const dateStr of dates) {
    for (const crew of crewsToCheck) {
      const shift = getShiftForDate(crew, dateStr, baseDate);
      if (shift === 'O') continue;

      const counts = staffingCountsForDate(employees, crew, dateStr, actingAssignments, {
        approvedLeaveOnly,
      });
      const below = counts.filter(isBelowMinimum);
      if (!below.length) continue;

      const onLeavePeople = employees
        .filter((e) => crewsMatch(e.crew, crew))
        .filter((e) =>
          approvedLeaveOnly ? employeeOnApprovedLeave(e, dateStr) : employeeOnAnyLeave(e, dateStr)
        )
        .filter((e) => employeeInShortfallRole(e, below))
        .map((e) => ({
          empId: e.empId,
          name: e.name,
          role: e.role,
          crew: normCrew(e.crew),
          groupLabel: String(e.opsGroupLabel || e.group || '').trim() || 'Unassigned',
          color: e.color || e.seniority || 'crew-grey',
        }));

      const groups = buildGroupBreakdown(employees, crew, dateStr, below, {
        approvedLeaveOnly,
      });
      const groupLabels = groups.map((g) => g.groupLabel);

      conflicts.push({
        date: dateStr,
        crew,
        shift,
        severity: 'high',
        conflictType: 'staffing',
        message: formatStaffingConflictMessage({
          crew,
          shift,
          dateLabel: dateStr,
          below,
          groups,
        }),
        employees: onLeavePeople,
        below,
        groups,
        groupLabels,
      });
    }
  }

  return conflicts;
}

module.exports = {
  STAFFING_RULES,
  approvedLeavesOnly,
  employeeOnApprovedLeave,
  employeeOnAnyLeave,
  crewsMatch,
  normalizedCrewKeys,
  computeInCrewAutoCoverBoost,
  staffingCountsForDate,
  countAvailableOnDuty,
  isBelowMinimum,
  hasStaffingShortfall,
  employeeInShortfallRole,
  calendarDatesInclusive,
  buildStaffingShortfallConflicts,
  fmtDate,
  parseDateOnly,
  leaveOnDate,
};
