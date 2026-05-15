import { useEffect, useState } from "react";

export type ScheduleData = {
  projects: Array<{
    id: string;
    jobTitle: string;
    segment: string;
    status: string;
    projectDate: string | null;
    projectEndDate: string | null;
    createdAt: string;
    percentDone: number;
    supervisor?: string;
  }>;
  laborEntries: Array<{
    id: string;
    projectId: string;
    workDate: string;
    workerName: string;
    role?: string;
    hours: number;
    hourlyRateCents: number;
    taskDescription?: string;
  }>;
};

export function useScheduleData(startDate?: Date, endDate?: Date) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const startIso = startDate?.toISOString();
  const endIso = endDate?.toISOString();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        if (startIso) params.set("startDate", startIso);
        if (endIso) params.set("endDate", endIso);

        const response = await fetch(`/api/erp/schedule?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch schedule data");

        const result = await response.json();
        if (result.success) {
          setData(result.data);
        } else {
          throw new Error(result.error || "Unknown error");
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [startIso, endIso]);

  return { data, loading, error };
}
