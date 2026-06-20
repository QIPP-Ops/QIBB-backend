/** Role helpers for org-layout parent validation (mirrors frontend personnelOrg). */

function roleRank(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('shift in charge') || /\bsic\b/.test(r)) return 1;
  if (r.includes('supervisor') && !r.includes('shift in charge') && !/\bsic\b/.test(r)) return 2;
  if (r.includes('ccr') && !r.includes('local')) return 3;
  return 50;
}

function isSicRole(role) {
  return roleRank(role) === 1;
}

function isSupervisorRole(role) {
  return roleRank(role) === 2;
}

function isCcrRole(role) {
  return roleRank(role) === 3;
}

function isOperationsLeadRole(role) {
  return isSicRole(role) || isSupervisorRole(role);
}

function isGdpEngineerRole(role) {
  return String(role || '').toLowerCase().includes('gdp');
}

function isLocalOperatorRole(role) {
  const r = String(role || '').toLowerCase();
  return r.includes('local operator') || (r.includes('local') && r.includes('operator'));
}

function isChemistRole(role) {
  const r = String(role || '').toLowerCase();
  return (r.includes('chemist') || r.includes('chemistry')) && !(r.includes('chief') && r.includes('chemist'));
}

function isLabChemistRole(role) {
  const r = String(role || '').toLowerCase();
  return isChemistRole(role) || (r.includes('chief') && r.includes('chemist'));
}

function sortName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function findCcrParentLead(members) {
  const supervisors = members.filter((e) => isSupervisorRole(e.role)).sort(sortName);
  if (supervisors.length) return supervisors[0];
  const sics = members.filter((e) => isSicRole(e.role)).sort(sortName);
  return sics[0] || null;
}

function isValidCrewOpsLayout(memberById, nodes) {
  const members = [...memberById.values()];
  const ccrLead = findCcrParentLead(members);
  const ccrLeadId = ccrLead ? String(ccrLead.empId || '').trim() : '';

  for (const node of nodes) {
    const id = String(node.empId || '').trim();
    const emp = id ? memberById.get(id) : null;
    if (!emp || !isCcrRole(emp.role)) continue;
    const parentId = String(node.parentEmpId || '').trim();
    const parent = parentId ? memberById.get(parentId) : null;
    if (!parent || !isOperationsLeadRole(parent.role)) return false;
    if (ccrLeadId && parentId !== ccrLeadId) return false;
  }
  return true;
}

/** Re-parent CCRs from GDP/field/local/chemist/CCR to SIC/Supervisor. */
function repairCrewOpsLayoutNodes(memberById, nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return nodes;

  const members = [...memberById.values()];
  const ccrLead = findCcrParentLead(members);
  const ccrLeadId = ccrLead ? String(ccrLead.empId || '').trim() : '';
  const sic = members.filter((e) => isSicRole(e.role)).sort(sortName)[0] || null;
  const sicId = sic ? String(sic.empId || '').trim() : '';
  const opsLeadId = ccrLeadId || sicId;

  return nodes.map((node) => {
    const id = String(node.empId || '').trim();
    const emp = id ? memberById.get(id) : null;
    if (!emp) return node;

    const role = emp.role || '';
    const parentEmpId = String(node.parentEmpId || '').trim();

    if (isCcrRole(role)) {
      const parent = parentEmpId ? memberById.get(parentEmpId) : null;
      if (!parent || !isOperationsLeadRole(parent.role) || (ccrLeadId && parentEmpId !== ccrLeadId)) {
        return { ...node, parentEmpId: ccrLeadId };
      }
      return node;
    }

    if (isGdpEngineerRole(role) || isLabChemistRole(role)) {
      const parent = parentEmpId ? memberById.get(parentEmpId) : null;
      const parentRole = parent?.role || '';
      if (
        parent &&
        (isCcrRole(parentRole) ||
          isLocalOperatorRole(parentRole) ||
          isGdpEngineerRole(parentRole) ||
          isChemistRole(parentRole))
      ) {
        return { ...node, parentEmpId: opsLeadId };
      }
    }

    return node;
  });
}

function nodesParentLinksEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const byId = new Map(b.map((n) => [String(n.empId || ''), String(n.parentEmpId || '')]));
  return a.every((node) => {
    const id = String(node.empId || '');
    return byId.has(id) && byId.get(id) === String(node.parentEmpId || '');
  });
}

function resolveCrewOpsLayoutNodes(memberById, nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return nodes;
  const repaired = repairCrewOpsLayoutNodes(memberById, nodes);
  return isValidCrewOpsLayout(memberById, repaired) ? repaired : nodes;
}

module.exports = {
  repairCrewOpsLayoutNodes,
  resolveCrewOpsLayoutNodes,
  nodesParentLinksEqual,
};
