import { adminApi } from "@/lib/api";
import {
  filterEmployeesByCrew,
  normCrew,
  repairCrewOpsLayoutNodes,
  sanitizeCrewOpsLayoutNodes,
  type SavedOrgLayout,
  type StandardCrewTab,
} from "@/lib/personnelOrg";
import type { Employee } from "@/components/calendar/roster-card-view";

const OPS_CREW_TABS: StandardCrewTab[] = ["A", "B", "C", "D"];

export async function fetchOrgLayoutForCrew(
  crew: StandardCrewTab | string
): Promise<SavedOrgLayout | null> {
  try {
    const res = await adminApi.getOrgLayout(crew);
    const data = res.data as SavedOrgLayout;
    if (data?.manual && data.nodes?.length) {
      return { ...data, crewId: normCrew(crew) };
    }
  } catch {
    /* ignore missing layouts */
  }
  return null;
}

export async function fetchOrgLayoutsForCrews(
  crews: StandardCrewTab[]
): Promise<Record<string, SavedOrgLayout>> {
  const out: Record<string, SavedOrgLayout> = {};
  await Promise.all(
    crews.map(async (crew) => {
      const layout = await fetchOrgLayoutForCrew(crew);
      if (layout) out[normCrew(crew)] = layout;
    })
  );
  return out;
}

/** Repair ops-crew saved layouts in memory (CCR parents, GDP chain). */
export function repairOrgLayoutsInMemory(
  employees: Employee[],
  layouts: Record<string, SavedOrgLayout>
): Record<string, SavedOrgLayout> {
  const next: Record<string, SavedOrgLayout> = { ...layouts };
  for (const crew of OPS_CREW_TABS) {
    const saved = next[crew];
    if (!saved?.nodes?.length) continue;
    const members = filterEmployeesByCrew(employees, crew);
    if (!members.length) continue;
    const { nodes } = sanitizeCrewOpsLayoutNodes(members, saved.nodes);
    next[crew] = { ...saved, crewId: crew, nodes };
  }
  return next;
}

/** Super-admin: repair invalid crew layouts and persist when parent links changed. */
export async function autoRepairAndPersistCrewOrgLayouts(
  employees: Employee[],
  layouts: Record<string, SavedOrgLayout>
): Promise<Record<string, SavedOrgLayout>> {
  const repaired = repairOrgLayoutsInMemory(employees, layouts);
  await Promise.all(
    OPS_CREW_TABS.map(async (crew) => {
      const before = layouts[crew];
      const after = repaired[crew];
      if (!before?.nodes?.length || !after?.nodes?.length) return;
      const members = filterEmployeesByCrew(employees, crew);
      const sanitized = sanitizeCrewOpsLayoutNodes(members, before.nodes);
      if (!sanitized.changed) return;
      try {
        await adminApi.patchOrgLayout(crew, {
          manual: after.manual !== false,
          nodes: repairCrewOpsLayoutNodes(members, after.nodes),
        });
      } catch {
        /* non-fatal — in-memory repair still applied */
      }
    })
  );
  return repaired;
}
