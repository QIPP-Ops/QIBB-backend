"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, RefreshCw, X, Trash2, Save, Lock, KeyRound } from "lucide-react";
import { Loader2 } from "lucide-react";

const OrgSpinner = () => (
  <div className="flex justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-[#9273DA]" />
  </div>
);

const PersonnelOrgChart = dynamic(
  () =>
    import("@/components/personnel/personnel-org-chart").then((m) => ({
      default: m.PersonnelOrgChart,
    })),
  { loading: OrgSpinner }
);

import { AcwaGlassNavBar } from "@/components/layout/acwa-glass-nav-bar";
import { OPERATION_TEAM_CARD_IMAGE } from "@/lib/portalHeroImages";
import { OperationsPersonalCard } from "@/components/personnel/operations-personal-card";
import { SafetyObservationsSection } from "@/components/personnel/safety-observations-section";
import { ShiftReportSheet } from "@/components/personnel/shift-report-sheet";
import type { Employee } from "@/components/calendar/roster-card-view";
import { defaultCrewTabForUser, normCrew, visibleCrewTabsForUser, type SavedOrgLayout, type StandardCrewTab } from "@/lib/personnelOrg";
import { fetchOrgLayoutsForCrews, fetchOrgLayoutForCrew, autoRepairAndPersistCrewOrgLayouts, repairOrgLayoutsInMemory } from "@/components/personnel/org-layout-board";
import { rosterApi, adminApi, personnelApi } from "@/lib/api";
import {
  CACHE_TTL,
  fetchWithClientCache,
  invalidateClientCache,
} from "@/lib/clientDataCache";
import { NameColorPicker } from "@/components/personnel/name-color-picker";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  hasPortalAdminAccess,
  isHiddenSystemAccount,
  isSuperAdminUser,
  SUPER_ADMIN_EMAIL,
} from "@/lib/auth";


import {
  displayEmail,
  FAKE_EMAIL_BADGE,
  isFakeRosterEmail,
  isValidPersonnelEmail,
} from "@/lib/rosterEmail";
import { canViewShiftReportForEmployee } from "@/lib/rosterLeavePermissions";
import { GroupPresetsManager } from "@/components/personnel/group-presets-manager";

interface AdminConfig {
  crews?: Array<{ name: string; color?: string }> | string[];
  roles?: Array<{ name: string }> | string[];
  availableCrews?: string[];
  availableRoles?: string[];
}

const ACCESS_ROLES = ["viewer", "admin"] as const;

type PersonnelForm = Partial<Employee> & {
  fullName?: string;
  position?: string;
  nationality?: string;
  iqama?: string;
  employmentType?: string;
  company?: string;
  joiningDate?: string;
  opsGroupLabel?: string;
  opsTreeParentEmpId?: string;
  opsTreeRelation?: Employee["opsTreeRelation"];
  assignedTo?: string;
  receiveEmailNotifications?: boolean;
};

function PersonnelPage() {
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminUser(user);
  const isAdmin = hasPortalAdminAccess(user);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [config, setConfig] = useState<AdminConfig>({ crews: [], roles: [] });
  const [form, setForm] = useState<PersonnelForm>({});
  const [treePickId, setTreePickId] = useState<string | null>(null);
  const [orgActiveCrew, setOrgActiveCrew] = useState<StandardCrewTab | undefined>(undefined);
  const [orgLayouts, setOrgLayouts] = useState<Record<string, SavedOrgLayout>>({});
  const [shiftReportEmployee, setShiftReportEmployee] = useState<Employee | null>(null);
  const [emailNotifSaving, setEmailNotifSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [notifyUserOnSave, setNotifyUserOnSave] = useState(false);

  const normalizeNames = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name))
      .filter(Boolean) as string[];
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: cached } = await fetchWithClientCache({
        key: "personnel-employees",
        ttlMs: CACHE_TTL.personnel,
        fetcher: async () => {
          const [empRes, cfgRes] = await Promise.all([
            rosterApi.getEmployees(),
            adminApi.getConfig().catch(() => ({ data: { crews: [], roles: [] } })),
          ]);
          return { employees: empRes.data || [], config: cfgRes.data };
        },
      });
      const rows = (cached.employees || [])
        .filter((e: Employee) => !isHiddenSystemAccount(e.email))
        .map((e: Employee) => ({
        ...e,
        email: displayEmail(e.email),
      }));
      setEmployees(rows);
      const d = cached.config || {};
      setConfig({
        crews: d.crews ?? d.availableCrews,
        roles: d.roles ?? d.availableRoles,
        availableCrews: d.availableCrews,
        availableRoles: d.availableRoles,
      });
      const tabs = visibleCrewTabsForUser(user?.crew, rows, { viewAllCrews: isSuperAdmin });
      let layouts = await fetchOrgLayoutsForCrews(tabs);
      layouts = repairOrgLayoutsInMemory(rows, layouts);
      if (isSuperAdmin) {
        layouts = await autoRepairAndPersistCrewOrgLayouts(rows, layouts);
      }
      setOrgLayouts(layouts);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || "Failed to load team");
    } finally {
      setLoading(false);
    }
  };

  const orgCrewOptions = useMemo(
    () => ({ viewAllCrews: isSuperAdmin } as const),
    [isSuperAdmin]
  );

  const visibleOrgCrewTabs = useMemo(
    () => visibleCrewTabsForUser(user?.crew, employees, orgCrewOptions),
    [user?.crew, employees, orgCrewOptions]
  );

  const resolvedOrgCrew = useMemo((): StandardCrewTab => {
    if (!employees.length) return visibleOrgCrewTabs[0] ?? "A";
    if (orgActiveCrew && visibleOrgCrewTabs.includes(orgActiveCrew)) return orgActiveCrew;
    return defaultCrewTabForUser(employees, user?.crew, orgCrewOptions);
  }, [employees, orgActiveCrew, user?.crew, visibleOrgCrewTabs, orgCrewOptions]);

  const refreshOrgLayout = useCallback(async (crew: StandardCrewTab) => {
    const layout = await fetchOrgLayoutForCrew(crew);
    const key = normCrew(crew);
    setOrgLayouts((prev) => {
      const next = { ...prev };
      if (layout) next[key] = layout;
      else delete next[key];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!resolvedOrgCrew || loading) return;
    void refreshOrgLayout(resolvedOrgCrew);
  }, [resolvedOrgCrew, loading, refreshOrgLayout]);

  useEffect(() => {
    const init = async () => {
      if (isSuperAdmin) {
        try {
          await adminApi.clearPlaceholderEmails();
        } catch {
          /* non-fatal */
        }
      }
      await loadAll();
    };
    void init();
  }, [isSuperAdmin]);

  const crewOptions = normalizeNames(config.crews ?? config.availableCrews ?? []);
  const roleOptions = normalizeNames(config.roles ?? config.availableRoles ?? []);
  const openCreate = () => {
    if (!isAdmin) return;
    setSelected(null);
    setForm({
      name: "",
      empId: "",
      email: "",
      crew: crewOptions[0] || "A",
      role: roleOptions[0] || "Local Operator",
      color: "crew-grey",
      isApproved: true,
      accessRole: "viewer",
    });
    setCreating(true);
  };

  const openEdit = (emp: Employee) => {
    setSelected(emp);
    setForm({
      ...emp,
      email: displayEmail(emp.email),
      receiveEmailNotifications: emp.receiveEmailNotifications,
    });
    setCreating(true);
  };

  useEffect(() => {
    if (!creating || !selected || form.accessRole !== "admin" || !isSuperAdmin) return;
    if (form.receiveEmailNotifications !== undefined) return;

    let cancelled = false;
    void adminApi
      .getAdminEmailNotifications()
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data?.admins)
          ? res.data.admins
          : Array.isArray(res.data)
            ? res.data
            : res.data?.data ?? [];
        const match = rows.find(
          (r: { userId?: string; email?: string }) =>
            r.userId === selected._id ||
            (r.email &&
              selected.email &&
              r.email.trim().toLowerCase() === selected.email.trim().toLowerCase())
        );
        if (match) {
          setForm((prev) => ({
            ...prev,
            receiveEmailNotifications: Boolean(match.receiveEmailNotifications),
          }));
        }
      })
      .catch(() => {
        /* non-fatal — field stays unset */
      });

    return () => {
      cancelled = true;
    };
  }, [creating, selected, form.accessRole, form.receiveEmailNotifications, isSuperAdmin]);

  const handleEmailNotifToggle = async (checked: boolean) => {
    if (!selected?._id || !isSuperAdmin) return;
    const userId = String(selected._id);
    const prev = form.receiveEmailNotifications;
    setForm((f) => ({ ...f, receiveEmailNotifications: checked }));
    setEmailNotifSaving(true);
    try {
      await personnelApi.patchEmailNotifications(userId, checked);
      toast.success("Email notification preference updated");
    } catch (e: unknown) {
      setForm((f) => ({ ...f, receiveEmailNotifications: prev }));
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Failed to update email notifications");
    } finally {
      setEmailNotifSaving(false);
    }
  };

  const closeDrawer = () => {
    setCreating(false);
    setSelected(null);
    setForm({});
  };

  const handleSave = async () => {
    try {
      if (!form.name?.trim()) {
        setError("Name is required");
        return;
      }
      if (!selected?._id) {
        if (!isAdmin) {
          setError("Only administrators can add team members.");
          return;
        }
        const res = await rosterApi.createEmployee({
          name: form.name,
          empId: form.empId,
          crew: form.crew,
          role: form.role,
          color: form.color || "crew-grey",
          email: form.email || undefined,
          accessRole: isSuperAdmin ? form.accessRole : "viewer",
        });
        const data = res.data;
        if (data?.tempPassword) {
          toast.success(`Added. Login ${data.loginEmail} — temp password: ${data.tempPassword}`, { duration: 20000 });
        } else {
          toast.success("Personnel added.");
        }
        closeDrawer();
        await loadAll();
        return;
      }
      if (isAdmin && form.email?.trim()) {
        if (!isValidPersonnelEmail(form.email)) {
          setError("Enter a valid email with @ and domain.");
          return;
        }
      }
      const id = selected.empId || selected._id;
      await rosterApi.updateEmployee(id, {
        name: form.name,
        crew: form.crew,
        role: form.role,
        color: form.color,
        ...(isAdmin && form.email?.trim() ? { email: form.email.trim() } : {}),
        ...(isAdmin && {
          fullName: form.fullName,
          position: form.position,
          nationality: form.nationality,
          iqama: form.iqama,
          employmentType: form.employmentType,
          company: form.company,
          joiningDate: form.joiningDate || null,
        }),
        ...(isSuperAdmin &&
          notifyUserOnSave &&
          (form.crew !== selected.crew || form.role !== selected.role)
          ? { notifyUser: true }
          : {}),
      });
      if (
        isSuperAdmin &&
        selected._id &&
        form.accessRole &&
        form.accessRole !== selected.accessRole
      ) {
        const roleRes = await adminApi.updateUserRole(String(selected._id), {
          accessRole: form.accessRole,
        });
        const newToken = roleRes.data?.token as string | undefined;
        if (newToken) {
          const { setAuthToken } = await import("@/lib/auth-token");
          setAuthToken(newToken);
          window.location.reload();
        }
        toast.success("Portal access role updated");
      }
      toast.success("Saved successfully");
      setNotifyUserOnSave(false);
      invalidateClientCache("personnel-employees");
      closeDrawer();
      await loadAll();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!selected?._id) return;
    if (!window.confirm(`Delete ${selected.name}?`)) return;
    try {
      await rosterApi.deleteEmployee(selected.empId || selected._id);
      closeDrawer();
      await loadAll();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err?.response?.data?.message || err.message || "Delete failed");
    }
  };

  const handleResetPassword = async () => {
    if (!selected?._id || !isAdmin) return;
    const email = (form.email ?? "").trim();
    if (!email || isFakeRosterEmail(email)) {
      toast.warning(
        "This member has no real email address. Update their email before sending a password reset."
      );
      return;
    }
    const confirmed = window.confirm(
      `Send a password reset to ${selected.name}? This will send a new temporary password to their registered email.`
    );
    if (!confirmed) return;

    setResettingPassword(true);
    try {
      const res = await adminApi.adminResetPassword(String(selected._id));
      const sentTo = res.data?.email ?? email;
      toast.success(`Password reset sent to ${sentTo}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; code?: string } } };
      const msg = err.response?.data?.message;
      if (err.response?.data?.code === "PLACEHOLDER_EMAIL" || isFakeRosterEmail(email)) {
        toast.warning(
          msg ??
            "This member has no real email address. Update their email before sending a password reset."
        );
      } else {
        toast.error(msg ?? "Failed to send password reset.");
      }
    } finally {
      setResettingPassword(false);
    }
  };

  const updateForm = (patch: PersonnelForm) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AcwaGlassNavBar
          pageKey="personnel"
          backgroundKey="operation-team-card"
          heroImageUrl={OPERATION_TEAM_CARD_IMAGE}
          className="rounded-2xl px-4 py-4 sm:px-6 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white drop-shadow-sm">Operation Team</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isSuperAdmin && <GroupPresetsManager />}
              <button
                type="button"
                onClick={() => loadAll()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#D2F050] px-4 py-2 text-sm font-semibold text-[#2E2044] shadow-sm transition hover:bg-[#D2F050]/90"
                >
                  <Plus className="h-4 w-4" />
                  Add member
                </button>
              )}
            </div>
          </div>
        </AcwaGlassNavBar>

        {user?.empId && (
          <OperationsPersonalCard
            onOpenShiftReport={() => {
              const self = employees.find((e) => e.empId === user.empId);
              if (self) setShiftReportEmployee(self);
            }}
          />
        )}

        {user?.empId && <SafetyObservationsSection />}

        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-lg p-1 text-red-600 hover:bg-red-100"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <PersonnelOrgChart
          employees={employees}
          loading={loading}
          activeCrew={resolvedOrgCrew}
          onActiveCrewChange={setOrgActiveCrew}
          userCrew={user?.crew}
          viewAllCrews={isSuperAdmin}
          orgLayouts={orgLayouts}
          currentEmpId={user?.empId}
          canShiftReport={(emp) => canViewShiftReportForEmployee(user, emp)}
          onShiftReport={(emp) => setShiftReportEmployee(emp)}
          onEdit={isAdmin ? openEdit : undefined}
          layoutEditable={isSuperAdmin}
          onLayoutSaved={() => {
            void refreshOrgLayout(resolvedOrgCrew);
          }}
        />
      </div>

      <ShiftReportSheet
        employee={shiftReportEmployee}
        open={!!shiftReportEmployee}
        onClose={() => setShiftReportEmployee(null)}
        isAdmin={
          !!shiftReportEmployee &&
          canViewShiftReportForEmployee(user, shiftReportEmployee) &&
          user?.empId !== shiftReportEmployee.empId
        }
        isSelf={!!shiftReportEmployee && shiftReportEmployee.empId === user?.empId}
      />

      {creating && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/30 backdrop-blur-[1px]"
            aria-label="Close drawer"
            onClick={closeDrawer}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">{selected ? "Edit personnel" : "New personnel"}</h2>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <Field label="Name">
                <input
                  className="input"
                  value={form.name || ""}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </Field>

              <Field label="Employee ID">
                <input
                  className="input"
                  value={form.empId || ""}
                  onChange={(e) => updateForm({ empId: e.target.value })}
                  placeholder="e.g. EMP-001"
                  autoComplete="off"
                />
              </Field>

              <Field label={selected ? "Email" : "Email (optional)"}>
                <input
                  type="email"
                  className="input"
                  value={form.email || ""}
                  readOnly={!!selected && !isAdmin}
                  onChange={(e) =>
                    (!selected || isAdmin) && updateForm({ email: e.target.value })
                  }
                  placeholder="name@company.com"
                  autoComplete="email"
                />
                {form.email?.trim() && !isValidPersonnelEmail(form.email) && (
                  <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    {FAKE_EMAIL_BADGE}
                  </p>
                )}
              </Field>

              <Field label="Crew">
                {crewOptions.length > 0 ? (
                  <select
                    className="input"
                    value={form.crew || crewOptions[0] || ""}
                    onChange={(e) => updateForm({ crew: e.target.value })}
                  >
                    {crewOptions.map((c) => (
                      <option key={c} value={c}>
                        Crew {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={form.crew || ""}
                    onChange={(e) => updateForm({ crew: e.target.value })}
                    placeholder="Crew letter or name"
                  />
                )}
              </Field>

              <Field label="Role">
                {roleOptions.length > 0 ? (
                  <select
                    className="input"
                    value={form.role || roleOptions[0] || ""}
                    onChange={(e) => updateForm({ role: e.target.value })}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={form.role || ""}
                    onChange={(e) => updateForm({ role: e.target.value })}
                    placeholder="Operational role"
                  />
                )}
              </Field>

              <NameColorPicker
                value={form.color || "crew-grey"}
                onChange={(key) => updateForm({ color: key })}
              />

              {isAdmin && selected && (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">HR profile</p>
                  {[
                    ["fullName", "Legal full name"],
                    ["position", "Position"],
                    ["nationality", "Nationality"],
                    ["iqama", "Iqama / ID"],
                    ["employmentType", "Employment type"],
                    ["company", "Company"],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        className="input"
                        value={(form[key as keyof PersonnelForm] as string) || ""}
                        onChange={(e) => updateForm({ [key]: e.target.value })}
                      />
                    </Field>
                  ))}
                  <Field label="Joining date">
                    <input
                      type="date"
                      className="input"
                      value={form.joiningDate ? String(form.joiningDate).slice(0, 10) : ""}
                      onChange={(e) => updateForm({ joiningDate: e.target.value || undefined })}
                    />
                  </Field>
                </div>
              )}

              {isSuperAdmin ? (
                <Field label="Access role (super admin only)">
                  <select
                    className="input"
                    value={form.accessRole || "viewer"}
                    onChange={(e) => updateForm({ accessRole: e.target.value })}
                  >
                    {ACCESS_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Grant or revoke admin for this existing account (admin@acwaops.com only).
                  </p>
                </Field>
              ) : (
                form.accessRole === "admin" && (
                  <p className="text-xs text-slate-500 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    Portal role: <strong>admin</strong> — contact super admin to change.
                  </p>
                )
              )}

              {form.accessRole === "admin" && selected && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        Receive email notifications
                      </p>
                      {!isSuperAdmin && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Only the super administrator can change this setting.
                        </p>
                      )}
                    </div>
                    {(() => {
                      const isTargetSuperAdmin =
                        (selected.email ?? "").trim().toLowerCase() ===
                        SUPER_ADMIN_EMAIL.toLowerCase();
                      if (isTargetSuperAdmin) {
                        return (
                          <span
                            className="flex items-center gap-1.5 shrink-0"
                            title="Super admin always receives notifications"
                          >
                            <Switch checked disabled />
                            <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                          </span>
                        );
                      }
                      return (
                        <Switch
                          checked={!!form.receiveEmailNotifications}
                          disabled={!isSuperAdmin || emailNotifSaving}
                          onCheckedChange={(checked) => void handleEmailNotifToggle(checked)}
                        />
                      );
                    })()}
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[#9273DA] focus:ring-[#9273DA]"
                  checked={!!form.isApproved}
                  onChange={(e) => updateForm({ isApproved: e.target.checked })}
                />
                <span className="text-sm font-medium text-slate-800">Approved</span>
              </label>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 space-y-3">
              {isSuperAdmin && selected && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#9273DA] focus:ring-[#9273DA]"
                    checked={notifyUserOnSave}
                    onChange={(e) => setNotifyUserOnSave(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Notify user about changes</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Send an email if crew or role changed (not sent automatically on save).
                    </span>
                  </span>
                </label>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#9273DA] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#7d5fc7]"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
              {selected?._id && isAdmin && (
                <button
                  type="button"
                  onClick={() => void handleResetPassword()}
                  disabled={
                    resettingPassword ||
                    !form.email?.trim() ||
                    isFakeRosterEmail(form.email)
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resettingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Reset Password
                </button>
              )}
              {selected?._id && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition:
            border-color 0.15s,
            box-shadow 0.15s,
            background 0.15s;
        }
        .input:focus {
          border-color: #9273da;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(146, 115, 218, 0.2);
        }
      `}</style>
    </div>
  );
}

export default PersonnelPage;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      {children}
    </label>
  );
}
