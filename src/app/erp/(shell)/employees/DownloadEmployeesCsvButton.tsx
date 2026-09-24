"use client";

export type EmployeeCsvRow = {
  firstName: string;
  lastName: string;
  role: string;
  payType: string;
  // Pay fields are only sent from the server when the viewer can see pay
  // (canEditPayInfo), so they never reach the browser otherwise.
  hourlyPay?: string;
  annualSalary?: string;
  offshoreMonthlyRate?: string;
  activityStatus: string;
  compliance: string;
  backgroundCheck: string;
  hireDate: string;
  email: string;
  phone: string;
};

function buildEmployeesCsv(rows: EmployeeCsvRow[], includePay: boolean): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const columns: { header: string; get: (r: EmployeeCsvRow) => string }[] = [
    { header: "First Name", get: (r) => r.firstName },
    { header: "Last Name", get: (r) => r.lastName },
    { header: "Role", get: (r) => r.role },
    { header: "Pay Type", get: (r) => r.payType },
    ...(includePay
      ? [
          { header: "Hourly Pay", get: (r: EmployeeCsvRow) => r.hourlyPay ?? "" },
          { header: "Annual Salary", get: (r: EmployeeCsvRow) => r.annualSalary ?? "" },
          { header: "Offshore Monthly Rate", get: (r: EmployeeCsvRow) => r.offshoreMonthlyRate ?? "" },
        ]
      : []),
    { header: "Activity Status", get: (r) => r.activityStatus },
    { header: "Compliance", get: (r) => r.compliance },
    { header: "Background Check", get: (r) => r.backgroundCheck },
    { header: "Hire Date", get: (r) => r.hireDate },
    { header: "Email", get: (r) => r.email },
    { header: "Phone", get: (r) => r.phone },
  ];
  const headers = columns.map((c) => escape(c.header)).join(",");
  const dataRows = rows.map((r) => columns.map((c) => escape(c.get(r))).join(","));
  return [headers, ...dataRows].join("\r\n");
}

export function DownloadEmployeesCsvButton({ rows, includePay }: { rows: EmployeeCsvRow[]; includePay: boolean }) {
  function downloadCsv() {
    // Leading BOM so Excel reads accented names as UTF-8 instead of garbling them.
    const csv = "﻿" + buildEmployeesCsv(rows, includePay);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={downloadCsv}
      disabled={rows.length === 0}
      title="Download the employees currently shown (with filters applied)"
      aria-label="Download CSV"
      className="flex h-8 w-8 items-center justify-center rounded-md bg-pink-600 text-white hover:bg-pink-500 disabled:opacity-40"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
      </svg>
    </button>
  );
}
