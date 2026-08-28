"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm, useToast } from "@/app/erp/components/ui";

type Props = {
  employeeId: string;
  fullName: string;
  existingContractorId: string | null;
};

export function ConvertToContractorButton({ employeeId, fullName, existingContractorId }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  if (existingContractorId) {
    return (
      <Link
        href={`/erp/contractors/${existingContractorId}`}
        className="text-xs font-medium text-[#E73C6E] hover:underline"
      >
        View Contractor Profile →
      </Link>
    );
  }

  async function onConvert() {
    if (
      !(await confirm({
        message: `Switch ${fullName} to a subcontractor? This creates a linked Contractor profile and marks the employee profile inactive. Past labor and assignment history stays on the employee record.`,
        danger: false,
        confirmLabel: "Convert",
      }))
    )
      return;

    setLoading(true);
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}/convert-to-contractor`, {
        method: "POST",
      });
      const data = (await res.json()) as { id?: string; contractorId?: string; error?: string };
      if (!res.ok) {
        if (data.contractorId) {
          router.push(`/erp/contractors/${data.contractorId}`);
          return;
        }
        toast(data.error || "Failed to convert to contractor", "error");
        setLoading(false);
        return;
      }
      if (data.id) router.push(`/erp/contractors/${data.id}`);
      else router.refresh();
    } catch {
      toast("Network error", "error");
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => void onConvert()}
        disabled={loading}
        className="rounded-md bg-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
      >
        {loading ? "Converting…" : "Convert to Contractor"}
      </button>
    </div>
  );
}
