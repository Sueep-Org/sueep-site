import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canManageSettings, loadSettings } from "@/lib/erp/settings";
import { EDITOR_SETTINGS, OTHER_SETTING_LABELS, PAYROLL_KEYS, PRICING_KEYS, SETTINGS, SETTINGS_TABS, datedHistoryText, datedNumberHistory, formatSetting, settingDef, type SettingsTab } from "@/lib/erp/settingsRegistry";
import { loadPricingSettings } from "@/lib/pricingSettingsServer";
import { InfoTip } from "@/app/erp/components/ui";
import { SettingField } from "./SettingField";
import { EditorSetting, type CommissionTiersData, type StandardLists } from "./EditorSetting";
import { loadPayrollRules } from "@/lib/erp/payrollRulesServer";
import { loadAppLists, listKey } from "@/lib/erp/appListsServer";
import { APP_LIST_IDS } from "@/lib/erp/appLists";
import { ListEditor } from "./ListEditor";

export const metadata: Metadata = {
  title: "Settings",
};

export const dynamic = "force-dynamic";

const HISTORY_SHOWN = 200;

type Tab = SettingsTab | "history";
type PageProps = { searchParams: Promise<{ tab?: string }> };

const OTHER_PAGES = [
  { href: "/erp/users", label: "User Management", info: "Who can sign in and their role.", adminOnly: true },
  { href: "/erp/notifications", label: "Email Settings", info: "Which emails go out and who gets them." },
  { href: "/erp/company-info", label: "Company Info", info: "Company IDs, licenses and logins." },
];

const shortDate = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function historyValue(key: string, value: string | null): string {
  if (value == null) return "Default";
  const def = settingDef(key);
  if (def?.kind === "number" && def.dated) return datedHistoryText(def, datedNumberHistory(def, value));
  if (def) return formatSetting(def, value);
  return "Edited";
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageSettings(auth.role)) redirect("/erp");

  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "history" || SETTINGS_TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : SETTINGS_TABS[0].id;

  const fields = tab === "history" ? [] : await loadSettings(SETTINGS.filter((s) => s.tab === tab));
  const editors = EDITOR_SETTINGS.filter((e) => e.tab === tab);
  const loadStandards = async (): Promise<StandardLists> => {
    const [pricing, saved] = await Promise.all([
      loadPricingSettings(),
      prisma.appSetting.findMany({ where: { key: { in: [PRICING_KEYS.turnoverPackage, PRICING_KEYS.coPackage] } }, select: { key: true } }),
    ]);
    const has = (key: string) => saved.some((s) => s.key === key);
    return {
      turnover: { pkg: pricing.turnoverPackage, saved: has(PRICING_KEYS.turnoverPackage) },
      co: { pkg: pricing.coPackage, saved: has(PRICING_KEYS.coPackage) },
    };
  };
  const loadTiers = async (): Promise<CommissionTiersData> => {
    const [rules, row] = await Promise.all([loadPayrollRules(), prisma.appSetting.findUnique({ where: { key: PAYROLL_KEYS.commissionTiers }, select: { key: true } })]);
    return { history: rules.commissionTiers, saved: !!row };
  };
  const loadLists = async () => {
    const [lists, saved] = await Promise.all([
      loadAppLists(),
      prisma.appSetting.findMany({ where: { key: { in: APP_LIST_IDS.map(listKey) } }, select: { key: true } }),
    ]);
    return APP_LIST_IDS.map((id) => ({ id, items: lists[id], saved: saved.some((s) => s.key === listKey(id)) }));
  };
  const [history, employees, standards, tiers, lists] = await Promise.all([
    tab === "history" ? prisma.appSettingChange.findMany({ orderBy: { createdAt: "desc" }, take: HISTORY_SHOWN }) : Promise.resolve([]),
    editors.some((e) => e.id === "health")
      ? prisma.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
    tab === "pricing" ? loadStandards() : Promise.resolve(null),
    tab === "commission" ? loadTiers() : Promise.resolve(null),
    tab === "lists" ? loadLists() : Promise.resolve(null),
  ]);
  const employeeOptions = employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })).sort((a, b) => a.name.localeCompare(b.name));

  // Editors marked first sit above the section's plain values, the rest below
  const editorsIn = (section: string, first: boolean) =>
    editors
      .filter((e) => ("section" in e ? e.section : "") === section && ("first" in e && e.first) === first)
      .map((e) => <EditorSetting key={e.id} id={e.id} label={e.label} info={e.info} employees={employeeOptions} standards={standards} tiers={tiers} />);

  const tabs: { id: Tab; label: string }[] = [...SETTINGS_TABS, { id: "history", label: "History" }];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <InfoTip text="Business rules the ERP uses, like rates and timing. Admin and Business Manager only. Every change is saved on the History tab, and Reset to default puts a value back." />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Settings sections">
          {tabs.map((t) => {
            const isActive = t.id === tab;
            return (
              <Link
                key={t.id}
                href={`/erp/settings?tab=${t.id}`}
                aria-current={isActive ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
                  isActive ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {lists ? (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
          {lists.map((l) => (
            <ListEditor key={l.id} id={l.id} items={l.items} saved={l.saved} />
          ))}
        </div>
      ) : tab === "history" ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Setting</th>
                <th className="px-4 py-2">From</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    No changes yet. Changes show here as soon as someone saves a setting.
                  </td>
                </tr>
              ) : (
                history.map((h, i) => (
                  <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">{shortDate(h.createdAt)}</td>
                    <td className="px-4 py-2.5 text-gray-900">{settingDef(h.key)?.label ?? OTHER_SETTING_LABELS[h.key] ?? h.key}</td>
                    <td className="px-4 py-2.5 text-gray-500">{historyValue(h.key, h.oldValue)}</td>
                    <td className="px-4 py-2.5 text-gray-900">{historyValue(h.key, h.newValue)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{h.byEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-5">
          {[...new Set([...fields.map((f) => f.def.section ?? ""), ...editors.map((e) => ("section" in e ? e.section : ""))])].map((section) => (
            <section key={section}>
              {section && <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{section}</h2>}
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
                {editorsIn(section, true)}
                {fields
                  .filter((f) => (f.def.section ?? "") === section)
                  .map((f) => (
                    <SettingField key={f.def.key} def={f.def} value={f.value} saved={f.saved} changedBy={f.changedBy} changedAt={f.changedAt} history={f.history} />
                  ))}
                {editorsIn(section, false)}
              </div>
            </section>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Other settings pages</h2>
        <div className="flex flex-wrap gap-2">
          {OTHER_PAGES.filter((p) => !p.adminOnly || auth.role === "ADMIN").map((p) => (
            <Link key={p.href} href={p.href} title={p.info} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50">
              {p.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
