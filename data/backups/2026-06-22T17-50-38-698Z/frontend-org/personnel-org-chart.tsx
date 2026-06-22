"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, CreditCard, Loader2, Pencil, RotateCcw, Save, X } from "lucide-react";
import type { Employee } from "@/components/calendar/roster-card-view";
import { getNameColor } from "@/lib/crewColors";
import {
  buildCrewOrgTree,
  defaultCrewTabForUser,
  defaultOrgLayoutNodes,
  empKey,
  filterEmployeesByCrew,
  ORG_CHART_SLOT_LABELS,
  orgChartSlotForCcr,
  isChiefChemistRole,
  isCcrRole,
  isFieldOperatorRole,
  isLabChemistRole,
  isLocalOperatorRole,
  isOperationsLeadRole,
  isPlantLeadEmployee,
  normCrew,
  ORG_TIER_CARD_CLASS,
  repairCrewOpsLayoutNodes,
  mergeLayoutWithMembers,
  tierForEmployee,
  visibleCrewTabsForUser,
  type CrewOrgTree,
  type LayoutNode,
  type OrgCcrBranch,
  type OrgChartSlot,
  type OrgLayoutNode,
  type SavedOrgLayout,
  type StandardCrewTab,
} from "@/lib/personnelOrg";
import { adminApi } from "@/lib/api";
import { rosterApi, type OrgOverlayDelegation } from "@/lib/api";
import { toast } from "sonner";
import { ActingBadge } from "@/components/personnel/acting-badge";
import { useCrewKpi, type CrewMemberKpi } from "@/hooks/useKpi";
import { KpiMemberBadge } from "@/components/kpi/kpi-member-badge";
import { KpiBadge } from "@/components/kpi/kpi-badge";
import { ErtBadge } from "@/components/personnel/ert-badge";

function initials(name: string) {
  return (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** CCR cards use a light lavender background — keep custom name colors readable. */
function orgCardNameColor(
  tier: "sic" | "supervisor" | "ccr" | "local" | "side" | "plant",
  employeeNameColor: string
): string {
  if (tier === "sic" || tier === "supervisor" || tier === "plant") return "#f8fafc";
  if (tier === "ccr" || tier === "local" || tier === "side") {
    return employeeNameColor !== "#616161" ? employeeNameColor : tier === "ccr" ? "#2e2044" : "#7c3aed";
  }
  return employeeNameColor !== "#616161" ? employeeNameColor : "#7c3aed";
}

function orgCardRoleClass(tier: "sic" | "supervisor" | "ccr" | "local" | "side" | "plant"): string {
  if (tier === "sic" || tier === "supervisor" || tier === "plant") return "text-violet-100";
  if (tier === "ccr") return "text-[#4c1d95]";
  return "text-slate-500";
}

function orgCardAvatarClass(tier: "sic" | "supervisor" | "ccr" | "local" | "side" | "plant"): string {
  if (tier === "sic" || tier === "supervisor" || tier === "plant") return "bg-white/15 text-white";
  if (tier === "ccr") return "bg-[#2e2044]/10 text-[#2e2044]";
  return "bg-violet-50 text-[#7c3aed]";
}

export function TreeConnector() {
  return (
    <div className="ops-org-connector" aria-hidden />
  );
}

function CardRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`ops-org-row-hover ops-org-tier-row ${className}`}
    >
      {children}
    </div>
  );
}

function layoutNodeKey(node: LayoutNode): string {
  return String(node.employee.empId || node.employee._id || "");
}

function flattenNodesByLevel(roots: LayoutNode[]): LayoutNode[][] {
  const levels: LayoutNode[][] = [];
  const seen = new Set<string>();

  const visit = (nodes: LayoutNode[], level: number) => {
    if (!nodes.length) return;
    const row: LayoutNode[] = [];
    const next: LayoutNode[] = [];

    nodes.forEach((node) => {
      const cluster = [node, ...node.siblingsAfter];
      cluster.forEach((n) => {
        const id = layoutNodeKey(n);
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        row.push(n);
        if (n.children.length) next.push(...n.children);
      });
    });

    if (row.length) levels[level] = [...(levels[level] || []), ...row];
    if (next.length) visit(next, level + 1);
  };

  visit(roots, 0);
  return levels.filter((l) => l.length > 0);
}

function collectDescendantsUnder(node: LayoutNode): LayoutNode[] {
  const out: LayoutNode[] = [];
  const stack = [...node.children, ...node.siblingsAfter];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.shift()!;
    const id = layoutNodeKey(n);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(n);
    stack.push(...n.children, ...n.siblingsAfter);
  }
  return out;
}

/** Split custom tree: tier rows above CCRs; every CCR across all levels gets a column. */
function partitionCustomLayout(roots: LayoutNode[]): {
  headerLevels: LayoutNode[][];
  ccrColumns: { ccr: LayoutNode; locals: LayoutNode[] }[];
} {
  const levels = flattenNodesByLevel(roots);
  const ccrNodes: LayoutNode[] = [];
  const ccrIds = new Set<string>();

  for (const level of levels) {
    for (const node of level) {
      const role = node.employee.role || "";
      if (!isCcrRole(role) && !isLabChemistRole(role)) continue;
      const id = layoutNodeKey(node);
      if (id && ccrIds.has(id)) continue;
      if (id) ccrIds.add(id);
      ccrNodes.push(node);
    }
  }

  if (!ccrNodes.length) {
    return { headerLevels: levels, ccrColumns: [] };
  }

  const underCcr = new Set<string>();
  const ccrColumns: { ccr: LayoutNode; locals: LayoutNode[] }[] = [];

  for (const node of ccrNodes) {
    const id = layoutNodeKey(node);
    if (id) underCcr.add(id);
    const locals = collectDescendantsUnder(node).filter(
      (n) => !isCcrRole(n.employee.role || "") && !isLabChemistRole(n.employee.role || "")
    );
    locals.forEach((n) => {
      const lid = layoutNodeKey(n);
      if (lid) underCcr.add(lid);
    });
    ccrColumns.push({ ccr: node, locals });
  }

  const headerLevels = levels
    .map((level) =>
      level.filter((n) => {
        const id = layoutNodeKey(n);
        const role = n.employee.role || "";
        if (underCcr.has(id)) return false;
        if (isCcrRole(role) || isLabChemistRole(role)) return false;
        if (isLocalOperatorRole(role) || isFieldOperatorRole(role)) return false;
        return true;
      })
    )
    .filter((l) => l.length > 0);

  return { headerLevels, ccrColumns };
}

function OrgChartSlotsRow({
  slots,
  card,
}: {
  slots: OrgChartSlot[];
  card: (
    emp: Employee,
    tier?: Parameters<typeof DirectoryCard>[0]["tier"],
    groupLabel?: string
  ) => React.ReactNode;
}) {
  const renderCcrBranch = (branch: OrgCcrBranch) => (
    <div
      key={String(branch.ccr.empId || branch.ccr._id || branch.ccr.name)}
      className="ops-org-ccr-branch-stack"
    >
      {card(branch.ccr, "ccr")}
      {branch.locals.length > 0 && (
        <>
          <TreeConnector />
          <div className="ops-org-ccr-locals">
            {branch.locals.map((local) => card(local, "local"))}
          </div>
        </>
      )}
    </div>
  );

  const renderLabBranch = (lab: NonNullable<OrgChartSlot["labBranch"]>) => (
    <div className="ops-org-general-lab-branch">
      {lab.chemists.map((chem) => card(chem, "ccr", "LAB"))}
      {lab.locals.length > 0 && (
        <>
          <TreeConnector />
          <div className="ops-org-general-lab-staff">
            {lab.locals.map((local) => card(local, "local", "LAB"))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="ops-org-ccr-scroll w-full min-w-0">
      <div className="ops-org-ccr-track ops-org-ccr-track--fixed ops-org-ccr-track--five">
        {slots.map((slot) => (
          <div
            key={slot.label}
            className="ops-org-ccr-column ops-org-ccr-column--fixed"
            aria-label={slot.label}
          >
            {slot.labBranch ? (
              renderLabBranch(slot.labBranch)
            ) : slot.ccrBranches.length > 0 || (slot.standaloneLocals?.length ?? 0) > 0 ? (
              <>
                {slot.ccrBranches.map(renderCcrBranch)}
                {slot.standaloneLocals?.map((local) => card(local, "local"))}
              </>
            ) : (
              <div className="ops-org-ccr-column-placeholder" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CcrBranchColumns({
  branches,
  layoutColumns,
  card,
  fixedColumns = true,
}: {
  branches?: OrgCcrBranch[];
  layoutColumns?: { ccr: LayoutNode; locals: LayoutNode[] }[];
  card: (
    emp: Employee,
    tier?: Parameters<typeof DirectoryCard>[0]["tier"],
    groupLabel?: string
  ) => React.ReactNode;
  /** When true, always render Group 1-2 | 3-4 | 5-6 slots (empty columns stay in place). */
  fixedColumns?: boolean;
}) {
  const renderBranch = (branch: OrgCcrBranch) => (
    <div
      key={String(branch.ccr.empId || branch.ccr._id || branch.ccr.name)}
      className="ops-org-ccr-branch-stack"
    >
      {card(branch.ccr, "ccr")}
      {branch.locals.length > 0 && (
        <>
          <TreeConnector />
          <div className="ops-org-ccr-locals">
            {branch.locals.map((local) => card(local, "local"))}
          </div>
        </>
      )}
    </div>
  );

  if (branches !== undefined) {
    if (fixedColumns) {
      const slots: OrgChartSlot[] = ORG_CHART_SLOT_LABELS.map((label) => ({
        label,
        ccrBranches: [],
      }));
      for (const branch of branches) {
        const slotIdx = orgChartSlotForCcr(branch.ccr);
        slots[slotIdx].ccrBranches.push(branch);
      }
      return <OrgChartSlotsRow slots={slots} card={card} />;
    }

    if (branches.length > 0) {
      return (
        <div className="ops-org-ccr-scroll w-full min-w-0">
          <div className="ops-org-ccr-track">
            {branches.map(renderBranch)}
          </div>
        </div>
      );
    }

    return null;
  }

  if (!layoutColumns?.length) return null;

  return (
    <div className="ops-org-ccr-scroll w-full min-w-0">
      <div className="ops-org-ccr-track">
        {layoutColumns.map(({ ccr, locals }) => (
          <div key={layoutNodeKey(ccr) || String(ccr.employee.name)} className="ops-org-ccr-column">
            {card(ccr.employee, "ccr", ccr.groupLabel)}
            {locals.length > 0 && (
              <>
                <TreeConnector />
                <div className="ops-org-ccr-locals">
                  {locals.map((local) =>
                    card(local.employee, tierForEmployee(local.employee), local.groupLabel)
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CrewTabBar({
  tabs,
  active,
  onChange,
  activeCrewKpi,
}: {
  tabs: StandardCrewTab[];
  active: StandardCrewTab;
  onChange: (crew: StandardCrewTab) => void;
  activeCrewKpi?: number | null;
}) {
  if (!tabs.length) return null;
  return (
    <div className="ops-org-crew-tabs" role="tablist" aria-label="Crew">
      {tabs.map((crew) => (
        <button
          key={crew}
          type="button"
          role="tab"
          aria-selected={active === crew}
          className={`ops-org-crew-tab ${active === crew ? "ops-org-crew-tab-active" : "hover:bg-violet-50"}`}
          onClick={() => onChange(crew)}
        >
          {crew === "General" ? "General" : `Crew ${crew}`}
          {active === crew && activeCrewKpi != null ? ` · ${activeCrewKpi}%` : ""}
        </button>
      ))}
    </div>
  );
}

export function PersonnelOrgChart({
  employees,
  loading,
  onSelect,
  onShiftReport,
  onEdit,
  currentEmpId,
  canShiftReport,
  activeCrew: controlledCrew,
  onActiveCrewChange,
  userCrew,
  viewAllCrews,
  orgLayouts,
  layoutEditable,
  onLayoutSaved,
}: {
  employees: Employee[];
  loading?: boolean;
  onSelect?: (e: Employee) => void;
  onShiftReport?: (e: Employee) => void;
  onEdit?: (e: Employee) => void;
  currentEmpId?: string;
  canShiftReport?: (e: Employee) => boolean;
  activeCrew?: StandardCrewTab;
  onActiveCrewChange?: (crew: StandardCrewTab) => void;
  /** Signed-in user's assigned crew — limits visible crew tabs unless viewAllCrews. */
  userCrew?: string | null;
  /** System super admin: show all crew tabs and allow switching. */
  viewAllCrews?: boolean;
  orgLayouts?: Record<string, SavedOrgLayout>;
  /** Super admin: drag cards on the live chart to set parent links. */
  layoutEditable?: boolean;
  onLayoutSaved?: () => void;
}) {
  const crewTabOptions = useMemo(
    () => (viewAllCrews ? { viewAllCrews: true as const } : undefined),
    [viewAllCrews]
  );
  const tabs = useMemo(
    () => visibleCrewTabsForUser(userCrew, employees, crewTabOptions),
    [userCrew, employees, crewTabOptions]
  );
  const [internalCrew, setInternalCrew] = useState<StandardCrewTab>(() =>
    defaultCrewTabForUser(employees, userCrew, crewTabOptions)
  );
  const activeCrew = useMemo(() => {
    if (controlledCrew !== undefined) return controlledCrew;
    if (tabs.length && !tabs.includes(internalCrew)) return tabs[0];
    return internalCrew;
  }, [controlledCrew, tabs, internalCrew]);
  const setActiveCrew = onActiveCrewChange ?? setInternalCrew;

  const tree = useMemo(
    () => (activeCrew ? buildCrewOrgTree(employees, activeCrew, orgLayouts?.[activeCrew]) : null),
    [employees, activeCrew, orgLayouts]
  );

  const [delegations, setDelegations] = useState<OrgOverlayDelegation[]>([]);
  useEffect(() => {
    if (!activeCrew) return;
    const today = new Date().toISOString().slice(0, 10);
    void rosterApi
      .getOrgOverlay({ date: today, crew: activeCrew })
      .then((res) => setDelegations(res.data?.delegations || []))
      .catch(() => setDelegations([]));
  }, [activeCrew, employees]);

  const delegationByAbsent = useMemo(() => {
    const map = new Map<string, OrgOverlayDelegation>();
    delegations.forEach((d) => {
      if (d.absentEmpId) map.set(d.absentEmpId, d);
    });
    return map;
  }, [delegations]);

  const delegationCoverFor = useMemo(() => {
    const map = new Map<string, OrgOverlayDelegation>();
    delegations.forEach((d) => {
      if (d.coverEmpId) map.set(d.coverEmpId, d);
    });
    return map;
  }, [delegations]);

  const { data: crewKpiData } = useCrewKpi(activeCrew, !!activeCrew);
  const kpiByMemberId = useMemo(() => {
    const map = new Map<string, CrewMemberKpi>();
    for (const m of crewKpiData?.members ?? []) {
      if (m.memberId) map.set(m.memberId, m);
    }
    return map;
  }, [crewKpiData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
        Loading org chart…
      </div>
    );
  }

  if (!employees.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
        No team members found.
      </div>
    );
  }

  return (
    <div className="ops-org-tree space-y-4">
      {tabs.length > 1 && (
        <CrewTabBar
          tabs={tabs}
          active={activeCrew}
          onChange={setActiveCrew}
          activeCrewKpi={crewKpiData?.crewKPI}
        />
      )}
      {tree && (
        <CrewDirectorySection
          key={`crew-org-${activeCrew}`}
          crew={activeCrew}
          tree={tree}
          employees={employees}
          orgLayouts={orgLayouts}
          layoutEditable={layoutEditable}
          onLayoutSaved={onLayoutSaved}
          onSelect={onSelect}
          onShiftReport={onShiftReport}
          onEdit={onEdit}
          currentEmpId={currentEmpId}
          canShiftReport={canShiftReport}
          crewKpi={crewKpiData?.crewKPI}
          kpiByMemberId={kpiByMemberId}
          delegationByAbsent={delegationByAbsent}
          delegationCoverFor={delegationCoverFor}
        />
      )}
    </div>
  );
}

function CrewDirectorySection({
  crew,
  tree: initialTree,
  employees,
  orgLayouts,
  layoutEditable,
  onLayoutSaved,
  onSelect,
  onShiftReport,
  onEdit,
  currentEmpId,
  canShiftReport,
  crewKpi,
  kpiByMemberId,
  delegationByAbsent,
  delegationCoverFor,
}: {
  crew: string;
  tree: CrewOrgTree;
  employees: Employee[];
  orgLayouts?: Record<string, SavedOrgLayout>;
  layoutEditable?: boolean;
  onLayoutSaved?: () => void;
  onSelect?: (e: Employee) => void;
  onShiftReport?: (e: Employee) => void;
  onEdit?: (e: Employee) => void;
  currentEmpId?: string;
  canShiftReport?: (e: Employee) => boolean;
  crewKpi?: number;
  kpiByMemberId?: Map<string, CrewMemberKpi>;
  delegationByAbsent?: Map<string, OrgOverlayDelegation>;
  delegationCoverFor?: Map<string, OrgOverlayDelegation>;
}) {
  const crewMembers = useMemo(() => filterEmployeesByCrew(employees, crew), [employees, crew]);
  const [editNodes, setEditNodes] = useState<OrgLayoutNode[]>([]);
  const [editReady, setEditReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragEmpId, setDragEmpId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const loadEditNodes = useCallback(async () => {
    if (!layoutEditable || !crewMembers.length) {
      setEditReady(false);
      return;
    }
    try {
      const res = await adminApi.getOrgLayout(crew);
      const data = res.data as SavedOrgLayout;
      const saved = data?.nodes ?? [];
      if (data?.manual && saved.length) {
        setEditNodes(repairCrewOpsLayoutNodes(crewMembers, mergeLayoutWithMembers(crewMembers, saved)));
      } else {
        setEditNodes(defaultOrgLayoutNodes(crewMembers));
      }
    } catch {
      setEditNodes(defaultOrgLayoutNodes(crewMembers));
    } finally {
      setEditReady(true);
    }
  }, [layoutEditable, crew, crewMembers]);

  useEffect(() => {
    setEditReady(false);
    setEditNodes([]);
    setDragEmpId(null);
    setDropTargetId(null);
    void loadEditNodes();
  }, [crew, loadEditNodes]);

  const tree = useMemo(() => {
    if (!layoutEditable || !editReady) return initialTree;
    const repaired = repairCrewOpsLayoutNodes(crewMembers, editNodes);
    return buildCrewOrgTree(employees, crew, {
      crewId: crew,
      manual: true,
      nodes: repaired,
    });
  }, [layoutEditable, editReady, initialTree, employees, crew, editNodes, crewMembers]);

  const handleDropParent = (childId: string, parentId: string) => {
    if (!childId || childId === parentId) return;
    const child = crewMembers.find((e) => empKey(e) === childId);
    const parent = crewMembers.find((e) => empKey(e) === parentId);
    if (!child || !parent) return;

    const childRole = child.role || "";
    const parentRole = parent.role || "";

    if (isCcrRole(childRole) && !isOperationsLeadRole(parentRole)) {
      toast.error("CCR operators must report to Shift in Charge or Supervisor.");
      return;
    }
    if (
      (isLocalOperatorRole(childRole) || isFieldOperatorRole(childRole)) &&
      !isCcrRole(parentRole) &&
      !isOperationsLeadRole(parentRole) &&
      !isLabChemistRole(parentRole)
    ) {
      toast.error("Local operators must report to a CCR, chemist, or operations lead.");
      return;
    }

    setEditNodes((prev) => {
      const updated = prev.map((n) => (n.empId === childId ? { ...n, parentEmpId: parentId } : n));
      return repairCrewOpsLayoutNodes(crewMembers, updated);
    });
    toast.success("Position updated — save to persist.");
  };

  const handleMoveNode = (empId: string, x: number, y: number) => {
    setEditNodes((prev) =>
      prev.map((n) => (n.empId === empId ? { ...n, x: Math.round(x), y: Math.round(y) } : n))
    );
  };

  const handleSaveLayout = async () => {
    const nodesToSave = repairCrewOpsLayoutNodes(crewMembers, editNodes);
    setSaving(true);
    try {
      await adminApi.patchOrgLayout(crew, { manual: true, nodes: nodesToSave });
      setEditNodes(nodesToSave);
      onLayoutSaved?.();
      toast.success(`Crew ${crew} org layout saved.`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to save org layout.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetLayout = async () => {
    if (!window.confirm(`Reset Crew ${crew} org chart to automatic role-based layout?`)) return;
    setSaving(true);
    try {
      await adminApi.resetOrgLayout(crew);
      setEditNodes(defaultOrgLayoutNodes(crewMembers));
      onLayoutSaved?.();
      toast.success("Org layout reset to automatic hierarchy.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || "Failed to reset org layout.");
    } finally {
      setSaving(false);
    }
  };

  const dutyBadge =
    tree.dutyLabel === "Day" ? (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
        Day shift
      </span>
    ) : tree.dutyLabel === "Night" ? (
      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-900">
        Night shift
      </span>
    ) : null;

  const cardProps = {
    onSelect,
    onShiftReport,
    onEdit,
    currentEmpId,
    canShiftReport,
    employees,
    kpiByMemberId,
    layoutEditable,
    dragEmpId,
    dropTargetId,
    onDragStart: layoutEditable ? setDragEmpId : undefined,
    onDragEnd: layoutEditable ? () => setDragEmpId(null) : undefined,
    onDragEnter: layoutEditable ? setDropTargetId : undefined,
    onDragLeave: layoutEditable ? () => setDropTargetId(null) : undefined,
    onDropParent: layoutEditable ? handleDropParent : undefined,
    delegationByAbsent,
    delegationCoverFor,
  };

  const useFlatLayout = normCrew(crew) === "General";

  return (
    <section className="ops-org-crew-section rounded-2xl border border-slate-200 bg-slate-50/50 p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
        <h2 className="text-base font-bold text-slate-800">
          {crew === "General" ? "General" : `Crew ${crew}`}
          {crewKpi != null && (
            <span className="ml-2 inline-flex align-middle">
              <KpiBadge score={crewKpi} size="md" />
            </span>
          )}
        </h2>
        {dutyBadge}
        {layoutEditable && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleResetLayout()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset auto
            </button>
            <button
              type="button"
              onClick={() => void handleSaveLayout()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save layout
            </button>
          </div>
        )}
      </div>

      {layoutEditable && (
        <p className="mb-4 text-xs text-violet-800">
          {useFlatLayout
            ? "Drag cards anywhere on the General crew canvas. Save persists positions per crew."
            : "Drag a card onto another to reposition it in the five-column org chart. Save persists per crew."}
        </p>
      )}

      <div className="ops-org-crew-body w-full min-w-0 overflow-x-auto overflow-y-visible">
        <AutoCrewOrgLayout
          tree={tree}
          crewMembers={crewMembers}
          layoutNodes={layoutEditable && editReady ? editNodes : orgLayouts?.[crew]?.nodes}
          useFlatLayout={useFlatLayout}
          onMoveNode={layoutEditable && useFlatLayout ? handleMoveNode : undefined}
          {...cardProps}
        />
      </div>
    </section>
  );
}

function GeneralFreeLayoutBoard({
  members,
  nodes,
  layoutEditable,
  card,
  onMoveNode,
}: {
  members: Employee[];
  nodes: OrgLayoutNode[];
  layoutEditable?: boolean;
  card: (
    emp: Employee,
    tier?: Parameters<typeof DirectoryCard>[0]["tier"],
    groupLabel?: string
  ) => React.ReactNode;
  onMoveNode?: (empId: string, x: number, y: number) => void;
}) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.empId, n])), [nodes]);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    empId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const positioned = useMemo(() => {
    return members.map((emp, index) => {
      const id = empKey(emp);
      const node = id ? nodeById.get(id) : undefined;
      const col = index % 4;
      const row = Math.floor(index / 4);
      return {
        emp,
        x: node?.x ?? 24 + col * 180,
        y: node?.y ?? 24 + row * 132,
      };
    });
  }, [members, nodeById]);

  const canvasHeight = useMemo(() => {
    const maxY = positioned.reduce((max, row) => Math.max(max, row.y), 0);
    return Math.max(320, maxY + 160);
  }, [positioned]);

  useEffect(() => {
    if (!dragging || !layoutEditable) return;

    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - dragging.offsetX;
      const y = e.clientY - rect.top - dragging.offsetY;
      onMoveNode?.(dragging.empId, Math.max(0, x), Math.max(0, y));
    };

    const onUp = () => setDragging(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, layoutEditable, onMoveNode]);

  return (
    <div
      ref={canvasRef}
      className="ops-org-general-free-canvas relative w-full min-w-[720px] rounded-xl border border-dashed border-violet-200 bg-white/70"
      style={{ minHeight: canvasHeight }}
    >
      {positioned.map(({ emp, x, y }) => {
        const id = empKey(emp);
        const draggable = layoutEditable && Boolean(id);
        return (
          <div
            key={id || emp.name}
            className={`absolute w-[168px] ${dragging?.empId === id ? "z-20 cursor-grabbing" : ""}`}
            style={{ left: x, top: y }}
            onMouseDown={
              draggable
                ? (e) => {
                    if (e.button !== 0) return;
                    const target = e.currentTarget;
                    const rect = target.getBoundingClientRect();
                    setDragging({
                      empId: id!,
                      offsetX: e.clientX - rect.left,
                      offsetY: e.clientY - rect.top,
                    });
                    e.preventDefault();
                  }
                : undefined
            }
          >
            {card(emp, tierForEmployee(emp))}
          </div>
        );
      })}
    </div>
  );
}

function GeneralCrewLayoutRows({
  roots,
  card,
}: {
  roots: LayoutNode[];
  card: (
    emp: Employee,
    tier?: Parameters<typeof DirectoryCard>[0]["tier"],
    groupLabel?: string
  ) => React.ReactNode;
}) {
  const root = roots.length === 1 ? roots[0] : null;
  const topLevel = root ? [root] : roots;
  const directChildren = root?.children ?? [];

  const renderDirectChild = (node: LayoutNode) => {
    const role = node.employee.role || "";
    if (isChiefChemistRole(role) && node.children.length > 0) {
      return (
        <div
          key={layoutNodeKey(node) || node.employee.name}
          className="ops-org-general-lab-branch"
        >
          {card(node.employee, tierForEmployee(node.employee), node.groupLabel)}
          <TreeConnector />
          <div className="ops-org-general-lab-staff">
            {node.children.map((chem) =>
              card(chem.employee, tierForEmployee(chem.employee), chem.groupLabel)
            )}
          </div>
        </div>
      );
    }
    return card(node.employee, tierForEmployee(node.employee), node.groupLabel);
  };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <CardRow>
        {topLevel.map((node) => card(node.employee, tierForEmployee(node.employee), node.groupLabel))}
      </CardRow>
      {directChildren.length > 0 && (
        <>
          <TreeConnector />
          <CardRow>{directChildren.map(renderDirectChild)}</CardRow>
        </>
      )}
    </div>
  );
}

/** Simple level-by-level layout (plant org) or CCR-column layout (crew view). */
export function LayoutTreeRows({
  roots,
  onSelect,
  onShiftReport,
  onEdit,
  currentEmpId,
  canShiftReport,
  kpiByMemberId,
  editorSlot,
  onCardClick,
  selectedEmpId,
  compact,
  useCcrColumns = true,
  flatGeneralStyle = false,
  layoutEditable,
  dragEmpId,
  dropTargetId,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDropParent,
}: {
  roots: LayoutNode[];
  onSelect?: (e: Employee) => void;
  onShiftReport?: (e: Employee) => void;
  onEdit?: (e: Employee) => void;
  currentEmpId?: string;
  canShiftReport?: (e: Employee) => boolean;
  kpiByMemberId?: Map<string, CrewMemberKpi>;
  editorSlot?: (emp: Employee) => React.ReactNode;
  onCardClick?: (e: Employee) => void;
  selectedEmpId?: string;
  compact?: boolean;
  useCcrColumns?: boolean;
  flatGeneralStyle?: boolean;
  layoutEditable?: boolean;
  dragEmpId?: string | null;
  dropTargetId?: string | null;
  onDragStart?: (empId: string) => void;
  onDragEnd?: () => void;
  onDragEnter?: (empId: string) => void;
  onDragLeave?: () => void;
  onDropParent?: (childId: string, parentId: string) => void;
}) {
  const cardDragProps = {
    layoutEditable,
    dragEmpId,
    dropTargetId,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDropParent,
  };
  const card = (emp: Employee, tier?: Parameters<typeof DirectoryCard>[0]["tier"], groupLabel?: string) => (
    <DirectoryCard
      key={emp.empId || emp._id}
      emp={emp}
      tier={tier}
      groupLabel={groupLabel}
      editorSlot={editorSlot}
      onCardClick={onCardClick}
      compact={compact}
      selected={selectedEmpId === emp.empId}
      {...cardDragProps}
      {...{ onSelect, onShiftReport, onEdit, currentEmpId, canShiftReport, kpiByMemberId }}
    />
  );

  if (!useCcrColumns || flatGeneralStyle) {
    const levels = flattenNodesByLevel(roots);
    return (
      <div className="flex w-full flex-col items-center gap-2">
        {levels.map((level, i) => (
          <React.Fragment key={i}>
            {i > 0 && <TreeConnector />}
            <CardRow>
              {level.map((entry) =>
                card(entry.employee, tierForEmployee(entry.employee), entry.groupLabel)
              )}
            </CardRow>
          </React.Fragment>
        ))}
      </div>
    );
  }

  const { headerLevels, ccrColumns } = partitionCustomLayout(roots);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {headerLevels.map((level, i) => (
        <React.Fragment key={i}>
          {i > 0 && <TreeConnector />}
          <CardRow>
            {level.map((entry) => card(entry.employee, tierForEmployee(entry.employee), entry.groupLabel))}
          </CardRow>
        </React.Fragment>
      ))}
      {ccrColumns.length > 0 && (
        <>
          {headerLevels.length > 0 && <TreeConnector />}
          <CcrBranchColumns layoutColumns={ccrColumns} card={card} fixedColumns={false} />
        </>
      )}
    </div>
  );
}

export function AutoCrewOrgLayout({
  tree,
  crewMembers,
  layoutNodes,
  onSelect,
  onShiftReport,
  onEdit,
  currentEmpId,
  canShiftReport,
  editorSlot,
  onCardClick,
  selectedEmpId,
  compact,
  kpiByMemberId,
  useFlatLayout = false,
  layoutEditable,
  dragEmpId,
  dropTargetId,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDropParent,
  onMoveNode,
  delegationByAbsent,
  delegationCoverFor,
}: {
  tree: CrewOrgTree;
  crewMembers: Employee[];
  layoutNodes?: OrgLayoutNode[];
  onSelect?: (e: Employee) => void;
  onShiftReport?: (e: Employee) => void;
  onEdit?: (e: Employee) => void;
  currentEmpId?: string;
  canShiftReport?: (e: Employee) => boolean;
  editorSlot?: (emp: Employee) => React.ReactNode;
  onCardClick?: (e: Employee) => void;
  selectedEmpId?: string;
  compact?: boolean;
  kpiByMemberId?: Map<string, CrewMemberKpi>;
  useFlatLayout?: boolean;
  layoutEditable?: boolean;
  dragEmpId?: string | null;
  dropTargetId?: string | null;
  onDragStart?: (empId: string) => void;
  onDragEnd?: () => void;
  onDragEnter?: (empId: string) => void;
  onDragLeave?: () => void;
  onDropParent?: (childId: string, parentId: string) => void;
  onMoveNode?: (empId: string, x: number, y: number) => void;
  delegationByAbsent?: Map<string, OrgOverlayDelegation>;
  delegationCoverFor?: Map<string, OrgOverlayDelegation>;
}) {
  const cardProps = {
    onSelect,
    onShiftReport,
    onEdit,
    currentEmpId,
    canShiftReport,
    editorSlot,
    onCardClick,
    compact,
    kpiByMemberId,
    layoutEditable,
    dragEmpId,
    dropTargetId,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDropParent,
  };
  const card = (emp: Employee, tier?: Parameters<typeof DirectoryCard>[0]["tier"], groupLabel?: string) => (
    <DirectoryCard
      key={emp.empId || emp._id}
      emp={emp}
      tier={tier}
      groupLabel={groupLabel}
      coverDelegation={emp.empId ? delegationCoverFor?.get(emp.empId) : undefined}
      absentDelegation={emp.empId ? delegationByAbsent?.get(emp.empId) : undefined}
      selected={selectedEmpId === emp.empId}
      {...cardProps}
    />
  );
  const hasHierarchy = tree.memberCount > 0 && tree.layoutNodes.length > 0;

  if (!hasHierarchy) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">No members in this crew.</p>
    );
  }

  if (useFlatLayout) {
    const freeNodes =
      layoutNodes?.length
        ? layoutNodes
        : layoutEditable
          ? defaultOrgLayoutNodes(crewMembers)
          : [];
    const useFreeCanvas = layoutEditable || (tree.customLayout && freeNodes.length > 0);
    if (useFreeCanvas) {
      return (
        <GeneralFreeLayoutBoard
          members={crewMembers}
          nodes={freeNodes}
          layoutEditable={layoutEditable}
          card={card}
          onMoveNode={onMoveNode}
        />
      );
    }
    return (
      <div className="flex w-full min-w-0 flex-col items-center gap-2">
        <GeneralCrewLayoutRows roots={tree.layoutNodes} card={card} />
      </div>
    );
  }

  return (
    <StandardCrewHierarchyLayout tree={tree} selectedEmpId={selectedEmpId} {...cardProps} />
  );
}

/** Role-based crew layout: leads, support roles, then fixed CCR columns with locals. */
function StandardCrewHierarchyLayout({
  tree,
  onSelect,
  onShiftReport,
  onEdit,
  currentEmpId,
  canShiftReport,
  editorSlot,
  onCardClick,
  selectedEmpId,
  compact,
  kpiByMemberId,
  layoutEditable,
  dragEmpId,
  dropTargetId,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDropParent,
}: {
  tree: CrewOrgTree;
  onSelect?: (e: Employee) => void;
  onShiftReport?: (e: Employee) => void;
  onEdit?: (e: Employee) => void;
  currentEmpId?: string;
  canShiftReport?: (e: Employee) => boolean;
  editorSlot?: (emp: Employee) => React.ReactNode;
  onCardClick?: (e: Employee) => void;
  selectedEmpId?: string;
  compact?: boolean;
  kpiByMemberId?: Map<string, CrewMemberKpi>;
  layoutEditable?: boolean;
  dragEmpId?: string | null;
  dropTargetId?: string | null;
  onDragStart?: (empId: string) => void;
  onDragEnd?: () => void;
  onDragEnter?: (empId: string) => void;
  onDragLeave?: () => void;
  onDropParent?: (childId: string, parentId: string) => void;
}) {
  const cardDragProps = {
    layoutEditable,
    dragEmpId,
    dropTargetId,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDropParent,
  };
  const card = (emp: Employee, tier?: Parameters<typeof DirectoryCard>[0]["tier"], groupLabel?: string) => (
    <DirectoryCard
      key={emp.empId || emp._id}
      emp={emp}
      tier={tier}
      groupLabel={groupLabel}
      editorSlot={editorSlot}
      onCardClick={onCardClick}
      compact={compact}
      selected={selectedEmpId === emp.empId}
      {...cardDragProps}
      {...{ onSelect, onShiftReport, onEdit, currentEmpId, canShiftReport, kpiByMemberId }}
    />
  );

  const extraLeads = [
    ...tree.sics.filter((e) => !tree.sic || e.empId !== tree.sic.empId),
    ...tree.supervisors.filter((e) => !tree.supervisor || e.empId !== tree.supervisor.empId),
  ];
  const supportRow = [...tree.sideColumn, ...tree.others, ...extraLeads];
  const hasTechnicalRow =
    tree.orgSlots.some(
      (s) => Boolean(s.labBranch?.chemists.length || s.labBranch?.locals.length) || s.ccrBranches.length > 0
    ) || tree.branches.length > 0;
  const hasBelowLead =
    Boolean(tree.supervisor) || supportRow.length > 0 || hasTechnicalRow;
  const hasBelowSupervisor = supportRow.length > 0 || hasTechnicalRow;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      {tree.sic && (
        <>
          <CardRow>{card(tree.sic, "sic")}</CardRow>
          {hasBelowLead && <TreeConnector />}
        </>
      )}
      {tree.supervisor && (
        <>
          <CardRow>{card(tree.supervisor, "supervisor")}</CardRow>
          {hasBelowSupervisor && <TreeConnector />}
        </>
      )}
      {!tree.sic && !tree.supervisor && supportRow.length > 0 && hasTechnicalRow && (
        <TreeConnector />
      )}
      {supportRow.length > 0 && (
        <>
          <CardRow>
            {supportRow.map((emp) => card(emp, tierForEmployee(emp)))}
          </CardRow>
          {hasTechnicalRow && <TreeConnector />}
        </>
      )}
      {hasTechnicalRow && (
        <div className="ops-org-technical-row w-full min-w-0">
          <OrgChartSlotsRow slots={tree.orgSlots} card={card} />
        </div>
      )}
    </div>
  );
}

function DirectoryCard({
  emp,
  tier,
  groupLabel,
  coverDelegation,
  absentDelegation,
  onSelect,
  onShiftReport,
  onEdit,
  currentEmpId,
  canShiftReport,
  editorSlot,
  compact,
  selected,
  onCardClick,
  kpiByMemberId,
  layoutEditable,
  dragEmpId,
  dropTargetId,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragLeave,
  onDropParent,
  shiftReportMode = "default",
  employees,
}: {
  emp: Employee;
  tier?: "sic" | "supervisor" | "ccr" | "local" | "side" | "plant";
  groupLabel?: string;
  coverDelegation?: OrgOverlayDelegation;
  absentDelegation?: OrgOverlayDelegation;
  onSelect?: (e: Employee) => void;
  onShiftReport?: (e: Employee) => void;
  onEdit?: (e: Employee) => void;
  currentEmpId?: string;
  canShiftReport?: (e: Employee) => boolean;
  editorSlot?: (emp: Employee) => React.ReactNode;
  compact?: boolean;
  selected?: boolean;
  onCardClick?: (e: Employee) => void;
  kpiByMemberId?: Map<string, CrewMemberKpi>;
  layoutEditable?: boolean;
  dragEmpId?: string | null;
  dropTargetId?: string | null;
  onDragStart?: (empId: string) => void;
  onDragEnd?: () => void;
  onDragEnter?: (empId: string) => void;
  onDragLeave?: () => void;
  onDropParent?: (childId: string, parentId: string) => void;
  /** Plant manager cards skip shift-report obligation. */
  shiftReportMode?: "default" | "hidden" | "review-only";
  employees?: Employee[];
}) {
  const ext = emp as Employee & { opsGroupLabel?: string };
  const label = groupLabel || ext.opsGroupLabel;
  const nameColor = getNameColor(emp.color);
  const isSelf = currentEmpId && emp.empId === currentEmpId;
  const plantLead = employees?.length ? isPlantLeadEmployee(emp, employees) : isPlantLeadEmployee(emp);
  const shiftReportAllowed =
    shiftReportMode === "hidden"
      ? false
      : shiftReportMode === "review-only"
        ? Boolean(onShiftReport && (!canShiftReport || canShiftReport(emp)))
        : !plantLead && (!canShiftReport || canShiftReport(emp));
  const showShiftReportButton =
    shiftReportMode !== "hidden" && Boolean(onShiftReport) && !plantLead;
  const resolvedTier = tier || tierForEmployee(emp);
  const tierClass = ORG_TIER_CARD_CLASS[resolvedTier];
  const isDarkTier = resolvedTier === "sic" || resolvedTier === "supervisor" || resolvedTier === "plant";
  const displayNameColor = orgCardNameColor(resolvedTier, nameColor);
  const roleTextClass = orgCardRoleClass(resolvedTier);
  const avatarClass = orgCardAvatarClass(resolvedTier);

  const handleCardClick = () => {
    if (onCardClick) {
      onCardClick(emp);
      return;
    }
    if (onShiftReport && shiftReportAllowed) {
      onShiftReport(emp);
      return;
    }
    onSelect?.(emp);
  };

  const memberId = String((emp as Employee & { _id?: string })._id || "");
  const memberKpi = memberId ? kpiByMemberId?.get(memberId) : undefined;
  const empId = String(emp.empId || "").trim();
  const isDragSource = layoutEditable && dragEmpId === empId;
  const isDropTarget = layoutEditable && dropTargetId === empId && dragEmpId && dragEmpId !== empId;

  const dragHandlers =
    layoutEditable && empId
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData("text/org-emp-id", empId);
            e.dataTransfer.effectAllowed = "move";
            onDragStart?.(empId);
          },
          onDragEnd: () => onDragEnd?.(),
          onDragOver: (e: React.DragEvent) => {
            if (!dragEmpId || dragEmpId === empId) return;
            e.preventDefault();
            onDragEnter?.(empId);
          },
          onDragLeave: () => onDragLeave?.(),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const childId = e.dataTransfer.getData("text/org-emp-id") || dragEmpId || "";
            if (childId && childId !== empId) onDropParent?.(childId, empId);
            onDragEnd?.();
          },
        }
      : {};

  if (compact) {
    return (
      <div
        className={`ops-org-card-wrap ops-org-card-wrap--compact group relative flex flex-col items-stretch ${
          selected ? "ops-org-card-selected rounded-xl" : ""
        } ${isDragSource ? "ops-org-card-dragging" : ""} ${isDropTarget ? "ops-org-card-drop-target" : ""}`}
        data-org-card-id={empId || undefined}
        {...dragHandlers}
      >
        <KpiMemberBadge
          memberId={memberId || undefined}
          empId={emp.empId}
          crew={emp.crew}
          prefetched={memberKpi}
        />
        <button
          type="button"
          onClick={handleCardClick}
          className={`${tierClass} px-3 py-2 hover:shadow-md ${selected ? "ops-org-card-selected" : ""}`}
        >
          <span
            className="ops-org-card-name block text-sm font-semibold inline-flex items-center gap-1 flex-wrap"
            style={{ color: displayNameColor }}
          >
            {emp.name}
            {(emp as Employee).isERT ? <ErtBadge /> : null}
          </span>
          <span className={`ops-org-card-role ops-org-role mt-0.5 block text-[10px] ${roleTextClass}`}>
            {emp.role}
          </span>
          {label && (
            <span
              className={`ops-org-card-name mt-0.5 block text-[10px] font-semibold ${isDarkTier ? "text-violet-200" : "text-violet-600"}`}
            >
              {label}
            </span>
          )}
          {coverDelegation && (
            <ActingBadge
              roleLabel={coverDelegation.roleLabel || emp.role || "role"}
              absentName={coverDelegation.absentName}
              className="mt-1"
            />
          )}
          {absentDelegation && (
            <span className="mt-1 block text-[9px] font-semibold text-amber-700">
              Cover: {absentDelegation.coverName}
            </span>
          )}
        </button>
        {editorSlot?.(emp)}
      </div>
    );
  }

  return (
    <div
      className={`ops-org-card-wrap group relative flex flex-col ${tierClass} hover:shadow-md ${
        isSelf ? "ring-2 ring-[#9273DA]/40" : ""
      } ${selected ? "ops-org-card-selected" : ""} ${isDragSource ? "ops-org-card-dragging" : ""} ${
        isDropTarget ? "ops-org-card-drop-target" : ""
      }`}
      data-org-card-id={empId || undefined}
      {...dragHandlers}
    >
      <KpiMemberBadge
        memberId={memberId || undefined}
        empId={emp.empId}
        crew={emp.crew}
        prefetched={memberKpi}
      />
      <button
        type="button"
        onClick={handleCardClick}
        className="flex min-h-0 w-full flex-1 items-start gap-2 overflow-hidden px-3 py-2.5 text-left"
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarClass}`}
        >
          {initials(emp.name || "")}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="ops-org-card-name text-sm font-semibold"
            style={{ color: displayNameColor }}
          >
            <span className="inline-flex items-center gap-1 flex-wrap">
              {emp.name}
              {(emp as Employee).isERT ? <ErtBadge /> : null}
            </span>
          </p>
          <p className={`ops-org-card-role ops-org-role text-xs ${roleTextClass}`}>
            {emp.role}
          </p>
          {label && (
            <p className={`mt-0.5 truncate text-[10px] font-semibold ${isDarkTier ? "text-violet-200" : "text-violet-600"}`}>
              {label}
            </p>
          )}
          {coverDelegation && (
            <div className="mt-1">
              <ActingBadge
                roleLabel={coverDelegation.roleLabel || emp.role || "role"}
                absentName={coverDelegation.absentName}
              />
            </div>
          )}
          {absentDelegation && (
            <p className="mt-1 text-[10px] font-semibold text-amber-700">
              Cover: {absentDelegation.coverName}
            </p>
          )}
          {emp.empId && (
            <p
              className={`mt-0.5 truncate font-mono text-[11px] font-semibold ${
                isDarkTier
                  ? "text-[#D2F050] bg-white/10 rounded px-1.5 py-0.5 inline-block"
                  : "text-[#2E2044] bg-[#D2F050]/30 rounded px-1.5 py-0.5 inline-block"
              }`}
            >
              ID {emp.empId}
            </p>
          )}
        </div>
        <CreditCard className={`mt-1 h-4 w-4 shrink-0 ${isDarkTier ? "text-white/40" : "text-slate-300"}`} aria-hidden />
      </button>

      {(showShiftReportButton || onEdit) && (
        <div className={`flex items-center justify-end gap-1 border-t px-2 py-1.5 ${isDarkTier ? "border-white/15" : "border-slate-100"}`}>
          {showShiftReportButton && (
            <button
              type="button"
              title={
                shiftReportMode === "review-only"
                  ? "Review shift report"
                  : shiftReportAllowed
                    ? "Shift report"
                    : "Shift report (no access)"
              }
              disabled={!shiftReportAllowed}
              onClick={(e) => {
                e.stopPropagation();
                if (shiftReportAllowed) onShiftReport?.(emp);
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                shiftReportAllowed
                  ? isDarkTier
                    ? "text-violet-100 hover:bg-white/10"
                    : "text-violet-700 hover:bg-violet-50"
                  : isDarkTier
                    ? "cursor-not-allowed text-white/35"
                    : "cursor-not-allowed text-slate-400 opacity-60"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Shift report
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              title="Edit personnel"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(emp);
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                isDarkTier ? "text-white/80 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      )}

      {editorSlot?.(emp)}
    </div>
  );
}

export { DirectoryCard as OrgDirectoryCard };
