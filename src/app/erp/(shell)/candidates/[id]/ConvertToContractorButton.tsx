"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  applicationId: string;
  existingContractorId: string | null;
};

export function ConvertToContractorButton({ applicationId, existingContractorId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/candidates/${applicationId}/convert-to-contractor`, {
        method: "POST",
      });
      const data = (await res.json()) as { id?: string; contractorId?: string; error?: string };
      if (!res.ok) {
        if (data.contractorId) {
          router.push(`/erp/contractors/${data.contractorId}`);
          return;
        }
        setError(data.error || "Failed to convert to contractor");
        setLoading(false);
        return;
      }
      if (data.id) router.push(`/erp/contractors/${data.id}`);
      else router.refresh();
    } catch {
      setError("Network error");
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
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
