const {
  STAFFING_RULES,
  crewsMatch,
  employeeOnApprovedLeave,
  employeeOnAnyLeave,
} = require('./staffingRulesShared');

function groupLabelForEmployee(emp) {
  return String(emp?.opsGroupLabel || emp?.group || '').trim() || 'Unassigned';
}

function rotationShiftLabel(shift) {
  if (shift === 'D') return 'Day';
  if (shift === 'N') return 'Night';
  return shift || '';
}

function formatShortfallRolesLine(below) {
  return (below || [])
    .map((b) => `${b.label} ${b.available ?? '?'}/${b.min ?? '?'}`)
    .join(', ');
}

function formatGroupRolesLine(group) {
  return (group.roles || [])
    .map((r) => `${r.label} ${r.available}/${r.roster}`)
    .join(', ');
}

/**
 * Per-group breakdown for roles contributing to a crew-level shortfall.
 */
function buildGroupBreakdown(employees, crew, dateStr, below, options = {}) {
  const { approvedLeaveOnly = true } = options;
  const onLeave = approvedLeaveOnly ? employeeOnApprovedLeave : employeeOnAnyLeave;
  const crewMembers = (employees || []).filter((e) => crewsMatch(e.crew, crew));
  const groupMap = new Map();

  for (const emp of crewMembers) {
    const inShortfallRole = (below || []).some((b) => {
      const rule = STAFFING_RULES.find((r) => r.label === b.label);
      return rule && rule.match(emp.role);
    });
    if (!inShortfallRole) continue;

    const gl = groupLabelForEmployee(emp);
    if (!groupMap.has(gl)) {
      groupMap.set(gl, { groupLabel: gl, roles: new Map(), onLeave: [] });
    }
    const g = groupMap.get(gl);

    for (const b of below || []) {
      const rule = STAFFING_RULES.find((r) => r.label === b.label);
      if (!rule || !rule.match(emp.role)) continue;
      if (!g.roles.has(b.label)) {
        g.roles.set(b.label, { label: b.label, roster: 0, available: 0, onLeave: 0 });
      }
      const row = g.roles.get(b.label);
      row.roster += 1;
      if (onLeave(emp, dateStr)) {
        row.onLeave += 1;
        g.onLeave.push({
          empId: emp.empId,
          name: emp.name,
          role: emp.role,
          groupLabel: gl,
        });
      } else {
        row.available += 1;
      }
    }
  }

  return [...groupMap.values()]
    .map((g) => ({
      groupLabel: g.groupLabel,
      roles: [...g.roles.values()],
      onLeave: [...new Map(g.onLeave.map((e) => [e.empId, e])).values()],
    }))
    .filter((g) => g.onLeave.length > 0)
    .sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
}

function formatStaffingConflictMessage({
  crew,
  shift,
  dateLabel,
  below,
  groups,
}) {
  const shiftPart = rotationShiftLabel(shift);
  const datePart = dateLabel || '';
  const shortfalls = formatShortfallRolesLine(below);
  const groupNames = (groups || []).map((g) => g.groupLabel).join(', ');
  const header = [`Shift ${crew}`, shiftPart, datePart].filter(Boolean).join(' · ');
  const groupPart = groupNames ? ` — Groups: ${groupNames}` : '';
  return `${header}: ${shortfalls}${groupPart}`;
}

function formatStaffingNotifyMessage(alert) {
  const dateLabel = alert.dateLabel || alert.date;
  const shiftPart = alert.shift ? ` ${rotationShiftLabel(alert.shift)}` : '';
  const groups = (alert.groups || []).map((g) => g.groupLabel).join(', ');
  const roles = formatShortfallRolesLine(alert.below);
  const groupPart = groups ? ` · Groups: ${groups}` : '';
  return `Staffing below minimum — Shift ${alert.crew}${shiftPart} ${dateLabel}: ${roles}${groupPart}`;
}

function mergeGroupBreakdowns(existing, incoming) {
  const byLabel = new Map(
    (existing || []).map((g) => [
      g.groupLabel,
      {
        ...g,
        roles: (g.roles || []).map((r) => ({ ...r })),
        onLeave: [...(g.onLeave || [])],
      },
    ])
  );

  (incoming || []).forEach((g) => {
    const prev = byLabel.get(g.groupLabel);
    if (!prev) {
      byLabel.set(g.groupLabel, {
        ...g,
        roles: (g.roles || []).map((r) => ({ ...r })),
        onLeave: [...(g.onLeave || [])],
      });
      return;
    }
    const leaveById = new Map(prev.onLeave.map((e) => [e.empId, e]));
    (g.onLeave || []).forEach((e) => leaveById.set(e.empId, e));
    prev.onLeave = [...leaveById.values()];

    const rolesByLabel = new Map(prev.roles.map((r) => [r.label, { ...r }]));
    (g.roles || []).forEach((r) => {
      const p = rolesByLabel.get(r.label);
      if (!p) {
        rolesByLabel.set(r.label, { ...r });
        return;
      }
      p.onLeave = Math.max(p.onLeave, r.onLeave);
      p.available = Math.min(p.available, r.available);
      p.roster = Math.max(p.roster, r.roster);
    });
    prev.roles = [...rolesByLabel.values()];
  });

  return [...byLabel.values()].sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
}

function formatStaffingEmailHtml(alert, suggestedNames = []) {
  const dateLabel = alert.dateLabel || alert.date;
  const shiftLabel = alert.shift ? rotationShiftLabel(alert.shift) : '';
  const roleLines = (alert.below || []).map(
    (b) => `${b.label}: ${b.available} available (minimum ${b.min}, short ${b.shortfall ?? Math.max(0, (b.min ?? 0) - (b.available ?? 0))})`
  );
  const groupBlocks = (alert.groups || []).map((g) => {
    const onLeaveNames = (g.onLeave || []).map((e) => e.name).join(', ');
    const roleDetail = formatGroupRolesLine(g);
    return `<li><strong>${g.groupLabel}</strong>: ${roleDetail}${onLeaveNames ? ` — on leave: ${onLeaveNames}` : ''}</li>`;
  });
  const suggestedLine =
    suggestedNames.length > 0
      ? `<p><strong>Suggested cover:</strong> ${suggestedNames.join(', ')}</p>`
      : '';

  return `
    <p>Minimum staffing is not met after this leave request.</p>
    <table style="border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Shift</td><td>${alert.crew}</td></tr>
      ${shiftLabel ? `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Rotation</td><td>${shiftLabel}</td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Period</td><td>${dateLabel}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top;">Shortfalls</td><td>${roleLines.join('<br/>')}</td></tr>
    </table>
    ${
      groupBlocks.length
        ? `<p><strong>Groups affected</strong></p><ul style="margin:8px 0;padding-left:20px;">${groupBlocks.join('')}</ul>`
        : ''
    }
    ${suggestedLine}
    <p>Review roster coverage and consider backup assignments.</p>
  `;
}

module.exports = {
  groupLabelForEmployee,
  rotationShiftLabel,
  formatShortfallRolesLine,
  formatGroupRolesLine,
  buildGroupBreakdown,
  formatStaffingConflictMessage,
  formatStaffingNotifyMessage,
  mergeGroupBreakdowns,
  formatStaffingEmailHtml,
};
