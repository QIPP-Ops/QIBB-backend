import { describe, expect, test } from "vitest";
import type { Employee } from "@/components/calendar/roster-card-view";
import {
  buildCrewOrgTree,
  buildOrgChartSlots,
  buildOrgChartSlotsFromLayout,
  appendUnplacedMembersToLayout,
  buildGeneralCrewLayoutNodes,
  buildLayoutNodesFromSavedLayout,
  buildPlantOrgTree,
  countCcrInOrgTree,
  empKey,
  filterEmployeesByCrew,
  findPlantLead,
  isFieldOperatorRole,
  isLabChemistRole,
  isPlantLeadEmployee,
  isValidCrewOpsLayout,
  isValidGeneralFlatLayout,
  mergePersonnelPlacementsIntoOrgLayout,
  parentEmpIdFromPersonnelPlacement,
  patchOrgLayoutNodeForEmployee,
  reconcilePersonnelPlacementFields,
  normCrew,
  defaultCrewTabForUser,
  visibleCrewTabsForUser,
  repairCrewOpsLayoutNodes,
  sanitizeCrewOpsLayoutNodes,
  savedLayoutHasGdpCcrParentChain,
  tierForEmployee,
  type LayoutNode,
} from "@/lib/personnelOrg";

function emp(partial: Partial<Employee> & Pick<Employee, "_id" | "name">): Employee {
  return {
    empId: partial.empId ?? partial._id,
    crew: "A",
    role: "Local Operator Group 1-2",
    ...partial,
  };
}

function walkLayout(nodes: LayoutNode[], visit: (node: LayoutNode, parent: LayoutNode | null) => void) {
  const step = (list: LayoutNode[], parent: LayoutNode | null) => {
    for (const node of list) {
      visit(node, parent);
      step(node.children, node);
      step(node.siblingsAfter, parent);
    }
  };
  step(nodes, null);
}

function findLayoutNode(nodes: LayoutNode[], id: string): LayoutNode | null {
  let found: LayoutNode | null = null;
  walkLayout(nodes, (node) => {
    if (empKey(node.employee) === id) found = node;
  });
  return found;
}

function layoutParentId(nodes: LayoutNode[], childId: string): string | null {
  let parentId: string | null = null;
  walkLayout(nodes, (node, parent) => {
    if (empKey(node.employee) === childId && parent) {
      parentId = empKey(parent.employee);
    }
  });
  return parentId;
}

function collectEmpIds(nodes: LayoutNode[]): string[] {
  const ids: string[] = [];
  walkLayout(nodes, (node) => {
    const id = empKey(node.employee);
    if (id) ids.push(id);
  });
  return ids;
}

describe("normCrew", () => {
  test("normalizes crew tab labels and stored values", () => {
    expect(normCrew("A")).toBe("A");
    expect(normCrew("Crew A")).toBe("A");
    expect(normCrew("crew a")).toBe("A");
    expect(normCrew("CREW D")).toBe("D");
    expect(normCrew("General")).toBe("General");
    expect(normCrew("G")).toBe("General");
  });
});

describe("visibleCrewTabsForUser", () => {
  test("returns only the user's assigned crew tab", () => {
    expect(visibleCrewTabsForUser("B")).toEqual(["B"]);
    expect(visibleCrewTabsForUser("Crew A")).toEqual(["A"]);
    expect(visibleCrewTabsForUser("General")).toEqual(["General"]);
  });

  test("super admin sees all standard crew tabs", () => {
    expect(visibleCrewTabsForUser("B", [], { viewAllCrews: true })).toEqual([
      "A",
      "B",
      "C",
      "D",
      "General",
    ]);
  });

  test("falls back to on-duty crew when user has no crew", () => {
    const tabs = visibleCrewTabsForUser(undefined, [
      emp({ _id: "1", name: "A1", crew: "A" }),
    ]);
    expect(tabs).toHaveLength(1);
    expect(["A", "B", "C", "D", "General"]).toContain(tabs[0]);
  });
});

describe("defaultCrewTabForUser", () => {
  test("prefers profile crew over on-duty default", () => {
    expect(defaultCrewTabForUser([], "D")).toBe("D");
    expect(defaultCrewTabForUser([], "Crew C")).toBe("C");
  });

  test("super admin defaults to on-duty crew, not profile crew", () => {
    const employees = [emp({ _id: "1", name: "A1", crew: "A" })];
    const tab = defaultCrewTabForUser(employees, "D", { viewAllCrews: true });
    expect(["A", "B", "C", "D", "General"]).toContain(tab);
    expect(tab).not.toBe("D");
  });
});

describe("filterEmployeesByCrew", () => {
  const roster = [
    emp({ _id: "1", name: "A1", crew: "A" }),
    emp({ _id: "2", name: "A2", crew: "Crew A" }),
    emp({ _id: "3", name: "D1", crew: "D" }),
    emp({ _id: "4", name: "D2", crew: "Crew D" }),
    emp({ _id: "5", name: "B1", crew: "B" }),
  ];

  test("matches letter and Crew-prefixed crew fields", () => {
    expect(filterEmployeesByCrew(roster, "A")).toHaveLength(2);
    expect(filterEmployeesByCrew(roster, "D")).toHaveLength(2);
    expect(filterEmployeesByCrew(roster, "B")).toHaveLength(1);
  });
});

describe("buildCrewOrgTree — role-based hierarchy", () => {
  test("opsGroupLabel alone still builds rule-based layout", () => {
    const roster = [
      emp({
        _id: "sic",
        empId: "sic",
        name: "SIC",
        role: "Shift in Charge Engineer",
        opsGroupLabel: "group 1-2",
      }),
      emp({
        _id: "ccr",
        empId: "ccr",
        name: "CCR",
        role: "CCR Operator Group 1-2",
        opsGroupLabel: "group 1-2",
      }),
    ];
    const tree = buildCrewOrgTree(roster, "A");
    expect(tree.customLayout).toBe(false);
    expect(tree.layoutNodes.length).toBeGreaterThan(0);
    expect(layoutParentId(tree.layoutNodes, "ccr")).toBe("sic");
  });

  test("Crew A with 4+ CCRs all appear under supervisor when SIC and supervisor exist", () => {
    const roster = [
      emp({ _id: "sic", empId: "10", name: "SIC A", crew: "A", role: "Shift in Charge Engineer" }),
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "A", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "202", name: "CCR 2", crew: "A", role: "CCR Operator Group 3-4" }),
      emp({ _id: "ccr3", empId: "203", name: "CCR 3", crew: "A", role: "CCR Operator Group 5-6" }),
      emp({ _id: "ccr4", empId: "204", name: "CCR 4", crew: "A", role: "CCR Operator Group 1-2" }),
    ];
    const tree = buildCrewOrgTree(roster, "A");
    expect(countCcrInOrgTree(tree)).toBe(4);
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "202")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "203")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "204")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "100")).toBe("10");
  });

  test("no supervisor — CCRs attach under SIC; locals attach under matching CCR", () => {
    const roster = [
      emp({ _id: "sic", empId: "10", name: "SIC A", crew: "A", role: "Shift in Charge Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "A", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "202", name: "CCR 2", crew: "A", role: "CCR Operator Group 3-4" }),
      emp({ _id: "loc1", empId: "301", name: "Local 1", crew: "A", role: "Local Operator Group 1-2" }),
      emp({ _id: "loc2", empId: "302", name: "Local 2", crew: "A", role: "Local Operator Group 3-4" }),
    ];
    const tree = buildCrewOrgTree(roster, "A");
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("10");
    expect(layoutParentId(tree.layoutNodes, "202")).toBe("10");
    expect(layoutParentId(tree.layoutNodes, "301")).toBe("201");
    expect(layoutParentId(tree.layoutNodes, "302")).toBe("202");
  });

  test("locals pair to CCR by assignedTo when set", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "A", role: "CCR Operator Group 5-6" }),
      emp({
        _id: "loc1",
        empId: "301",
        name: "Local 1",
        crew: "A",
        role: "Local Operator Group 1-2",
        assignedTo: "201",
      }),
    ];
    const tree = buildCrewOrgTree(roster, "A");
    expect(layoutParentId(tree.layoutNodes, "301")).toBe("201");
  });

  test("no SIC — supervisor is root with CCRs and locals as children", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "A", role: "CCR Operator Group 1-2" }),
      emp({ _id: "loc1", empId: "301", name: "Local 1", crew: "A", role: "Local Operator Group 1-2" }),
    ];
    const tree = buildCrewOrgTree(roster, "A");
    expect(tree.layoutNodes).toHaveLength(1);
    expect(empKey(tree.layoutNodes[0].employee)).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "301")).toBe("201");
  });

  test("invalid CCR-to-CCR saved layout is repaired to operations lead", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({
        _id: "ccr1",
        empId: "201",
        name: "CCR root in editor",
        crew: "A",
        role: "CCR Operator Group 5-6",
      }),
      emp({
        _id: "ccr2",
        empId: "202",
        name: "CCR child",
        crew: "A",
        role: "CCR Operator Group 3-4",
      }),
    ];
    const saved = {
      crewId: "A",
      manual: true,
      nodes: [
        { empId: "100", parentEmpId: "", order: 0 },
        { empId: "201", parentEmpId: "100", order: 1 },
        { empId: "202", parentEmpId: "201", order: 2 },
      ],
    };
    expect(isValidCrewOpsLayout(roster, saved.nodes)).toBe(false);
    const tree = buildCrewOrgTree(roster, "A", saved);
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "202")).toBe("100");
  });

  test("valid manual saved layout keeps CCRs under operations lead", () => {
    const roster = [
      emp({ _id: "sic", empId: "10", name: "SIC A", crew: "A", role: "Shift in Charge Engineer" }),
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "A", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "202", name: "CCR 2", crew: "A", role: "CCR Operator Group 3-4" }),
    ];
    const saved = {
      crewId: "A",
      manual: true,
      nodes: [
        { empId: "10", parentEmpId: "", order: 0 },
        { empId: "100", parentEmpId: "10", order: 1 },
        { empId: "202", parentEmpId: "100", order: 2 },
        { empId: "201", parentEmpId: "100", order: 3 },
      ],
    };
    const tree = buildCrewOrgTree(roster, "A", saved);
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "202")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "100")).toBe("10");
  });

  test("manual parent chemist renders local child under chemist", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "C", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "C", role: "CCR Operator Group 1-2" }),
      emp({ _id: "chem", empId: "401", name: "Qasem Ahmed", crew: "C", role: "Chemist" }),
      emp({
        _id: "loc",
        empId: "501",
        name: "Saud Saad",
        crew: "C",
        role: "Local Operator Group 1-2",
        assignedTo: "",
      }),
    ];
    const saved = {
      crewId: "C",
      manual: true,
      nodes: [
        { empId: "100", parentEmpId: "", order: 0 },
        { empId: "201", parentEmpId: "100", order: 1 },
        { empId: "401", parentEmpId: "100", order: 2 },
        { empId: "501", parentEmpId: "401", order: 3 },
      ],
    };
    const tree = buildCrewOrgTree(roster, "C", saved);
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "501")).toBe("401");
    expect(layoutParentId(tree.layoutNodes, "501")).not.toBe("201");
  });

  test("saved layout local-under-chemist not overwritten by auto CCR group matching", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "C", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1-2", crew: "C", role: "CCR Operator Group 1-2" }),
      emp({ _id: "chem", empId: "401", name: "Chemist", crew: "C", role: "Chemist" }),
      emp({
        _id: "loc",
        empId: "501",
        name: "Local 1-2",
        crew: "C",
        role: "Local Operator Group 1-2",
      }),
    ];
    const autoTree = buildCrewOrgTree(roster, "C");
    expect(layoutParentId(autoTree.layoutNodes, "501")).toBe("201");

    const saved = {
      crewId: "C",
      manual: true,
      nodes: [
        { empId: "100", parentEmpId: "", order: 0 },
        { empId: "201", parentEmpId: "100", order: 1 },
        { empId: "401", parentEmpId: "100", order: 2 },
        { empId: "501", parentEmpId: "401", order: 3 },
      ],
    };
    const tree = buildCrewOrgTree(roster, "C", saved);
    expect(layoutParentId(tree.layoutNodes, "501")).toBe("401");
  });

  test("personnel placement fields sync to org layout patch", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "C", role: "Supervisor Engineer" }),
      emp({ _id: "chem", empId: "401", name: "Chemist", crew: "C", role: "Chemist" }),
      emp({
        _id: "loc",
        empId: "501",
        name: "Saud",
        crew: "C",
        role: "Local Operator",
        opsTreeParentEmpId: "401",
        opsTreeRelation: "child",
        assignedTo: "",
      }),
    ];
    const patched = patchOrgLayoutNodeForEmployee(roster, [], roster[2], "401");
    expect(patched.find((n) => n.empId === "501")?.parentEmpId).toBe("401");
    const tree = buildCrewOrgTree(roster, "C");
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "501")).toBe("401");
  });

  test("reconcile clears CCR assignment when relative to chemist", () => {
    const roster = [
      emp({ _id: "ccr", empId: "201", name: "CCR", crew: "C", role: "CCR Operator" }),
      emp({ _id: "chem", empId: "401", name: "Chemist", crew: "C", role: "Chemist" }),
    ];
    const out = reconcilePersonnelPlacementFields(
      "Local Operator",
      "401",
      "child",
      "201",
      roster
    );
    expect(out.assignedTo).toBe("");
    expect(out.opsTreeParentEmpId).toBe("401");
  });

  test("reconcile sets relative to CCR when assignedTo CCR is chosen", () => {
    const roster = [
      emp({ _id: "ccr", empId: "201", name: "CCR", crew: "C", role: "CCR Operator" }),
    ];
    const out = reconcilePersonnelPlacementFields(
      "Local Operator",
      "",
      "root",
      "201",
      roster
    );
    expect(out.opsTreeParentEmpId).toBe("201");
    expect(out.opsTreeRelation).toBe("child");
  });

  test("field operators are treated as local operators under CCR", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "D", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "D", role: "CCR Operator Group 1-2" }),
      emp({ _id: "field1", empId: "301", name: "Field Op", crew: "D", role: "Field Operator Group 1-2" }),
    ];
    expect(isFieldOperatorRole("Field Operator Group 1-2")).toBe(true);
    const tree = buildCrewOrgTree(roster, "D");
    expect(layoutParentId(tree.layoutNodes, "301")).toBe("201");
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
  });

  test("buildLayoutNodesFromSavedLayout builds parent links", () => {
    const roster = [
      emp({ _id: "a", empId: "1", name: "Root", crew: "A", role: "Shift in Charge Engineer" }),
      emp({ _id: "b", empId: "2", name: "Child", crew: "A", role: "CCR Operator Group 1-2" }),
    ];
    const nodes = buildLayoutNodesFromSavedLayout(roster, [
      { empId: "1", parentEmpId: "" },
      { empId: "2", parentEmpId: "1" },
    ]);
    expect(nodes).toHaveLength(1);
    expect(empKey(nodes![0].employee)).toBe("1");
    expect(nodes![0].children).toHaveLength(1);
    expect(empKey(nodes![0].children[0].employee)).toBe("2");
  });

  test("Crew B with many CCR operators includes every CCR in layout", () => {
    const roster = Array.from({ length: 6 }, (_, i) =>
      emp({
        _id: `b-ccr-${i}`,
        empId: `30${i}`,
        name: `B CCR ${i + 1}`,
        crew: "B",
        role: `CCR Operator Group ${i % 2 === 0 ? "1-2" : "3-4"}`,
      })
    );
    const tree = buildCrewOrgTree(roster, "B");
    expect(countCcrInOrgTree(tree)).toBe(6);
    expect(collectEmpIds(tree.layoutNodes).filter((id) => id.startsWith("30")).length).toBe(6);
  });

  test("orphan local operators attach under a CCR branch", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "D", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "D", role: "CCR Operator Group 5-6" }),
      emp({ _id: "field1", empId: "301", name: "Field Op", crew: "D", role: "Field Operator Group 9-10" }),
    ];
    const tree = buildCrewOrgTree(roster, "D");
    expect(layoutParentId(tree.layoutNodes, "301")).toBe("201");
  });

  test("locals without any CCR still appear in Extra column", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "loc1", empId: "301", name: "Local 1", crew: "A", role: "Local Operator Group 9-10" }),
      emp({ _id: "loc2", empId: "302", name: "Local 2", crew: "A", role: "Field Operator Group 11-12" }),
    ];
    const slots = buildOrgChartSlots(roster);
    const extra = slots.find((s) => s.label === "Extra");
    expect(extra?.standaloneLocals?.map((e) => e.empId).sort()).toEqual(["301", "302"]);
    const tree = buildCrewOrgTree(roster, "A");
    expect(collectEmpIds(tree.layoutNodes).sort()).toEqual(["100", "301", "302"]);
  });

  test("saved layout includes members missing from stored nodes", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "C", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "C", role: "CCR Operator Group 1-2" }),
      emp({ _id: "loc1", empId: "301", name: "Local 1", crew: "C", role: "Local Operator Group 1-2" }),
    ];
    const saved = {
      crewId: "C",
      manual: true,
      nodes: [
        { empId: "100", parentEmpId: "", order: 0 },
        { empId: "201", parentEmpId: "100", order: 1 },
      ],
    };
    const tree = buildCrewOrgTree(roster, "C", saved);
    expect(collectEmpIds(tree.layoutNodes).sort()).toEqual(["100", "201", "301"]);
  });

  test("manual layout slots follow parent links for locals", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "B", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1-2", crew: "B", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "202", name: "CCR 3-4", crew: "B", role: "CCR Operator Group 3-4" }),
      emp({ _id: "loc1", empId: "301", name: "Local 1-2", crew: "B", role: "Local Operator Group 1-2" }),
    ];
    const saved = {
      crewId: "B",
      manual: true,
      nodes: [
        { empId: "100", parentEmpId: "", order: 0 },
        { empId: "201", parentEmpId: "100", order: 1 },
        { empId: "202", parentEmpId: "100", order: 2 },
        { empId: "301", parentEmpId: "202", order: 3 },
      ],
    };
    const tree = buildCrewOrgTree(roster, "B", saved);
    const col34 = tree.orgSlots.find((s) => s.label === "3-4");
    expect(col34?.ccrBranches[0]?.locals.map((e) => e.empId)).toEqual(["301"]);
    expect(tree.orgSlots[1].ccrBranches[0]?.locals ?? []).toEqual([]);
  });

  test("supervisor auto-promotes to level 1 when no SIC", () => {
    const roster = [
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "A", role: "CCR Operator Group 1-2" }),
    ];
    const tree = buildCrewOrgTree(roster, "A");
    expect(tree.sic).toBeNull();
    expect(tree.supervisor?.empId).toBe("100");
    expect(tree.layoutNodes).toHaveLength(1);
    expect(empKey(tree.layoutNodes[0].employee)).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
  });

  test("ops crew uses five org chart columns including LAB", () => {
    const roster = [
      emp({ _id: "sic", empId: "10", name: "SIC", crew: "B", role: "Shift in Charge Engineer" }),
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "B", role: "Supervisor Engineer" }),
      emp({ _id: "chem", empId: "401", name: "Chemist", crew: "B", role: "Chemist" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1-2", crew: "B", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "202", name: "CCR 3-4", crew: "B", role: "CCR Operator Group 3-4" }),
      emp({ _id: "loc1", empId: "301", name: "Local 1-2", crew: "B", role: "Local Operator Group 1-2" }),
    ];
    const tree = buildCrewOrgTree(roster, "B");
    expect(tree.orgSlots).toHaveLength(5);
    expect(tree.orgSlots[0].label).toBe("LAB");
    expect(tree.orgSlots[0].labBranch?.chemists).toHaveLength(1);
    expect(tree.orgSlots[1].ccrBranches).toHaveLength(1);
    expect(tree.orgSlots[2].ccrBranches).toHaveLength(1);
    expect(layoutParentId(tree.layoutNodes, "201")).toBe("100");
    expect(layoutParentId(tree.layoutNodes, "100")).toBe("10");
  });

  test("General crew org slots stay empty — flat plant layout unchanged", () => {
    const roster = [
      emp({ _id: "bandar", empId: "1", name: "Bandar Aldogaish", crew: "General", role: "Plant Manager" }),
      emp({ _id: "chem", empId: "6", name: "Alvin", crew: "General", role: "Chemist" }),
    ];
    const tree = buildCrewOrgTree(roster, "General");
    expect(tree.orgSlots).toEqual([]);
  });

  test("Crew B chemists are tracked on the CCR technical row", () => {
    const roster = [
      emp({ _id: "sic", empId: "10", name: "SIC B", crew: "B", role: "Shift in Charge Engineer" }),
      emp({ _id: "sup", empId: "100", name: "Supervisor", crew: "B", role: "Supervisor Engineer" }),
      emp({ _id: "ccr1", empId: "201", name: "CCR 1", crew: "B", role: "CCR Operator Group 1-2" }),
      emp({ _id: "chem1", empId: "401", name: "Mukhtar Ali", crew: "B", role: "Chemist" }),
      emp({ _id: "chem2", empId: "402", name: "Mohamed Nawas", crew: "B", role: "Chemist" }),
    ];
    const tree = buildCrewOrgTree(roster, "B");
    expect(tree.chemists).toHaveLength(2);
    expect(tree.chemists.map((c) => c.name).sort()).toEqual(["Mohamed Nawas", "Mukhtar Ali"]);
    expect(tree.sideColumn).toHaveLength(0);
    expect(tierForEmployee(tree.chemists[0])).toBe("ccr");
    expect(isLabChemistRole("Chemist")).toBe(true);
  });

  test("invalid General saved layout falls back to Bandar hierarchy with lab branch", () => {
    const roster = [
      emp({ _id: "bandar", empId: "1", name: "Bandar Aldogaish", crew: "General", role: "Plant Manager" }),
      emp({ _id: "g1", empId: "2", name: "Support 1", crew: "General", role: "Operations Support" }),
      emp({ _id: "g2", empId: "3", name: "Syed", crew: "General", role: "Operations Support" }),
      emp({ _id: "g3", empId: "4", name: "Abdul Hameed", crew: "General", role: "Supervisor Engineer" }),
      emp({ _id: "chief", empId: "5", name: "Mashal", crew: "General", role: "Chief Chemist" }),
      emp({ _id: "chem", empId: "6", name: "Alvin", crew: "General", role: "Chemist" }),
    ];
    const nested = {
      crewId: "General",
      manual: true,
      nodes: [
        { empId: "1", parentEmpId: "", order: 0 },
        { empId: "4", parentEmpId: "1", order: 1 },
        { empId: "3", parentEmpId: "4", order: 2 },
        { empId: "2", parentEmpId: "1", order: 3 },
        { empId: "5", parentEmpId: "1", order: 4 },
        { empId: "6", parentEmpId: "1", order: 5 },
      ],
    };
    expect(isValidGeneralFlatLayout(roster, nested.nodes)).toBe(false);
    const tree = buildCrewOrgTree(roster, "General", nested);
    expect(tree.customLayout).toBe(false);
    expect(empKey(tree.layoutNodes[0].employee)).toBe("1");
    expect(tree.layoutNodes[0].children.map((c) => empKey(c.employee)).sort()).toEqual(["2", "3", "4", "5"]);
    const chiefNode = findLayoutNode(tree.layoutNodes, "5");
    expect(chiefNode?.children.map((c) => empKey(c.employee))).toEqual(["6"]);
    expect(layoutParentId(tree.layoutNodes, "6")).toBe("5");
  });

  test("General crew nests chemists under chief chemist as Bandar direct children", () => {
    const roster = [
      emp({ _id: "bandar", empId: "1", name: "Bandar Aldogaish", crew: "General", role: "Plant Manager" }),
      emp({ _id: "zaid", empId: "2", name: "Zaid", crew: "General", role: "Shift in Charge Engineer" }),
      emp({ _id: "sup", empId: "3", name: "Abdul Hameed", crew: "General", role: "Supervisor Engineer" }),
      emp({ _id: "ccr", empId: "4", name: "Mohammad", crew: "General", role: "CCR Operator" }),
      emp({ _id: "chief", empId: "5", name: "Mashal", crew: "General", role: "Chief Chemist" }),
      emp({ _id: "chem", empId: "6", name: "Alvin", crew: "General", role: "Chemist" }),
    ];
    const nodes = buildGeneralCrewLayoutNodes(roster);
    expect(nodes).toHaveLength(1);
    expect(empKey(nodes[0].employee)).toBe("1");
    expect(nodes[0].children.map((c) => empKey(c.employee))).toEqual(["2", "3", "4", "5"]);
    expect(nodes[0].children[3].children.map((c) => empKey(c.employee))).toEqual(["6"]);
    expect(layoutParentId(nodes, "6")).toBe("5");
    expect(isPlantLeadEmployee(roster[0], roster)).toBe(true);
  });

  test("valid General saved layout keeps chemists under chief chemist", () => {
    const roster = [
      emp({ _id: "bandar", empId: "1", name: "Bandar Aldogaish", crew: "General", role: "Plant Manager" }),
      emp({ _id: "g1", empId: "2", name: "Support 1", crew: "General", role: "Operations Support" }),
      emp({ _id: "chief", empId: "5", name: "Mashal", crew: "General", role: "Chief Chemist" }),
      emp({ _id: "chem", empId: "6", name: "Alvin", crew: "General", role: "Chemist" }),
    ];
    const saved = {
      crewId: "General",
      manual: true,
      nodes: [
        { empId: "1", parentEmpId: "", order: 0 },
        { empId: "2", parentEmpId: "1", order: 1 },
        { empId: "5", parentEmpId: "1", order: 2 },
        { empId: "6", parentEmpId: "5", order: 3 },
      ],
    };
    expect(isValidGeneralFlatLayout(roster, saved.nodes)).toBe(true);
    const tree = buildCrewOrgTree(roster, "General", saved);
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "6")).toBe("5");
  });

  test("Crew B with GDP engineer — CCRs parent to SIC, not GDP", () => {
    const roster = [
      emp({ _id: "sic", empId: "b-sic", name: "Abdullah", crew: "B", role: "Shift in Charge Engineer" }),
      emp({ _id: "gdp", empId: "b-gdp", name: "Albara Tareq M Barri", crew: "B", role: "GDP Engineer" }),
      emp({ _id: "chem", empId: "b-chem", name: "Mohamed Nawas", crew: "B", role: "Chemist" }),
      emp({ _id: "ccr1", empId: "b-ccr1", name: "Adam", crew: "B", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "b-ccr2", name: "Ahmed", crew: "B", role: "CCR Operator Group 3-4" }),
      emp({ _id: "ccr3", empId: "b-ccr3", name: "Ahmed", crew: "B", role: "CCR Operator Group 5-6" }),
      emp({ _id: "loc1", empId: "b-loc1", name: "Local 1", crew: "B", role: "Local Operator Group 1-2" }),
    ];
    const tree = buildCrewOrgTree(roster, "B");
    expect(tree.customLayout).toBe(false);
    expect(tree.sic?.name).toBe("Abdullah");
    expect(tree.others.map((e) => e.name)).toContain("Albara Tareq M Barri");
    expect(layoutParentId(tree.layoutNodes, "b-ccr1")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-ccr2")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-ccr3")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-gdp")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-chem")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-loc1")).toBe("b-ccr1");
  });

  test("Crew B saved layout with CCRs under GDP is sanitized on load", () => {
    const roster = [
      emp({ _id: "sic", empId: "b-sic", name: "Abdullah", crew: "B", role: "Shift in Charge Engineer" }),
      emp({ _id: "gdp", empId: "b-gdp", name: "Albara Tareq M Barri", crew: "B", role: "GDP Engineer" }),
      emp({ _id: "chem", empId: "b-chem", name: "Mohamed Nawas", crew: "B", role: "Chemist" }),
      emp({ _id: "ccr1", empId: "b-ccr1", name: "Adam", crew: "B", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "b-ccr2", name: "Ahmed", crew: "B", role: "CCR Operator Group 3-4" }),
    ];
    const badSaved = {
      crewId: "B",
      manual: true,
      nodes: [
        { empId: "b-sic", parentEmpId: "", order: 0 },
        { empId: "b-gdp", parentEmpId: "b-sic", order: 1 },
        { empId: "b-chem", parentEmpId: "b-gdp", order: 2 },
        { empId: "b-ccr1", parentEmpId: "b-gdp", order: 3 },
        { empId: "b-ccr2", parentEmpId: "b-gdp", order: 4 },
      ],
    };
    expect(isValidCrewOpsLayout(roster, badSaved.nodes)).toBe(false);
    const tree = buildCrewOrgTree(roster, "B", badSaved);
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "b-ccr1")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-ccr2")).toBe("b-sic");
    expect(layoutParentId(tree.layoutNodes, "b-gdp")).toBe("b-sic");
  });

  test("Crew A — Kanaka supervisor, Turki GDP; CCRs under supervisor not GDP", () => {
    const roster = [
      emp({ _id: "sup", empId: "a-sup", name: "Kanaka", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "gdp", empId: "a-gdp", name: "Turki Aljohani", crew: "A", role: "GDP Engineer" }),
      emp({ _id: "ccr1", empId: "a-ccr1", name: "CCR One", crew: "A", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "a-ccr2", name: "CCR Two", crew: "A", role: "CCR Operator Group 3-4" }),
    ];
    const badSaved = {
      crewId: "A",
      manual: true,
      nodes: [
        { empId: "a-sup", parentEmpId: "", order: 0 },
        { empId: "a-gdp", parentEmpId: "a-sup", order: 1 },
        { empId: "a-ccr1", parentEmpId: "a-gdp", order: 2 },
        { empId: "a-ccr2", parentEmpId: "a-gdp", order: 3 },
      ],
    };
    expect(savedLayoutHasGdpCcrParentChain(roster, badSaved.nodes)).toBe(true);
    const { nodes: repaired, changed } = sanitizeCrewOpsLayoutNodes(roster, badSaved.nodes);
    expect(changed).toBe(true);
    expect(repaired.find((n) => n.empId === "a-ccr1")?.parentEmpId).toBe("a-sup");
    expect(repaired.find((n) => n.empId === "a-ccr2")?.parentEmpId).toBe("a-sup");
    const tree = buildCrewOrgTree(roster, "A", { ...badSaved, nodes: repaired });
    expect(tree.supervisor?.name).toBe("Kanaka");
    expect(tree.others.map((e) => e.name)).toContain("Turki Aljohani");
    expect(layoutParentId(tree.layoutNodes, "a-ccr1")).toBe("a-sup");
    expect(layoutParentId(tree.layoutNodes, "a-ccr2")).toBe("a-sup");
    expect(layoutParentId(tree.layoutNodes, "a-gdp")).toBe("a-sup");
  });

  test("Crew D — CCRs attach to SIC; GDP engineer is support row sibling, not CCR parent", () => {
    const roster = [
      emp({ _id: "sic", empId: "d-sic", name: "Mustafa", crew: "D", role: "Shift in Charge Engineer" }),
      emp({ _id: "gdp", empId: "d-gdp", name: "Ali Alsenan", crew: "D", role: "GDP Engineer" }),
      emp({ _id: "ccr1", empId: "d-ccr1", name: "Fawaz", crew: "D", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "d-ccr2", name: "Hassan", crew: "D", role: "CCR Operator Group 3-4" }),
      emp({ _id: "ccr3", empId: "d-ccr3", name: "Norbie", crew: "D", role: "CCR Operator Group 5-6" }),
      emp({ _id: "ccr4", empId: "d-ccr4", name: "Veera", crew: "D", role: "CCR Operator Group 1-2" }),
      emp({ _id: "loc1", empId: "d-loc1", name: "Local 1", crew: "D", role: "Local Operator Group 1-2" }),
    ];
    const tree = buildCrewOrgTree(roster, "D");
    expect(tree.customLayout).toBe(false);
    expect(tree.sic?.name).toBe("Mustafa");
    expect(tree.others.map((e) => e.name)).toContain("Ali Alsenan");
    expect(layoutParentId(tree.layoutNodes, "d-ccr1")).toBe("d-sic");
    expect(layoutParentId(tree.layoutNodes, "d-ccr2")).toBe("d-sic");
    expect(layoutParentId(tree.layoutNodes, "d-ccr3")).toBe("d-sic");
    expect(layoutParentId(tree.layoutNodes, "d-ccr4")).toBe("d-sic");
    expect(layoutParentId(tree.layoutNodes, "d-gdp")).toBe("d-sic");
    expect(layoutParentId(tree.layoutNodes, "d-loc1")).toBe("d-ccr1");
  });

  test("invalid saved layout with CCRs under GDP engineer is repaired, not discarded", () => {
    const roster = [
      emp({ _id: "sic", empId: "d-sic", name: "Mustafa", crew: "D", role: "Shift in Charge Engineer" }),
      emp({ _id: "gdp", empId: "d-gdp", name: "Ali Alsenan", crew: "D", role: "GDP Engineer" }),
      emp({ _id: "ccr1", empId: "d-ccr1", name: "Fawaz", crew: "D", role: "CCR Operator Group 1-2" }),
      emp({ _id: "ccr2", empId: "d-ccr2", name: "Hassan", crew: "D", role: "CCR Operator Group 3-4" }),
    ];
    const badSaved = {
      crewId: "D",
      manual: true,
      nodes: [
        { empId: "d-sic", parentEmpId: "", order: 0 },
        { empId: "d-gdp", parentEmpId: "d-sic", order: 1 },
        { empId: "d-ccr1", parentEmpId: "d-gdp", order: 2 },
        { empId: "d-ccr2", parentEmpId: "d-gdp", order: 3 },
      ],
    };
    expect(isValidCrewOpsLayout(roster, badSaved.nodes)).toBe(false);
    const tree = buildCrewOrgTree(roster, "D", badSaved);
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "d-ccr1")).toBe("d-sic");
    expect(layoutParentId(tree.layoutNodes, "d-ccr2")).toBe("d-sic");
  });

  test("repairCrewOpsLayoutNodes re-parents CCRs from GDP to operations lead", () => {
    const roster = [
      emp({ _id: "sic", empId: "d-sic", name: "Mustafa", crew: "D", role: "Shift in Charge Engineer" }),
      emp({ _id: "gdp", empId: "d-gdp", name: "Ali Alsenan", crew: "D", role: "GDP Engineer" }),
      emp({ _id: "ccr1", empId: "d-ccr1", name: "Fawaz", crew: "D", role: "CCR Operator Group 1-2" }),
    ];
    const badNodes = [
      { empId: "d-sic", parentEmpId: "", order: 0 },
      { empId: "d-gdp", parentEmpId: "d-sic", order: 1 },
      { empId: "d-ccr1", parentEmpId: "d-gdp", order: 2 },
    ];
    const repaired = repairCrewOpsLayoutNodes(roster, badNodes);
    expect(repaired.find((n) => n.empId === "d-ccr1")?.parentEmpId).toBe("d-sic");
    expect(isValidCrewOpsLayout(roster, repaired)).toBe(true);
    const tree = buildCrewOrgTree(roster, "D", { crewId: "D", manual: true, nodes: repaired });
    expect(tree.customLayout).toBe(true);
    expect(layoutParentId(tree.layoutNodes, "d-ccr1")).toBe("d-sic");
  });
});

describe("tierForEmployee", () => {
  test("chemist roles use CCR-tier styling", () => {
    expect(
      tierForEmployee(
        emp({ _id: "chem", name: "Mukhtar Ali", crew: "D", role: "Chemist" })
      )
    ).toBe("ccr");
    expect(
      tierForEmployee(
        emp({ _id: "chief", name: "Chief Chem", crew: "General", role: "Chief Chemist" })
      )
    ).toBe("ccr");
  });
});

describe("buildPlantOrgTree", () => {
  test("Bandar Aldogaish is root with five summary cards; lab staff hidden under chief chemist", () => {
    const roster = [
      emp({ _id: "bandar", empId: "1", name: "Bandar Aldogaish", crew: "General", role: "Plant Manager" }),
      emp({ _id: "sic-a", empId: "a-sic", name: "SIC A", crew: "A", role: "Shift in Charge Engineer" }),
      emp({ _id: "sup-a", empId: "a-sup", name: "Sup A", crew: "A", role: "Supervisor Engineer" }),
      emp({ _id: "ccr-a", empId: "a-ccr", name: "CCR A", crew: "A", role: "CCR Operator Group 1-2" }),
      emp({ _id: "sic-b", empId: "b-sic", name: "SIC B", crew: "B", role: "Shift in Charge Engineer" }),
      emp({ _id: "sic-c", empId: "c-sic", name: "SIC C", crew: "C", role: "Shift in Charge Engineer" }),
      emp({ _id: "sic-d", empId: "d-sic", name: "SIC D", crew: "D", role: "Shift in Charge Engineer" }),
      emp({ _id: "chief", empId: "c-chief", name: "Chief Chem", crew: "General", role: "Chief Chemist" }),
      emp({ _id: "chem1", empId: "c1", name: "Chemist 1", crew: "General", role: "Chemist" }),
      emp({ _id: "chem2", empId: "c2", name: "Chemist 2", crew: "General", role: "Chemist" }),
    ];

    const plant = buildPlantOrgTree(roster);
    expect(findPlantLead(roster)?.name).toBe("Bandar Aldogaish");
    expect(plant.plantLead?.name).toBe("Bandar Aldogaish");
    expect(plant.roots).toHaveLength(1);
    expect(empKey(plant.roots[0].employee)).toBe("1");
    expect(plant.summaryCards).toHaveLength(5);
    expect(plant.chemists.map((c) => empKey(c)).sort()).toEqual(["c1", "c2"]);

    const chiefNode = plant.summaryCards.find((c) => empKey(c.employee) === "c-chief");
    expect(chiefNode).toBeTruthy();
    expect(chiefNode!.children.map((c) => empKey(c.employee)).sort()).toEqual(["c1", "c2"]);

    const sicANode = plant.summaryCards.find((c) => empKey(c.employee) === "a-sic");
    expect(sicANode).toBeTruthy();
    expect(sicANode!.children).toHaveLength(0);
  });

  test("without plant lead, returns crew and chemistry branches as roots", () => {
    const roster = [
      emp({ _id: "sic-a", empId: "a-sic", name: "SIC A", crew: "A", role: "Shift in Charge Engineer" }),
      emp({ _id: "chief", empId: "c-chief", name: "Chief Chem", crew: "General", role: "Chief Chemist" }),
      emp({ _id: "chem1", empId: "c1", name: "Chemist 1", crew: "General", role: "Chemist" }),
    ];
    const plant = buildPlantOrgTree(roster);
    expect(plant.plantLead).toBeNull();
    expect(plant.roots.map((r) => empKey(r.employee))).toContain("a-sic");
    expect(plant.roots.map((r) => empKey(r.employee))).toContain("c-chief");
  });
});
