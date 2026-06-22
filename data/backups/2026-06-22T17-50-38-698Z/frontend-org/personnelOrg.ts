import type { Employee } from "@/components/calendar/roster-card-view";

const SHIFT_CYCLES: Record<string, string[]> = {
  A: ["O", "O", "O", "O", "D", "D", "N", "N"],
  B: ["D", "D", "N", "N", "O", "O", "O", "O"],
  C: ["N", "N", "O", "O", "O", "O", "D", "D"],
  D: ["O", "O", "D", "D", "N", "N", "O", "O"],
  General: ["O", "O", "O", "O", "O", "O", "O", "O"],
  S: ["O", "O", "O", "O", "O", "O", "O", "O"],
};

const BASE_DATE = "2026-01-01";
const PLANT_CREW_ORDER = ["A", "B", "C", "D"] as const;

export function normCrew(crew: string | undefined): string {
  const c = String(crew || "General").trim();
  if (!c) return "General";
  const u = c.toUpperCase();
  if (u === "GENERAL" || u === "G") return "General";
  if (/^[A-F]$/.test(u)) return u;
  if (u.startsWith("CREW")) {
    const letter = u.replace(/^CREW\s*/i, "").trim();
    if (/^[A-F]$/.test(letter)) return letter;
    if (letter === "GENERAL" || letter === "G") return "General";
  }
  return c;
}

/** Same crew filter used by builder and read-only org chart. */
export function filterEmployeesByCrew(employees: Employee[], crew: string): Employee[] {
  const target = normCrew(crew);
  return employees.filter((e) => normCrew(e.crew) === target);
}

export function getShiftForCrew(crew: string, dateStr: string): string {
  const key = normCrew(crew);
  const cycle = SHIFT_CYCLES[key] || SHIFT_CYCLES.General;
  const base = new Date(`${BASE_DATE}T12:00:00`);
  const day = new Date(`${dateStr}T12:00:00`);
  const diff = Math.floor((day.getTime() - base.getTime()) / 86400000);
  const idx = ((diff % 8) + 8) % 8;
  return cycle[idx];
}

export function crewOnDutyScore(crew: string, today = new Date().toISOString().slice(0, 10)): number {
  const shift = getShiftForCrew(crew, today);
  if (shift === "D" || shift === "N") return 2;
  return 0;
}

/** Day / Night duty label for on-duty crews */
export function crewDutyLabel(crew: string, today = new Date().toISOString().slice(0, 10)): string | null {
  const shift = getShiftForCrew(crew, today);
  if (shift === "D") return "Day";
  if (shift === "N") return "Night";
  return null;
}

export function roleRank(role: string): number {
  const r = (role || "").toLowerCase();
  if (r.includes("shift in charge") || /\bsic\b/.test(r)) return 1;
  if (r.includes("supervisor") && !r.includes("shift in charge") && !/\bsic\b/.test(r)) return 2;
  if ((r.includes("ccr") || r.includes("control room")) && !r.includes("local")) return 3;
  if (isChiefChemistRole(role)) return 4;
  if (r.includes("local operator") || (r.includes("local") && r.includes("operator"))) return 5;
  if (r.includes("gdp")) return 6;
  if (r.includes("management")) return 7;
  if (isBopRole(role)) return 8;
  return 50;
}

export function isSicRole(role: string): boolean {
  return roleRank(role) === 1;
}

export function isSupervisorRole(role: string): boolean {
  return roleRank(role) === 2;
}

export function isCcrRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  if (r.includes("local")) return false;
  if (r.includes("ccr") || r.includes("control room")) return true;
  return roleRank(role) === 3;
}

export function isLocalOperatorRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  if (r.includes("local operator") || (r.includes("local") && r.includes("operator"))) return true;
  return isFieldOperatorRole(role);
}

export function isFieldOperatorRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  return r.includes("field operator") || (/\bfield\b/.test(r) && /\boperator\b/.test(r));
}

export function isGdpEngineerRole(role: string): boolean {
  return (role || "").toLowerCase().includes("gdp");
}

/** Shift in Charge or Supervisor — the only valid parents for CCR operators. */
export function isOperationsLeadRole(role: string): boolean {
  return isSicRole(role) || isSupervisorRole(role);
}

/** Operations lead that CCR operators must report to (supervisor when present, else SIC). */
export function findCcrParentLead(members: Employee[]): Employee | null {
  const supervisors = members.filter((e) => isSupervisorRole(e.role || "")).sort(sortName);
  if (supervisors.length) return supervisors[0];
  const sics = members.filter((e) => isSicRole(e.role || "")).sort(sortName);
  return sics[0] || null;
}

export function isChiefChemistRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  return r.includes("chief") && r.includes("chemist");
}

export function isChemistRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  return (r.includes("chemist") || r.includes("chemistry")) && !isChiefChemistRole(role);
}

export function isBopRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  return /\bbop\b/.test(r) || r.includes("boiler operation") || r.includes("balance of plant");
}

export function isSideColumnRole(role: string): boolean {
  return isBopRole(role);
}

/** Chemists and chief chemists use CCR-tier cards on the technical row (not a separate side column). */
export function isLabChemistRole(role: string): boolean {
  return isChemistRole(role) || isChiefChemistRole(role);
}

/** Fixed crew switcher order (Operation Team org chart). */
export const STANDARD_CREW_TABS = ["A", "B", "C", "D", "General"] as const;
export type StandardCrewTab = (typeof STANDARD_CREW_TABS)[number];

export type OrgCardTier = "sic" | "supervisor" | "ccr" | "local" | "side" | "plant";

export function tierForEmployee(emp: Employee): OrgCardTier {
  const role = emp.role || "";
  if (isSicRole(role)) return "sic";
  if (isSupervisorRole(role)) return "supervisor";
  if (isCcrRole(role) || isChemistRole(role) || isChiefChemistRole(role)) return "ccr";
  if (isLocalOperatorRole(role)) return "local";
  if (isSideColumnRole(role) || isGdpEngineerRole(role)) return "side";
  const r = role.toLowerCase();
  if (r.includes("management")) return "plant";
  return "side";
}

export const ORG_TIER_CARD_CLASS: Record<OrgCardTier, string> = {
  sic: "ops-org-card ops-org-tier-sic",
  supervisor: "ops-org-card ops-org-tier-supervisor",
  ccr: "ops-org-card ops-org-tier-ccr",
  local: "ops-org-card ops-org-tier-local",
  side: "ops-org-card ops-org-tier-side",
  plant: "ops-org-card ops-org-tier-sic",
};

export function crewTabsForSwitcher(_employees?: Employee[]): StandardCrewTab[] {
  return [...STANDARD_CREW_TABS];
}

export function defaultCrewTab(employees: Employee[]): StandardCrewTab {
  const tabs = crewTabsForSwitcher(employees);
  const onDuty = tabs.find((tab) => crewOnDutyScore(tab) > 0);
  return onDuty || tabs[0] || "A";
}

/** Map signed-in user crew to a standard org-chart tab, when recognized. */
export function userCrewTab(userCrew?: string | null): StandardCrewTab | null {
  const normalized = normCrew(userCrew || "");
  if ((STANDARD_CREW_TABS as readonly string[]).includes(normalized)) {
    return normalized as StandardCrewTab;
  }
  return null;
}

export type VisibleCrewTabsOptions = {
  /** System super admin — all standard crew org charts. */
  viewAllCrews?: boolean;
};

/** Crew tabs on Operation Team — super admin sees all crews; others see only their crew. */
export function visibleCrewTabsForUser(
  userCrew?: string | null,
  employees?: Employee[],
  options?: VisibleCrewTabsOptions
): StandardCrewTab[] {
  if (options?.viewAllCrews) return crewTabsForSwitcher(employees);
  const own = userCrewTab(userCrew);
  if (own) return [own];
  return [defaultCrewTab(employees ?? [])];
}

/** Default org-chart crew for the signed-in user (profile crew, else on-duty fallback). */
export function defaultCrewTabForUser(
  employees: Employee[],
  userCrew?: string | null,
  options?: VisibleCrewTabsOptions
): StandardCrewTab {
  if (options?.viewAllCrews) {
    return defaultCrewTab(employees);
  }
  return visibleCrewTabsForUser(userCrew, employees, options)[0] ?? defaultCrewTab(employees);
}

export function groupSortKey(emp: { role?: string; opsGroupLabel?: string }): number {
  const label = `${emp.opsGroupLabel || ""} ${emp.role || ""}`.trim();
  const m =
    label.match(/group\s*([\d]+)\s*[-–]\s*([\d]+)/i) ||
    label.match(/([\d]+)\s*[-–]\s*([\d]+)/);
  if (m) return parseInt(m[1], 10);
  const single = label.match(/group\s*([\d]+)/i);
  if (single) return parseInt(single[1], 10);
  return 99;
}

export function crewSectionIndex(crew: string): number {
  const order = ["General", "A", "B", "C", "D", "S"];
  const n = normCrew(crew);
  const idx = order.indexOf(n);
  return idx >= 0 ? idx : order.length;
}

function areaKey(role: string): string {
  const m =
    role.match(/groups?\s*([\d\-–]+)/i) ||
    role.match(/plant[- ]?wide/i) ||
    role.match(/chiller/i) ||
    role.match(/\(([^)]+)\)/);
  if (!m) return "";
  return String(m[1] || m[0]).toLowerCase().replace(/\s+/g, " ").trim();
}

export interface OrgCcrBranch {
  ccr: Employee;
  locals: Employee[];
}

/** LAB column: chemist card(s) with optional local operators beneath. */
export interface OrgLabBranch {
  chemists: Employee[];
  locals: Employee[];
}

/** One fixed org-chart column (LAB | 1-2 | 3-4 | 5-6 & BOP | Extra). */
export interface OrgChartSlot {
  label: string;
  labBranch?: OrgLabBranch;
  ccrBranches: OrgCcrBranch[];
  /** Locals without a CCR parent — shown in Extra column. */
  standaloneLocals?: Employee[];
}

export interface LayoutNode {
  employee: Employee;
  groupLabel: string;
  relation: string;
  children: LayoutNode[];
  siblingsAfter: LayoutNode[];
}

export interface CrewOrgTree {
  crew: string;
  onDuty: boolean;
  dutyLabel: string | null;
  sic: Employee | null;
  sics: Employee[];
  supervisor: Employee | null;
  supervisors: Employee[];
  branches: OrgCcrBranch[];
  /** Five-column ops layout (non-General crews only). */
  orgSlots: OrgChartSlot[];
  /** Lab chemists rendered on the CCR technical row (CCR-tier styling). */
  chemists: Employee[];
  sideColumn: Employee[];
  others: Employee[];
  /** True when a saved manual org layout is applied. */
  customLayout: boolean;
  layoutNodes: LayoutNode[];
  memberCount: number;
}

export interface OrgLayoutNode {
  empId: string;
  parentEmpId?: string;
  x?: number;
  y?: number;
  order?: number;
}

export interface SavedOrgLayout {
  crewId: string;
  manual?: boolean;
  nodes: OrgLayoutNode[];
}

export interface PlantOrgTree {
  roots: LayoutNode[];
  memberCount: number;
  plantLead: Employee | null;
  chiefChemist: Employee | null;
  /** Lab staff hidden under chief chemist card until expanded. */
  chemists: Employee[];
  /** Crew SIC summary cards + chief chemist (5-card plant row). */
  summaryCards: LayoutNode[];
}

function sortName(a: Employee, b: Employee) {
  return (a.name || "").localeCompare(b.name || "");
}

export function empKey(emp: Employee): string {
  return String(emp.empId || emp._id || "");
}

/** Fixed ops-crew org chart columns (non-General crews). */
export const ORG_CHART_SLOT_LABELS = ["LAB", "1-2", "3-4", "5-6 & BOP", "Extra"] as const;
export type OrgChartSlotIndex = 0 | 1 | 2 | 3 | 4;

/** @deprecated Use ORG_CHART_SLOT_LABELS — kept for legacy imports. */
export const FIXED_CCR_SLOT_LABELS = ORG_CHART_SLOT_LABELS;
export const FIXED_CCR_GROUP_KEYS = [1, 3, 5] as const;

function employeeLabelBlob(emp: Employee): string {
  const ext = emp as Employee & { opsGroupLabel?: string; group?: string };
  return `${ext.opsGroupLabel || ext.group || ""} ${emp.role || ""}`.toLowerCase();
}

/** True when employee belongs to the LAB operation group. */
export function isLabGroupEmployee(emp: Employee): boolean {
  const blob = employeeLabelBlob(emp);
  return /\blab\b/.test(blob) || blob.includes("ro lab");
}

/** Classify a CCR into a fixed org-chart column (1-2 … Extra). Chemists use LAB (0). */
export function orgChartSlotForCcr(emp: Employee): OrgChartSlotIndex {
  if (isLabChemistRole(emp.role || "")) return 0;
  const blob = employeeLabelBlob(emp);
  if (isBopRole(emp.role || "") || /\bbop\b/.test(blob)) return 3;
  const key = groupKeyForEmployee(emp);
  if (key === 1) return 1;
  if (key === 3) return 2;
  if (key === 5) return 3;
  return 4;
}

/** Classify a local operator into the column whose parent branch they belong under. */
export function orgChartSlotForLocal(emp: Employee): OrgChartSlotIndex | 99 {
  if (isLabGroupEmployee(emp)) return 0;
  const blob = employeeLabelBlob(emp);
  if (isBopRole(emp.role || "") || /\bbop\b/.test(blob)) return 4;
  const key = groupKeyForEmployee(emp);
  if (key === 1) return 1;
  if (key === 3) return 2;
  if (key === 5) return 3;
  return 99;
}

function pairLocalsWithChemists(
  chemists: Employee[],
  locals: Employee[]
): { labLocals: Employee[]; remaining: Employee[] } {
  const pool = [...locals];
  const labLocals: Employee[] = [];
  const chemistIds = new Set(chemists.map((c) => empKey(c)).filter(Boolean));

  for (let i = pool.length - 1; i >= 0; i--) {
    const lo = pool[i];
    const parentId = String(lo.assignedTo || "").trim();
    if (parentId && chemistIds.has(parentId)) {
      labLocals.unshift(pool.splice(i, 1)[0]);
      continue;
    }
    if (orgChartSlotForLocal(lo) === 0) {
      labLocals.unshift(pool.splice(i, 1)[0]);
    }
  }

  return { labLocals: labLocals.sort(sortName), remaining: pool };
}

/** Build five fixed columns for ops crews: LAB, 1-2, 3-4, 5-6 & BOP, Extra. */
export function buildOrgChartSlots(members: Employee[]): OrgChartSlot[] {
  const chemists = members.filter((e) => isLabChemistRole(e.role || "")).sort(sortName);
  const ccrs = members.filter((e) => isCcrRole(e.role || "")).sort(sortName);
  const locals = members.filter((e) => isLocalOperatorRole(e.role || "")).sort(sortName);

  const { labLocals, remaining: afterLab } = pairLocalsWithChemists(chemists, locals);
  const { branches: pairedBranches, unpairedLocals } = pairLocalsWithCcrs(ccrs, afterLab);
  const { branches, standaloneLocals } = attachOrphanLocals(pairedBranches, unpairedLocals);

  const slots: OrgChartSlot[] = ORG_CHART_SLOT_LABELS.map((label) => ({
    label,
    ccrBranches: [],
    standaloneLocals: label === "Extra" ? standaloneLocals : undefined,
  }));

  if (chemists.length || labLocals.length) {
    slots[0].labBranch = { chemists, locals: labLocals };
  }

  for (const branch of branches) {
    const slotIdx = orgChartSlotForCcr(branch.ccr);
    slots[slotIdx].ccrBranches.push(branch);
  }

  slots.forEach((slot) => {
    slot.ccrBranches.sort((a, b) => sortName(a.ccr, b.ccr));
  });

  return slots;
}

/** @deprecated Use buildOrgChartSlots — maps CCR branches into legacy 3-column shape. */
export function fixedCcrGroupColumns(branches: OrgCcrBranch[]): {
  columns: OrgCcrBranch[][];
  unplaced: OrgCcrBranch[];
} {
  const columns: OrgCcrBranch[][] = [[], [], []];
  const unplaced: OrgCcrBranch[] = [];

  for (const branch of branches) {
    const slot = orgChartSlotForCcr(branch.ccr);
    if (slot === 1) columns[0].push(branch);
    else if (slot === 2) columns[1].push(branch);
    else if (slot === 3) columns[2].push(branch);
    else unplaced.push(branch);
  }

  columns.forEach((col) => col.sort((a, b) => sortName(a.ccr, b.ccr)));
  return { columns, unplaced };
}

function makeLayoutNode(emp: Employee, children: LayoutNode[] = [], groupLabel = ""): LayoutNode {
  const ext = emp as Employee & { opsGroupLabel?: string };
  return {
    employee: emp,
    groupLabel: groupLabel || ext.opsGroupLabel || "",
    relation: "child",
    children,
    siblingsAfter: [],
  };
}

function sortLayoutNodes(nodes: LayoutNode[]): LayoutNode[] {
  return [...nodes].sort(
    (a, b) =>
      roleRank(a.employee.role || "") - roleRank(b.employee.role || "") ||
      sortName(a.employee, b.employee)
  );
}

function groupKeyForEmployee(emp: Employee): number {
  const ext = emp as Employee & { opsGroupLabel?: string; group?: string };
  return groupSortKey({
    role: emp.role || "",
    opsGroupLabel: ext.opsGroupLabel || ext.group,
  });
}

function pairLocalsWithCcrs(
  ccrs: Employee[],
  locals: Employee[]
): { branches: OrgCcrBranch[]; unpairedLocals: Employee[] } {
  const localsPool = [...locals];
  const branches = ccrs.map((ccr) => {
    const ccrId = empKey(ccr);
    const assigned: Employee[] = [];
    for (let i = localsPool.length - 1; i >= 0; i--) {
      const lo = localsPool[i];
      const parentId = String(lo.assignedTo || "").trim();
      if (parentId && parentId === ccrId) {
        assigned.unshift(localsPool.splice(i, 1)[0]);
      }
    }
    if (assigned.length) {
      return { ccr, locals: assigned.sort(sortName) };
    }

    const ccrGroupKey = groupKeyForEmployee(ccr);
    if (ccrGroupKey !== 99) {
      const byGroup: Employee[] = [];
      for (let i = localsPool.length - 1; i >= 0; i--) {
        const lo = localsPool[i];
        if (groupKeyForEmployee(lo) === ccrGroupKey) {
          byGroup.unshift(localsPool.splice(i, 1)[0]);
        }
      }
      if (byGroup.length) {
        return { ccr, locals: byGroup.sort(sortName) };
      }
    }

    const key = areaKey(ccr.role || "");
    const matched: Employee[] = [];
    for (let i = localsPool.length - 1; i >= 0; i--) {
      const lo = localsPool[i];
      const lk = areaKey(lo.role || "");
      if (key && lk && (key === lk || key.includes(lk) || lk.includes(key))) {
        matched.unshift(localsPool.splice(i, 1)[0]);
      }
    }
    return { ccr, locals: matched.sort(sortName) };
  });
  return { branches, unpairedLocals: localsPool.sort(sortName) };
}

/** Attach locals that did not match a CCR to the best branch (group/slot match). */
function attachOrphanLocals(
  branches: OrgCcrBranch[],
  orphans: Employee[]
): { branches: OrgCcrBranch[]; standaloneLocals: Employee[] } {
  if (!orphans.length) return { branches, standaloneLocals: [] };
  const out = branches.map((b) => ({ ccr: b.ccr, locals: [...b.locals] }));
  const stray: Employee[] = [];

  const branchForLocal = (lo: Employee): OrgCcrBranch | undefined => {
    const loSlot = orgChartSlotForLocal(lo);
    if (loSlot !== 99) {
      const bySlot = out.find((b) => orgChartSlotForCcr(b.ccr) === loSlot);
      if (bySlot) return bySlot;
    }
    const loKey = groupKeyForEmployee(lo);
    if (loKey !== 99) {
      const byGroup = out.find((b) => groupKeyForEmployee(b.ccr) === loKey);
      if (byGroup) return byGroup;
    }
    if (loSlot === 4) {
      const extra = out.find((b) => orgChartSlotForCcr(b.ccr) === 4);
      if (extra) return extra;
    }
    return out[0];
  };

  for (const lo of orphans) {
    const branch = branchForLocal(lo);
    if (branch) {
      branch.locals.push(lo);
    } else {
      stray.push(lo);
    }
  }

  out.forEach((b) => {
    b.locals.sort(sortName);
  });

  if (stray.length && out.length) {
    const extraCol = out.find((b) => orgChartSlotForCcr(b.ccr) === 4) || out[out.length - 1];
    extraCol.locals.push(...stray.sort(sortName));
    return { branches: out, standaloneLocals: [] };
  }

  return { branches: out, standaloneLocals: stray.sort(sortName) };
}

function collectLayoutEmpIds(nodes: LayoutNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: LayoutNode[]) => {
    for (const node of list) {
      const id = empKey(node.employee);
      if (id) ids.add(id);
      walk(node.children);
      walk(node.siblingsAfter);
    }
  };
  walk(nodes);
  return ids;
}

/** Every roster member must appear in the tree — attach stragglers under the operations lead. */
export function appendUnplacedMembersToLayout(
  members: Employee[],
  roots: LayoutNode[]
): LayoutNode[] {
  if (!members.length) return roots;
  const placed = collectLayoutEmpIds(roots);
  const unplaced = members.filter((m) => {
    const id = empKey(m);
    return id && !placed.has(id);
  });
  if (!unplaced.length) return roots;

  const lead = findCcrParentLead(members);
  const attachUnderLead = (nodes: LayoutNode[]): LayoutNode[] =>
    nodes.map((node) => {
      if (lead && empKey(node.employee) === empKey(lead)) {
        return makeLayoutNode(
          node.employee,
          sortLayoutNodes([
            ...node.children,
            ...unplaced.map((emp) => makeLayoutNode(emp)),
          ]),
          node.groupLabel
        );
      }
      return makeLayoutNode(
        node.employee,
        attachUnderLead(node.children),
        node.groupLabel
      );
    });

  if (lead) {
    const withLead = attachUnderLead(roots);
    if (collectLayoutEmpIds(withLead).size >= members.length) return withLead;
  }

  return sortLayoutNodes([...roots, ...unplaced.map((emp) => makeLayoutNode(emp))]);
}

function extractLabBranchFromLayout(roots: LayoutNode[]): OrgLabBranch | undefined {
  const chemists: Employee[] = [];
  const labLocals: Employee[] = [];

  const walk = (nodes: LayoutNode[]) => {
    for (const node of nodes) {
      const role = node.employee.role || "";
      if (isLabChemistRole(role)) {
        chemists.push(node.employee);
        for (const child of node.children) {
          const childRole = child.employee.role || "";
          if (isLocalOperatorRole(childRole) || isFieldOperatorRole(childRole)) {
            labLocals.push(child.employee);
          }
        }
      }
      const skip = isLabChemistRole(role)
        ? node.children.filter(
            (c) =>
              !isLocalOperatorRole(c.employee.role || "") &&
              !isFieldOperatorRole(c.employee.role || "")
          )
        : node.children;
      walk(skip);
    }
  };

  walk(roots);
  if (!chemists.length && !labLocals.length) return undefined;
  return { chemists: chemists.sort(sortName), locals: labLocals.sort(sortName) };
}

function extractCcrBranchesFromLayout(roots: LayoutNode[]): OrgCcrBranch[] {
  const branches: OrgCcrBranch[] = [];

  const walk = (nodes: LayoutNode[]) => {
    for (const node of nodes) {
      const role = node.employee.role || "";
      if (isCcrRole(role)) {
        const locals = node.children
          .filter((c) => {
            const r = c.employee.role || "";
            return isLocalOperatorRole(r) || isFieldOperatorRole(r);
          })
          .map((c) => c.employee)
          .sort(sortName);
        branches.push({ ccr: node.employee, locals });
        walk(
          node.children.filter((c) => {
            const r = c.employee.role || "";
            return !isLocalOperatorRole(r) && !isFieldOperatorRole(r);
          })
        );
        continue;
      }
      walk(node.children);
    }
  };

  walk(roots);
  return branches;
}

function standaloneLocalsFromLayout(roots: LayoutNode[], members: Employee[]): Employee[] {
  const underCcrOrChemist = new Set<string>();
  const walk = (nodes: LayoutNode[], parentIsBranchHead: boolean) => {
    for (const node of nodes) {
      const role = node.employee.role || "";
      const id = empKey(node.employee);
      const isBranchHead = isCcrRole(role) || isLabChemistRole(role);
      if (parentIsBranchHead && (isLocalOperatorRole(role) || isFieldOperatorRole(role)) && id) {
        underCcrOrChemist.add(id);
      }
      walk(node.children, isBranchHead);
    }
  };
  walk(roots, false);

  return members
    .filter((m) => {
      const role = m.role || "";
      if (!isLocalOperatorRole(role) && !isFieldOperatorRole(role)) return false;
      const id = empKey(m);
      return id && !underCcrOrChemist.has(id);
    })
    .sort(sortName);
}

/** Build five-column slots from a saved layout tree (manual drag edits). */
export function buildOrgChartSlotsFromLayout(
  members: Employee[],
  layoutNodes: LayoutNode[]
): OrgChartSlot[] {
  const labBranch = extractLabBranchFromLayout(layoutNodes);
  const branches = extractCcrBranchesFromLayout(layoutNodes);
  const standaloneLocals = standaloneLocalsFromLayout(layoutNodes, members);

  const slots: OrgChartSlot[] = ORG_CHART_SLOT_LABELS.map((label) => ({
    label,
    ccrBranches: [],
    standaloneLocals: label === "Extra" ? standaloneLocals : undefined,
  }));

  if (labBranch) {
    slots[0].labBranch = labBranch;
  }

  for (const branch of branches) {
    const slotIdx = orgChartSlotForCcr(branch.ccr);
    slots[slotIdx].ccrBranches.push(branch);
  }

  slots.forEach((slot) => {
    slot.ccrBranches.sort((a, b) => sortName(a.ccr, b.ccr));
  });

  return slots;
}

/** General crew: plant lead at root; all non-lab roles direct children; chemists under chief chemist. */
export function buildGeneralCrewLayoutNodes(members: Employee[]): LayoutNode[] {
  if (!members.length) return [];

  const lead = findPlantLead(members);
  const chiefChemists = members.filter((e) => isChiefChemistRole(e.role || "")).sort(sortName);
  const primaryChief = chiefChemists[0] || null;
  const chemists = members
    .filter(
      (e) =>
        isChemistRole(e.role || "") &&
        (!primaryChief || empKey(e) !== empKey(primaryChief))
    )
    .sort(sortName);

  const directMembers = members.filter((e) => {
    if (lead && empKey(e) === empKey(lead)) return false;
    if (isChemistRole(e.role || "")) return false;
    return true;
  });

  const directNodes = sortLayoutNodes(
    directMembers.map((emp) => {
      if (primaryChief && empKey(emp) === empKey(primaryChief)) {
        return makeLayoutNode(
          emp,
          sortLayoutNodes(chemists.map((chem) => makeLayoutNode(chem)))
        );
      }
      return makeLayoutNode(emp);
    })
  );

  if (lead) {
    return [makeLayoutNode(lead, directNodes)];
  }
  return directNodes;
}

/** Saved General layout: single root; chemists only nested under chief chemist. */
export function isValidGeneralFlatLayout(members: Employee[], savedNodes: OrgLayoutNode[]): boolean {
  if (!savedNodes?.length || !members.length) return false;
  const lead = findPlantLead(members);
  const memberById = new Map<string, Employee>();
  members.forEach((m) => {
    const key = empKey(m);
    if (key) memberById.set(key, m);
  });

  const memberIds = new Set(memberById.keys());
  const savedIds = savedNodes.map((n) => String(n.empId || "").trim()).filter((id) => memberIds.has(id));
  if (savedIds.length !== members.length) return false;

  const parentById = new Map<string, string>();
  const childMap = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of savedNodes) {
    const id = String(node.empId || "").trim();
    if (!id || !memberIds.has(id)) continue;
    const parentId = String(node.parentEmpId || "").trim();
    if (parentId && memberIds.has(parentId) && parentId !== id) {
      parentById.set(id, parentId);
      const siblings = childMap.get(parentId) || [];
      siblings.push(id);
      childMap.set(parentId, siblings);
    } else {
      roots.push(id);
    }
  }

  if (roots.length !== 1) return false;
  const rootId = roots[0];
  if (lead && rootId !== empKey(lead)) return false;

  for (const id of savedIds) {
    if (id === rootId) continue;
    const emp = memberById.get(id)!;
    const role = emp.role || "";
    const parentId = parentById.get(id) || rootId;

    if (isChemistRole(role)) {
      const parent = memberById.get(parentId);
      if (!parent || !isChiefChemistRole(parent.role || "")) return false;
      continue;
    }

    if (parentId !== rootId) return false;
  }

  const chiefChemistIds = new Set(
    members.filter((m) => isChiefChemistRole(m.role || "")).map((m) => empKey(m)).filter(Boolean)
  );
  for (const id of savedIds) {
    const emp = memberById.get(id)!;
    if (!isChemistRole(emp.role || "")) continue;
    const parentId = parentById.get(id);
    if (!parentId || !chiefChemistIds.has(parentId)) return false;
  }

  return true;
}

/**
 * Deterministic per-crew hierarchy:
 * - Supervisor is child of SIC when SIC exists; else Supervisor is root
 * - CCR operators are children of Supervisor (or SIC if no Supervisor) — never GDP/field/chemist
 * - Local operators are children of their assigned CCR (by assignedTo or matching group)
 * - GDP / field engineers / BOP are support-row siblings under the same operations lead (not CCR parents)
 */
export function buildCrewHierarchyLayoutNodes(members: Employee[]): LayoutNode[] {
  if (!members.length) return [];
  if (normCrew(members[0]?.crew) === "General") {
    return buildGeneralCrewLayoutNodes(members);
  }

  const sics = members.filter((e) => isSicRole(e.role || "")).sort(sortName);
  const supervisors = members.filter((e) => isSupervisorRole(e.role || "")).sort(sortName);
  const ccrs = members.filter((e) => isCcrRole(e.role || "")).sort(sortName);
  const locals = members.filter((e) => isLocalOperatorRole(e.role || "")).sort(sortName);
  const chemists = members.filter((e) => isLabChemistRole(e.role || "")).sort(sortName);
  const sideColumn = members.filter((e) => isSideColumnRole(e.role || "")).sort(sortName);

  const operationsMembers = members.filter((e) => {
    const role = e.role || "";
    if (isSicRole(role) || isSupervisorRole(role)) return false;
    if (isSideColumnRole(role)) return false;
    if (isLabChemistRole(role)) return false;
    if (isCcrRole(role) || isLocalOperatorRole(role) || isFieldOperatorRole(role)) return false;
    return true;
  });

  const { labLocals, remaining: localsAfterLab } = pairLocalsWithChemists(chemists, locals);
  const { branches: pairedBranches, unpairedLocals } = pairLocalsWithCcrs(ccrs, localsAfterLab);
  const { branches } = attachOrphanLocals(pairedBranches, unpairedLocals);

  const chemistNodes = sortLayoutNodes(
    chemists.map((chem) =>
      makeLayoutNode(
        chem,
        sortLayoutNodes(labLocals.filter((lo) => {
          const parentId = String(lo.assignedTo || "").trim();
          return !parentId || parentId === empKey(chem);
        }).map((lo) => makeLayoutNode(lo))),
        "LAB"
      )
    )
  );

  const unassignedLabLocals = labLocals.filter(
    (lo) => !chemists.some((c) => empKey(c) === String(lo.assignedTo || "").trim())
  );
  if (unassignedLabLocals.length && chemistNodes.length) {
    chemistNodes[0].children.push(
      ...sortLayoutNodes(unassignedLabLocals.map((lo) => makeLayoutNode(lo)))
    );
  } else if (unassignedLabLocals.length && !chemistNodes.length) {
    chemistNodes.push(
      ...sortLayoutNodes(unassignedLabLocals.map((lo) => makeLayoutNode(lo)))
    );
  }

  const ccrNodes = sortLayoutNodes(
    branches.map((branch) =>
      makeLayoutNode(
        branch.ccr,
        sortLayoutNodes(branch.locals.map((lo) => makeLayoutNode(lo)))
      )
    )
  );
  const sideNodes = sortLayoutNodes(sideColumn.map((e) => makeLayoutNode(e)));
  const otherNodes = sortLayoutNodes(operationsMembers.map((e) => makeLayoutNode(e)));

  const operationsChildren = sortLayoutNodes([...ccrNodes, ...chemistNodes, ...sideNodes, ...otherNodes]);

  const sic = sics[0] || null;
  const supervisor = supervisors[0] || null;
  const extraLeads = sortLayoutNodes([
    ...sics.slice(1).map((e) => makeLayoutNode(e)),
    ...supervisors.slice(1).map((e) => makeLayoutNode(e)),
  ]);

  if (supervisor && sic) {
    const supervisorChildren = sortLayoutNodes([
      ...operationsChildren,
      ...extraLeads.filter((n) => empKey(n.employee) !== empKey(supervisor)),
    ]);
    return [makeLayoutNode(sic, [makeLayoutNode(supervisor, supervisorChildren)])];
  }

  if (supervisor) {
    return [makeLayoutNode(supervisor, sortLayoutNodes([...operationsChildren, ...extraLeads]))];
  }

  if (sic) {
    return [makeLayoutNode(sic, sortLayoutNodes([...operationsChildren, ...extraLeads]))];
  }

  return sortLayoutNodes([...operationsChildren, ...extraLeads]);
}

/** Build tree nodes from saved manual org layout (parent links + optional positions). */
export function buildLayoutNodesFromSavedLayout(
  members: Employee[],
  savedNodes: OrgLayoutNode[]
): LayoutNode[] | null {
  const mergedNodes = mergeLayoutWithMembers(members, savedNodes);
  if (!mergedNodes.length || !members.length) return null;

  const memberById = new Map<string, Employee>();
  members.forEach((m) => {
    const key = empKey(m);
    if (key) memberById.set(key, m);
  });

  const savedById = new Map<string, OrgLayoutNode>();
  mergedNodes.forEach((node) => {
    const id = String(node.empId || "").trim();
    if (id && memberById.has(id)) savedById.set(id, node);
  });
  if (!savedById.size) return null;

  const childMap = new Map<string, string[]>();
  const roots: string[] = [];

  for (const [id, node] of savedById) {
    const parentId = String(node.parentEmpId || "").trim();
    if (parentId && savedById.has(parentId) && parentId !== id) {
      const siblings = childMap.get(parentId) || [];
      siblings.push(id);
      childMap.set(parentId, siblings);
    } else {
      roots.push(id);
    }
  }

  const sortIds = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const oa = savedById.get(a)?.order ?? 0;
      const ob = savedById.get(b)?.order ?? 0;
      if (oa !== ob) return oa - ob;
      const ea = memberById.get(a);
      const eb = memberById.get(b);
      return sortName(ea!, eb!);
    });

  const buildNode = (id: string): LayoutNode | null => {
    const emp = memberById.get(id);
    if (!emp) return null;
    const ext = emp as Employee & { opsGroupLabel?: string };
    const children = sortIds(childMap.get(id) || [])
      .map(buildNode)
      .filter(Boolean) as LayoutNode[];
    return makeLayoutNode(emp, children, ext.opsGroupLabel || "");
  };

  const layoutRoots = sortIds(roots)
    .map(buildNode)
    .filter(Boolean) as LayoutNode[];

  if (!layoutRoots.length) return null;
  return appendUnplacedMembersToLayout(members, layoutRoots);
}

/** Saved ops-crew layout: CCRs must report to the operations lead, not GDP/field/local roles. */
export function isValidCrewOpsLayout(members: Employee[], savedNodes: OrgLayoutNode[]): boolean {
  if (!savedNodes?.length || !members.length) return false;
  if (normCrew(members[0]?.crew) === "General") return false;

  const memberById = new Map<string, Employee>();
  members.forEach((m) => {
    const key = empKey(m);
    if (key) memberById.set(key, m);
  });

  const ccrLead = findCcrParentLead(members);
  const ccrLeadId = ccrLead ? empKey(ccrLead) : "";

  for (const node of savedNodes) {
    const id = String(node.empId || "").trim();
    const emp = id ? memberById.get(id) : undefined;
    if (!emp) continue;

    const role = emp.role || "";
    if (!isCcrRole(role)) continue;

    const parentId = String(node.parentEmpId || "").trim();
    const parent = parentId ? memberById.get(parentId) : undefined;
    if (!parent || !isOperationsLeadRole(parent.role || "")) return false;
    if (ccrLeadId && parentId !== ccrLeadId) return false;
  }

  return true;
}

/** Whether `parent` may be a manual org-chart parent for `child`. */
export function isValidManualOrgParent(parent: Employee, child: Employee): boolean {
  const parentRole = parent.role || "";
  const childRole = child.role || "";

  if (isCcrRole(childRole)) {
    return isOperationsLeadRole(parentRole);
  }
  if (isLocalOperatorRole(childRole)) {
    return isCcrRole(parentRole) || isOperationsLeadRole(parentRole) || isLabChemistRole(parentRole);
  }
  if (isOperationsLeadRole(parentRole)) return true;
  if (isCcrRole(parentRole) || isLabChemistRole(parentRole)) {
    return isLocalOperatorRole(childRole);
  }
  if (isGdpEngineerRole(parentRole) || isBopRole(parentRole)) {
    return !isCcrRole(childRole) && !isLocalOperatorRole(childRole);
  }
  return false;
}

/** Resolve parent empId from personnel placement fields (edit drawer / roster). */
export function parentEmpIdFromPersonnelPlacement(
  emp: Employee,
  members: Employee[]
): string | undefined {
  const ext = emp as Employee & { opsTreeParentEmpId?: string; opsTreeRelation?: string };
  const relation = String(ext.opsTreeRelation || "").trim();
  const parentRef = String(ext.opsTreeParentEmpId || "").trim();

  if (relation === "root") return "";
  if (relation === "child" && parentRef) return parentRef;
  if ((relation === "below" || relation === "beside") && parentRef) return parentRef;

  if (isLocalOperatorRole(emp.role || "")) {
    const assigned = String(emp.assignedTo || "").trim();
    if (assigned && members.some((m) => empKey(m) === assigned)) return assigned;
  }

  return undefined;
}

export function hasPersonnelPlacementOverrides(members: Employee[]): boolean {
  return members.some((m) => {
    const ext = m as Employee & { opsTreeRelation?: string };
    const relation = String(ext.opsTreeRelation || "").trim();
    if (relation === "root") return true;
    if (isLocalOperatorRole(m.role || "") && String(m.assignedTo || "").trim()) return true;
    const parent = parentEmpIdFromPersonnelPlacement(m, members);
    return parent !== undefined && parent !== "";
  });
}

/** Ensure every crew member has a layout node; preserve saved positions. */
export function mergeLayoutWithMembers(members: Employee[], nodes: OrgLayoutNode[]): OrgLayoutNode[] {
  const byId = new Map(nodes.map((n) => [n.empId, n]));
  const merged: OrgLayoutNode[] = [];
  members.forEach((emp, index) => {
    const id = String(emp.empId || "").trim();
    if (!id) return;
    const existing = byId.get(id);
    merged.push(existing ?? { empId: id, parentEmpId: "", order: index });
  });
  return merged;
}

/** Apply personnel placement fields onto org layout nodes (saved layout wins when preferSaved). */
export function mergePersonnelPlacementsIntoOrgLayout(
  members: Employee[],
  nodes: OrgLayoutNode[],
  options?: { preferSaved?: boolean }
): OrgLayoutNode[] {
  const preferSaved = options?.preferSaved ?? true;
  const byId = new Map<string, OrgLayoutNode>();
  mergeLayoutWithMembers(members, nodes).forEach((n) => byId.set(n.empId, { ...n }));

  members.forEach((emp, index) => {
    const id = empKey(emp);
    if (!id) return;
    const existing = byId.get(id) ?? { empId: id, parentEmpId: "", order: index };
    const placementParent = parentEmpIdFromPersonnelPlacement(emp, members);
    if (placementParent === undefined) return;

    const savedParent = String(existing.parentEmpId || "").trim();
    const forceLocalCcr =
      isLocalOperatorRole(emp.role || "") && String(emp.assignedTo || "").trim();
    if (preferSaved && savedParent && !forceLocalCcr) return;

    if (placementParent === "") {
      byId.set(id, { ...existing, parentEmpId: "" });
      return;
    }

    const parent = members.find((m) => empKey(m) === placementParent);
    if (parent && isValidManualOrgParent(parent, emp)) {
      byId.set(id, { ...existing, parentEmpId: placementParent });
    }
  });

  return mergeLayoutWithMembers(members, [...byId.values()]);
}

/** Patch one employee's parent link in an org layout (used when saving edit personnel). */
export function patchOrgLayoutNodeForEmployee(
  members: Employee[],
  nodes: OrgLayoutNode[],
  employee: Employee,
  parentEmpId: string
): OrgLayoutNode[] {
  const merged = mergeLayoutWithMembers(members, nodes);
  const id = empKey(employee);
  if (!id) return merged;
  return merged.map((n) => (n.empId === id ? { ...n, parentEmpId } : n));
}

/** Keep assignedTo and relative-to-card placement consistent for locals. */
export function reconcilePersonnelPlacementFields(
  role: string,
  opsTreeParentEmpId: string,
  opsTreeRelation: string,
  assignedTo: string,
  employees: Employee[]
): { opsTreeParentEmpId: string; opsTreeRelation: string; assignedTo: string } {
  let parent = String(opsTreeParentEmpId || "").trim();
  let relation = String(opsTreeRelation || "").trim() || "root";
  let assigned = String(assignedTo || "").trim();

  const parentEmp = parent ? employees.find((e) => e.empId === parent) : null;

  if (relation === "child" && parentEmp) {
    if (isCcrRole(parentEmp.role || "")) {
      if (isLocalOperatorRole(role)) assigned = parent;
    } else if (isLocalOperatorRole(role)) {
      assigned = "";
    }
  }

  if (assigned && isLocalOperatorRole(role)) {
    const ccr = employees.find((e) => e.empId === assigned);
    if (ccr && isCcrRole(ccr.role || "")) {
      parent = assigned;
      relation = "child";
    }
  }

  return { opsTreeParentEmpId: parent, opsTreeRelation: relation, assignedTo: assigned };
}

function orgLayoutNodesEqual(a: OrgLayoutNode[], b: OrgLayoutNode[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((n) => [n.empId, n]));
  return a.every((node) => {
    const other = byId.get(node.empId);
    return other && String(other.parentEmpId || "") === String(node.parentEmpId || "");
  });
}

/** Whether any CCR's parent chain includes a GDP engineer in saved layout nodes. */
export function savedLayoutHasGdpCcrParentChain(
  members: Employee[],
  nodes: OrgLayoutNode[]
): boolean {
  const memberById = new Map<string, Employee>();
  members.forEach((m) => {
    const key = empKey(m);
    if (key) memberById.set(key, m);
  });
  const parentById = new Map(nodes.map((n) => [n.empId, String(n.parentEmpId || "").trim()]));

  for (const node of nodes) {
    const emp = memberById.get(node.empId);
    if (!emp || !isCcrRole(emp.role || "")) continue;
    let parentId = parentById.get(node.empId) || "";
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = memberById.get(parentId);
      if (parent && isGdpEngineerRole(parent.role || "")) return true;
      parentId = parentById.get(parentId) || "";
    }
  }
  return false;
}

/** Repair invalid CCR parents; returns whether nodes changed. */
export function sanitizeCrewOpsLayoutNodes(
  members: Employee[],
  nodes: OrgLayoutNode[]
): { nodes: OrgLayoutNode[]; changed: boolean } {
  const merged = mergeLayoutWithMembers(members, nodes);
  const repaired = repairCrewOpsLayoutNodes(members, merged);
  return { nodes: repaired, changed: !orgLayoutNodesEqual(merged, repaired) };
}

/** Merge saved nodes with personnel placements; always repair invalid CCR parents when possible. */
function resolveSavedCrewOpsNodes(
  members: Employee[],
  savedNodes: OrgLayoutNode[]
): OrgLayoutNode[] | null {
  const merged = mergePersonnelPlacementsIntoOrgLayout(
    members,
    mergeLayoutWithMembers(members, savedNodes),
    { preferSaved: true }
  );

  const repaired = repairCrewOpsLayoutNodes(members, merged);
  return isValidCrewOpsLayout(members, repaired) ? repaired : null;
}

/** Fix invalid saved links so CCRs always attach to SIC/Supervisor; support roles never parent CCRs. */
export function repairCrewOpsLayoutNodes(
  members: Employee[],
  savedNodes: OrgLayoutNode[]
): OrgLayoutNode[] {
  if (!savedNodes?.length || !members.length) return savedNodes;

  const memberById = new Map<string, Employee>();
  members.forEach((m) => {
    const key = empKey(m);
    if (key) memberById.set(key, m);
  });

  const ccrLead = findCcrParentLead(members);
  const ccrLeadId = ccrLead ? empKey(ccrLead) : "";
  const sic = members.filter((e) => isSicRole(e.role || "")).sort(sortName)[0] || null;
  const sicId = sic ? empKey(sic) : "";
  const opsLeadId = ccrLeadId || sicId;

  return savedNodes.map((node) => {
    const id = String(node.empId || "").trim();
    const emp = id ? memberById.get(id) : undefined;
    if (!emp) return node;

    const role = emp.role || "";
    let parentEmpId = String(node.parentEmpId || "").trim();

    if (isCcrRole(role)) {
      const parent = parentEmpId ? memberById.get(parentEmpId) : undefined;
      if (!parent || !isOperationsLeadRole(parent.role || "") || (ccrLeadId && parentEmpId !== ccrLeadId)) {
        return { ...node, parentEmpId: ccrLeadId };
      }
      return node;
    }

    if (isGdpEngineerRole(role) || isBopRole(role) || isLabChemistRole(role)) {
      const parent = parentEmpId ? memberById.get(parentEmpId) : undefined;
      const parentRole = parent?.role || "";
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

/** Default node positions for editor canvas from auto hierarchy. */
export function defaultOrgLayoutNodes(members: Employee[]): OrgLayoutNode[] {
  const autoNodes = buildCrewHierarchyLayoutNodes(members);
  const out: OrgLayoutNode[] = [];
  let y = 24;

  const walk = (nodes: LayoutNode[], depth: number, startX: number) => {
    const gapX = 168;
    nodes.forEach((node, index) => {
      const id = empKey(node.employee);
      if (!id) return;
      const parentId = layoutParentIdFromWalk(autoNodes, id);
      out.push({
        empId: id,
        parentEmpId: parentId || "",
        x: startX + index * gapX,
        y: y + depth * 120,
        order: out.length,
      });
      if (node.children.length) {
        walk(node.children, depth + 1, startX + index * gapX - ((node.children.length - 1) * gapX) / 2);
      }
    });
  };

  walk(autoNodes, 0, 24);
  return out;
}

function layoutParentIdFromWalk(roots: LayoutNode[], childId: string): string | null {
  let found: string | null = null;
  const step = (nodes: LayoutNode[], parent: LayoutNode | null) => {
    for (const node of nodes) {
      if (empKey(node.employee) === childId && parent) {
        found = empKey(parent.employee);
      }
      step(node.children, node);
      step(node.siblingsAfter, parent);
    }
  };
  step(roots, null);
  return found;
}

function summarizeCrewTree(
  members: Employee[],
  layoutNodes: LayoutNode[],
  options?: { useLayoutSlots?: boolean }
): {
  sics: Employee[];
  sic: Employee | null;
  supervisors: Employee[];
  supervisor: Employee | null;
  branches: OrgCcrBranch[];
  orgSlots: OrgChartSlot[];
  chemists: Employee[];
  sideColumn: Employee[];
  others: Employee[];
} {
  const sics = members.filter((e) => isSicRole(e.role || "")).sort(sortName);
  const supervisors = members.filter((e) => isSupervisorRole(e.role || "")).sort(sortName);
  const ccrs = members.filter((e) => isCcrRole(e.role || "")).sort(sortName);
  const locals = members.filter((e) => isLocalOperatorRole(e.role || "")).sort(sortName);
  const orgSlots =
    members.length && normCrew(members[0]?.crew) !== "General"
      ? options?.useLayoutSlots && layoutNodes.length
        ? buildOrgChartSlotsFromLayout(members, layoutNodes)
        : buildOrgChartSlots(members)
      : [];
  const chemists = members.filter((e) => isLabChemistRole(e.role || "")).sort(sortName);
  const sideColumn = members
    .filter((e) => isSideColumnRole(e.role || ""))
    .sort(sortName);
  const placed = new Set<string>();
  [...sics, ...supervisors, ...ccrs, ...locals, ...chemists, ...sideColumn].forEach((e) => {
    const k = empKey(e);
    if (k) placed.add(k);
  });
  const others = members
    .filter((e) => {
      const k = empKey(e);
      return k && !placed.has(k);
    })
    .sort(sortName);

  return {
    sics,
    sic: sics[0] || null,
    supervisors,
    supervisor: supervisors[0] || null,
    branches: orgSlots.flatMap((s) => s.ccrBranches),
    orgSlots,
    chemists,
    sideColumn,
    others,
  };
}

export function buildCrewOrgTree(
  employees: Employee[],
  crew: string,
  savedLayout?: SavedOrgLayout | null
): CrewOrgTree {
  const members = filterEmployeesByCrew(employees, crew);
  const memberCount = members.length;
  const today = new Date().toISOString().slice(0, 10);
  const dutyLabel = crewDutyLabel(crew, today);
  const onDuty = !!dutyLabel;
  const crewKey = normCrew(crew);

  const crewOpsSaved =
    crewKey !== "General" &&
    savedLayout?.manual !== false &&
    savedLayout?.nodes?.length
      ? resolveSavedCrewOpsNodes(members, savedLayout.nodes)
      : null;
  const manualLayout = crewOpsSaved
    ? buildLayoutNodesFromSavedLayout(members, crewOpsSaved)
    : null;
  const generalManualLayout =
    crewKey === "General" &&
    savedLayout?.manual !== false &&
    savedLayout?.nodes?.length &&
    (isValidGeneralFlatLayout(members, savedLayout.nodes) ||
      savedLayout.nodes.some((n) => Number(n.x) > 0 || Number(n.y) > 0))
      ? buildLayoutNodesFromSavedLayout(members, savedLayout.nodes)
      : null;
  const personnelOverlay =
    !manualLayout && !generalManualLayout && hasPersonnelPlacementOverrides(members)
      ? (() => {
          const nodes = resolveSavedCrewOpsNodes(
            members,
            mergePersonnelPlacementsIntoOrgLayout(members, defaultOrgLayoutNodes(members), {
              preferSaved: false,
            })
          );
          return nodes ? buildLayoutNodesFromSavedLayout(members, nodes) : null;
        })()
      : null;
  const layoutNodes =
    manualLayout ??
    generalManualLayout ??
    personnelOverlay ??
    appendUnplacedMembersToLayout(members, buildCrewHierarchyLayoutNodes(members));
  const summary = summarizeCrewTree(members, layoutNodes, {
    useLayoutSlots: Boolean(manualLayout || generalManualLayout || personnelOverlay),
  });

  return {
    crew: crewKey,
    onDuty,
    dutyLabel,
    sic: summary.sic,
    sics: summary.sics,
    supervisor: summary.supervisor,
    supervisors: summary.supervisors,
    branches: summary.branches,
    orgSlots: summary.orgSlots,
    chemists: summary.chemists,
    sideColumn: summary.sideColumn,
    others: summary.others,
    customLayout: Boolean(manualLayout || generalManualLayout || personnelOverlay),
    layoutNodes,
    memberCount,
  };
}

function normalizePersonName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Find Bandar Aldogaish (fuzzy) for plant org root. */
export function findPlantLead(employees: Employee[]): Employee | null {
  const scored = employees
    .map((emp) => {
      const name = normalizePersonName(emp.name || "");
      const full = normalizePersonName(
        String((emp as Employee & { fullName?: string }).fullName || "")
      );
      const blob = `${name} ${full}`.trim();
      let score = 0;
      if (blob.includes("bandar")) score += 2;
      if (blob.includes("aldogaish") || blob.includes("aldogais")) score += 3;
      if (blob.includes("aldogaish")) score += 1;
      return { emp, score };
    })
    .filter((row) => row.score >= 3)
    .sort((a, b) => b.score - a.score || sortName(a.emp, b.emp));

  if (scored.length) return scored[0].emp;

  const bandarOnly = employees.find((e) =>
    normalizePersonName(e.name || "").includes("bandar")
  );
  return bandarOnly || null;
}

/** Whether this employee is Bandar Aldogaish (plant manager / plant org root). */
export function isPlantLeadEmployee(emp: Employee, employees?: Employee[]): boolean {
  if (employees?.length) {
    const lead = findPlantLead(employees);
    if (lead && empKey(lead) === empKey(emp)) return true;
  }
  const name = normalizePersonName(emp.name || "");
  const full = normalizePersonName(String((emp as Employee & { fullName?: string }).fullName || ""));
  const blob = `${name} ${full}`.trim();
  return blob.includes("bandar") && (blob.includes("aldogaish") || blob.includes("aldogais"));
}

export function buildPlantOrgTree(employees: Employee[]): PlantOrgTree {
  const plantLead = findPlantLead(employees);
  const chiefChemists = employees
    .filter((e) => isChiefChemistRole(e.role || ""))
    .sort(sortName);
  const chiefChemist = chiefChemists[0] || null;
  const chemists = employees
    .filter(
      (e) =>
        isChemistRole(e.role || "") &&
        (!chiefChemist || empKey(e) !== empKey(chiefChemist))
    )
    .sort(sortName);

  const summaryCards: LayoutNode[] = [];
  for (const crew of PLANT_CREW_ORDER) {
    const members = filterEmployeesByCrew(employees, crew);
    if (!members.length) continue;
    const sic =
      members.find((e) => isSicRole(e.role || "")) ||
      members.find((e) => isSupervisorRole(e.role || ""));
    const rep: Employee =
      sic ||
      ({
        _id: `crew-${crew}-summary`,
        empId: `crew-${crew}`,
        name: `Crew ${crew}`,
        role: "Operations Crew",
        crew,
      } as Employee);
    summaryCards.push(makeLayoutNode(rep, [], `Crew ${crew}`));
  }

  if (chiefChemist) {
    summaryCards.push(
      makeLayoutNode(
        chiefChemist,
        sortLayoutNodes(chemists.map((chem) => makeLayoutNode(chem))),
        "Laboratory"
      )
    );
  }

  const roots = plantLead ? [makeLayoutNode(plantLead, summaryCards, "Plant")] : summaryCards;

  return {
    roots,
    memberCount: employees.length,
    plantLead,
    chiefChemist,
    chemists,
    summaryCards,
  };
}

function collectLayoutCcrKeys(layoutNodes: LayoutNode[]): Set<string> {
  const keys = new Set<string>();
  const walk = (nodes: LayoutNode[]) => {
    for (const node of nodes) {
      if (isCcrRole(node.employee.role || "")) {
        const k = empKey(node.employee);
        if (k) keys.add(k);
      }
      walk(node.children);
      walk(node.siblingsAfter);
    }
  };
  walk(layoutNodes);
  return keys;
}

/** Count CCR operators represented in the tree. */
export function countCcrInOrgTree(tree: CrewOrgTree): number {
  if (tree.layoutNodes.length) return collectLayoutCcrKeys(tree.layoutNodes).size;
  return tree.branches.length;
}

export function crewOrderForDisplay(employees: Employee[]): string[] {
  const crews = [...new Set(employees.map((e) => normCrew(e.crew)))].filter(
    (c) => c !== "General" && c !== "S"
  );
  const general = employees.some((e) => ["General", "S"].includes(normCrew(e.crew)));
  const today = new Date().toISOString().slice(0, 10);
  crews.sort((a, b) => {
    const sa = crewOnDutyScore(a, today);
    const sb = crewOnDutyScore(b, today);
    if (sb !== sa) return sb - sa;
    return a.localeCompare(b);
  });
  if (general) crews.push("General");
  return crews;
}
