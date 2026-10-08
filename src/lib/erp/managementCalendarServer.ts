/**
 * Loads the Management calendar: dates pulled from elsewhere in the ERP
 * (insurance, time off, background checks...) plus staff-added events.
 * Automatic items are read-only here and link to the page where the date
 * lives, so there's one place to change each one.
 */

import { prisma } from "@/lib/prisma";
import { policyTypeLabel } from "./insurance";
import { COI_WATCH_PROJECT_WHERE, currentCoiIds } from "./projectCois";
import { OPEN_STATUSES } from "./coiRequests";
import { DEFAULT_PAYROLL_ANCHOR, anchorDate, biweeklyIndex, biweeklyRange } from "./payPeriods";
import { utcDateKey } from "./dates";
import { COMPANY_INFO_SECTIONS } from "./companyInfo";
import { checkerName, namesByEmail } from "./janitorialQualityChecks";
import {
  eventOccurrences,
  formatItemDates,
  isRepeatValue,
  keyToDate,
  parseBirthDateKey,
  type BuiltinKey,
  type ManagementCategoryDto,
  type ManagementItem,
} from "./managementCalendar";

const TIME_OFF_LABELS: Record<string, string> = {
  VACATION: "Vacation",
  SICK: "Sick",
  HALF_DAY: "Half day",
  UNPAID: "Unpaid",
  OTHER: "Time off",
};

export async function loadManagementCategories(): Promise<ManagementCategoryDto[]> {
  const rows = await prisma.managementCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, builtinKey: true, name: true, color: true, remindDays: true, sortOrder: true, _count: { select: { events: true } } },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, eventCount: _count.events }));
}

/** Every item touching [startKey, endKey] (inclusive), sorted by start day. */
export async function loadManagementItems(
  startKey: string,
  endKey: string,
  categories: ManagementCategoryDto[]
): Promise<ManagementItem[]> {
  const start = keyToDate(startKey);
  const end = keyToDate(endKey);
  const inRange = { gte: start, lte: end };
  const catId = new Map(categories.filter((c) => c.builtinKey).map((c) => [c.builtinKey as BuiltinKey, c.id]));
  const want = (k: BuiltinKey) => catId.has(k);

  const [
    policies,
    contractors,
    coiProjects,
    coiRequests,
    employeeTimeOff,
    contractorTimeOff,
    employeeChecks,
    contractorChecks,
    documents,
    contracts,
    anchorSetting,
    employeeBirthdays,
    contractorBirthdays,
    companyInfoFields,
    qualityChecks,
    events,
  ] = await Promise.all([
    want("SUEEP_INSURANCE")
      ? prisma.insurancePolicy.findMany({
          where: { active: true, expiresAt: inRange },
          select: { id: true, policyType: true, carrier: true, policyNumber: true, expiresAt: true },
        })
      : [],
    want("SUB_INSURANCE")
      ? prisma.contractor.findMany({
          where: {
            status: "ACTIVE",
            OR: [{ glExpiresAt: inRange }, { workersCompExpiresAt: inRange }, { autoExpiresAt: inRange }, { umbrellaExpiresAt: inRange }],
          },
          select: { id: true, name: true, glExpiresAt: true, workersCompExpiresAt: true, workersCompExempt: true, autoExpiresAt: true, umbrellaExpiresAt: true },
        })
      : [],
    want("PROJECT_COIS")
      ? prisma.project.findMany({
          where: { ...COI_WATCH_PROJECT_WHERE, cois: { some: { expiresAt: inRange } } },
          select: {
            id: true,
            jobTitle: true,
            cois: { select: { id: true, holderId: true, holderName: true, issuedOn: true, createdAt: true, expiresAt: true } },
          },
        })
      : [],
    want("COI_REQUESTS")
      ? prisma.coiRequest.findMany({
          where: { status: { in: OPEN_STATUSES }, neededBy: inRange },
          select: { id: true, requesterName: true, requesterCompany: true, neededBy: true, projectText: true, project: { select: { jobTitle: true } } },
        })
      : [],
    want("TIME_OFF")
      ? prisma.employeeTimeOff.findMany({
          where: { status: { not: "DENIED" }, startDate: { lte: end }, endDate: { gte: start } },
          select: { id: true, startDate: true, endDate: true, type: true, notes: true, status: true, employee: { select: { id: true, firstName: true, lastName: true } } },
        })
      : [],
    want("TIME_OFF")
      ? prisma.contractorTimeOff.findMany({
          where: { status: { not: "DENIED" }, startDate: { lte: end }, endDate: { gte: start } },
          select: { id: true, startDate: true, endDate: true, type: true, notes: true, status: true, contractor: { select: { id: true, name: true } } },
        })
      : [],
    want("BACKGROUND_CHECKS")
      ? prisma.employee.findMany({
          where: { status: "ACTIVE", backgroundCheckExpiresAt: inRange },
          select: { id: true, firstName: true, lastName: true, backgroundCheckExpiresAt: true },
        })
      : [],
    want("BACKGROUND_CHECKS")
      ? prisma.contractor.findMany({
          where: { status: "ACTIVE", backgroundCheckExpiresAt: inRange },
          select: { id: true, name: true, backgroundCheckExpiresAt: true },
        })
      : [],
    want("EMPLOYEE_DOCUMENTS")
      ? prisma.employeeDocument.findMany({
          where: { expiresAt: inRange, employee: { status: "ACTIVE" } },
          select: { id: true, documentType: true, title: true, expiresAt: true, employee: { select: { id: true, firstName: true, lastName: true } } },
        })
      : [],
    want("JANITORIAL_CONTRACTS")
      ? prisma.recurringContract.findMany({
          where: { OR: [{ endDate: inRange }, { startDate: inRange }, { expirationDate: inRange, status: { not: "ENDED" } }] },
          select: { id: true, startDate: true, endDate: true, expirationDate: true, status: true, building: { select: { name: true } } },
        })
      : [],
    want("PAYROLL") ? prisma.appSetting.findUnique({ where: { key: "payrollAnchor" } }) : null,
    // Date of birth is free text, so it's filtered by day after loading.
    want("BIRTHDAYS")
      ? prisma.employee.findMany({
          where: { status: "ACTIVE", dateOfBirth: { not: null } },
          select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
        })
      : [],
    want("BIRTHDAYS")
      ? prisma.contractor.findMany({
          where: { status: "ACTIVE", dateOfBirth: { not: null } },
          select: { id: true, name: true, contractorFullName: true, dateOfBirth: true },
        })
      : [],
    // Label and section only: values (some encrypted) never reach the calendar.
    want("COMPANY_INFO")
      ? prisma.companyInfoField.findMany({
          where: { expiresAt: inRange },
          select: { id: true, label: true, section: true, expiresAt: true },
        })
      : [],
    want("QUALITY_CHECKS")
      ? prisma.janitorialQualityCheck.findMany({
          where: { scheduledDate: inRange },
          select: {
            id: true,
            scheduledDate: true,
            status: true,
            notes: true,
            recurringContractId: true,
            assignedUser: { select: { email: true } },
            recurringContract: { select: { building: { select: { name: true } } } },
          },
        })
      : [],
    prisma.managementEvent.findMany({
      where: { startDate: { lte: end }, OR: [{ repeat: { not: "NONE" } }, { startDate: { gte: start } }, { endDate: { gte: start } }] },
      select: { id: true, title: true, categoryId: true, startDate: true, endDate: true, repeat: true, notes: true, link: true, doneDates: true },
    }),
  ]);

  const items: ManagementItem[] = [];
  const add = (k: BuiltinKey, item: Omit<ManagementItem, "categoryId" | "done" | "notes"> & { notes?: string | null; done?: boolean }) =>
    items.push({ notes: null, done: false, ...item, categoryId: catId.get(k)! });
  const oneDay = (d: Date) => ({ start: utcDateKey(d), end: utcDateKey(d) });
  const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();
  const within = (d: Date | null): d is Date => !!d && d >= start && d <= end;

  for (const p of policies) {
    add("SUEEP_INSURANCE", {
      key: `policy:${p.id}`,
      title: `${policyTypeLabel(p.policyType)} expires`,
      detail: [p.carrier, p.policyNumber && `#${p.policyNumber}`].filter(Boolean).join(", "),
      href: "/erp/insurance",
      ...oneDay(p.expiresAt),
    });
  }

  for (const c of contractors) {
    const coverage: [string, string, Date | null][] = [
      ["gl", "General liability", c.glExpiresAt],
      ["wc", "Workers' comp", c.workersCompExempt ? null : c.workersCompExpiresAt],
      ["auto", "Auto", c.autoExpiresAt],
      ["umbrella", "Umbrella", c.umbrellaExpiresAt],
    ];
    for (const [k, label, d] of coverage) {
      if (!within(d)) continue;
      add("SUB_INSURANCE", { key: `sub:${c.id}:${k}`, title: `${c.name}: ${label} expires`, detail: null, href: `/erp/contractors/${c.id}`, ...oneDay(d) });
    }
  }

  for (const project of coiProjects) {
    const current = currentCoiIds(project.cois);
    for (const coi of project.cois) {
      if (!current.has(coi.id) || !within(coi.expiresAt)) continue;
      add("PROJECT_COIS", {
        key: `coi:${coi.id}`,
        title: `COI for ${coi.holderName} expires`,
        detail: project.jobTitle,
        href: `/erp/projects/${project.id}`,
        ...oneDay(coi.expiresAt),
      });
    }
  }

  for (const r of coiRequests) {
    add("COI_REQUESTS", {
      key: `coireq:${r.id}`,
      title: `COI due for ${r.requesterCompany || r.requesterName}`,
      detail: r.project?.jobTitle ?? r.projectText ?? null,
      href: "/erp/insurance/requests",
      ...oneDay(r.neededBy!),
    });
  }

  for (const t of employeeTimeOff) {
    add("TIME_OFF", {
      key: `eto:${t.id}`,
      title: `${fullName(t.employee)}: ${TIME_OFF_LABELS[t.type] ?? "Time off"}${t.status === "PENDING" ? " (pending)" : ""}`,
      detail: formatItemDates(utcDateKey(t.startDate), utcDateKey(t.endDate)),
      notes: t.notes,
      href: `/erp/employees/${t.employee.id}`,
      start: utcDateKey(t.startDate),
      end: utcDateKey(t.endDate),
    });
  }
  for (const t of contractorTimeOff) {
    add("TIME_OFF", {
      key: `cto:${t.id}`,
      title: `${t.contractor.name}: ${TIME_OFF_LABELS[t.type] ?? "Time off"}${t.status === "PENDING" ? " (pending)" : ""}`,
      detail: `Contractor, ${formatItemDates(utcDateKey(t.startDate), utcDateKey(t.endDate))}`,
      notes: t.notes,
      href: `/erp/contractors/${t.contractor.id}`,
      start: utcDateKey(t.startDate),
      end: utcDateKey(t.endDate),
    });
  }

  for (const e of employeeChecks) {
    add("BACKGROUND_CHECKS", {
      key: `ebg:${e.id}`,
      title: `${fullName(e)}: background check expires`,
      detail: "Employee",
      href: `/erp/employees/${e.id}`,
      ...oneDay(e.backgroundCheckExpiresAt!),
    });
  }
  for (const c of contractorChecks) {
    add("BACKGROUND_CHECKS", {
      key: `cbg:${c.id}`,
      title: `${c.name}: background check expires`,
      detail: "Contractor",
      href: `/erp/contractors/${c.id}`,
      ...oneDay(c.backgroundCheckExpiresAt!),
    });
  }

  for (const d of documents) {
    add("EMPLOYEE_DOCUMENTS", {
      key: `edoc:${d.id}`,
      title: `${fullName(d.employee)}: ${d.title || d.documentType} expires`,
      detail: null,
      href: `/erp/employees/${d.employee.id}`,
      ...oneDay(d.expiresAt!),
    });
  }

  for (const c of contracts) {
    const href = `/erp/janitorial/contracts/${c.id}`;
    const status = c.status === "ACTIVE" ? null : `Status: ${c.status.toLowerCase()}`;
    if (within(c.startDate)) {
      add("JANITORIAL_CONTRACTS", { key: `jc-start:${c.id}`, title: `${c.building.name} contract starts`, detail: status, href, ...oneDay(c.startDate) });
    }
    if (c.status !== "ENDED" && within(c.expirationDate)) {
      add("JANITORIAL_CONTRACTS", {
        key: `jc-expires:${c.id}`,
        title: `${c.building.name} contract expires`,
        detail: "Yearly term ends. Click Renew for another year on the contract page once renewed.",
        href,
        ...oneDay(c.expirationDate),
      });
    }
    if (within(c.endDate)) {
      add("JANITORIAL_CONTRACTS", { key: `jc:${c.id}`, title: `${c.building.name} contract ends`, detail: status, href, ...oneDay(c.endDate) });
    }
  }

  if (want("PAYROLL")) {
    const anchor = anchorDate(anchorSetting?.value || DEFAULT_PAYROLL_ANCHOR);
    const periods: { start: Date; end: Date }[] = [];
    for (let i = biweeklyIndex(start, anchor); ; i++) {
      const p = biweeklyRange(i, anchor);
      if (p.start > end) break;
      const lastDay = keyToDate(utcDateKey(p.end));
      if (within(lastDay)) periods.push({ start: p.start, end: lastDay });
    }
    const closed = periods.length
      ? new Set(
          (await prisma.payrollPeriodClose.findMany({ where: { periodStart: { in: periods.map((p) => p.start) } }, select: { periodStart: true } })).map(
            (c) => c.periodStart.getTime()
          )
        )
      : new Set<number>();
    for (const p of periods) {
      const isClosed = closed.has(p.start.getTime());
      add("PAYROLL", {
        key: `payroll:${utcDateKey(p.start)}`,
        title: "Pay period ends",
        detail: `${formatItemDates(utcDateKey(p.start), utcDateKey(p.end))}${isClosed ? ", payroll closed" : ""}`,
        href: "/erp/payroll",
        done: isClosed,
        ...oneDay(p.end),
      });
    }
  }

  const birthdays: { key: string; name: string; dob: string | null; detail: string; href: string }[] = [
    ...employeeBirthdays.map((e) => ({ key: `bday:e:${e.id}`, name: fullName(e), dob: e.dateOfBirth, detail: "Employee", href: `/erp/employees/${e.id}` })),
    ...contractorBirthdays.map((c) => ({
      key: `bday:c:${c.id}`,
      name: c.contractorFullName || c.name,
      dob: c.dateOfBirth,
      detail: "Contractor",
      href: `/erp/contractors/${c.id}`,
    })),
  ];
  for (const b of birthdays) {
    const dob = parseBirthDateKey(b.dob);
    if (!dob) continue;
    // Feb 29 birthdays land on Feb 28 in other years.
    for (const occ of eventOccurrences(dob, null, "YEARLY", startKey, endKey)) {
      add("BIRTHDAYS", { key: `${b.key}:${occ.start}`, title: `${b.name}'s birthday`, detail: b.detail, href: b.href, ...occ });
    }
  }

  for (const f of companyInfoFields) {
    add("COMPANY_INFO", {
      key: `companyinfo:${f.id}`,
      title: `${f.label} expires`,
      detail: COMPANY_INFO_SECTIONS.find((s) => s.id === f.section)?.label ?? null,
      href: COMPANY_INFO_SECTIONS.find((s) => s.id === f.section)?.tab === "financial" ? "/erp/company-info/financial" : "/erp/company-info",
      ...oneDay(f.expiresAt!),
    });
  }

  const checkerNames = await namesByEmail(qualityChecks.flatMap((q) => (q.assignedUser ? [q.assignedUser.email] : [])));
  for (const q of qualityChecks) {
    add("QUALITY_CHECKS", {
      key: `qc:${q.id}`,
      title: `${q.recurringContract.building.name} quality check`,
      detail: checkerName(q.assignedUser, checkerNames),
      notes: q.notes,
      href: `/erp/janitorial/quality-checks/${q.id}`,
      done: q.status === "DONE",
      tracksDone: true,
      ...oneDay(q.scheduledDate),
    });
  }

  const known = new Set(categories.map((c) => c.id));
  for (const ev of events) {
    if (!known.has(ev.categoryId)) continue;
    const repeat = isRepeatValue(ev.repeat) ? ev.repeat : "NONE";
    const evStart = utcDateKey(ev.startDate);
    const evEnd = ev.endDate ? utcDateKey(ev.endDate) : null;
    const done = new Set(ev.doneDates);
    for (const occ of eventOccurrences(evStart, evEnd, repeat, startKey, endKey)) {
      items.push({
        key: `event:${ev.id}:${occ.start}`,
        categoryId: ev.categoryId,
        title: ev.title,
        start: occ.start,
        end: occ.end,
        detail: null,
        notes: ev.notes,
        href: ev.link,
        done: done.has(occ.start),
        event: { id: ev.id, repeat, startDate: evStart, endDate: evEnd, link: ev.link },
      });
    }
  }

  return items.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
