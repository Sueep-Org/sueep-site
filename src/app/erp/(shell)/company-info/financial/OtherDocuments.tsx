"use client";

import { useState } from "react";
import { Button, InfoTip } from "@/app/erp/components/ui";
import type { CompanyDocumentRow } from "@/lib/erp/companyInfo";
import { AddDocumentModal, DocLink } from "./documents";

/** W9 and any other company paperwork that isn't tied to a year. */
export function OtherDocuments({ docs }: { docs: CompanyDocumentRow[] }) {
  const [adding, setAdding] = useState(false);
  const sorted = [...docs].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Documents
          <InfoTip text="W9 and other company paperwork. Upload the file or paste a Drive link." />
        </h2>
        <Button variant="ghost" size="xs" onClick={() => setAdding(true)}>
          + Add
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">Nothing here yet. Add the W9 first.</p>
      ) : (
        <dl className="divide-y divide-gray-100">
          {sorted.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-2">
              <dt className="w-44 shrink-0 text-xs font-medium text-gray-500">{d.label}</dt>
              <dd className="min-w-0 flex-1 text-sm">
                <DocLink doc={d} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {adding && <AddDocumentModal kind="OTHER" onClose={() => setAdding(false)} />}
    </div>
  );
}
