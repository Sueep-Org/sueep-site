"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGeolocation } from "@/lib/hooks/useGeolocation";

interface AddLaborEntryFormProps {
  projectId: string;
  projectTitle?: string;
  onSuccess?: () => void;
  defaultDate?: string;
  allProjects?: Array<{ id: string; jobTitle: string }>;
}

interface LaborPayload {
  projectId: string;
  workDate: string;
  workerName: string;
  role: string | null;
  hours: number;
  hourlyRateCents: number;
  taskDescription: string | null;
  locationLatitude?: number;
  locationLongitude?: number;
  locationAccuracy?: number;
}

export function AddLaborEntryForm({
  projectId,
  projectTitle,
  onSuccess,
  defaultDate,
  allProjects = [],
}: AddLaborEntryFormProps) {
  const router = useRouter();
  const { location, error: geoError, requestPermission, permission } = useGeolocation({ enableHighAccuracy: true });
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [projects, setProjects] = useState(allProjects);
  const [locationStatus, setLocationStatus] = useState<"pending" | "captured" | "error">("pending");

  // Request location when form opens
  useEffect(() => {
    if (isOpen && permission === "prompt") {
      requestPermission();
    }
  }, [isOpen, permission, requestPermission]);

  // Update location status based on actual location data
  useEffect(() => {
    if (location) {
      setLocationStatus("captured");
    } else if (geoError || permission === "denied") {
      setLocationStatus("error");
    } else {
      setLocationStatus("pending");
    }
  }, [location, geoError, permission]);

  useEffect(() => {
    if (isOpen && projects.length === 0 && projectId === "new") {
      // Fetch projects
      fetch("/api/erp/projects")
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            setProjects(data.data);
          }
        })
        .catch(console.error);
    }
  }, [isOpen, projectId, projects.length]);

  const today = new Date().toISOString().split("T")[0];
  const [formData, setFormData] = useState({
    projectId: projectId !== "new" ? projectId : "",
    workDate: defaultDate || today,
    workerName: "",
    role: "",
    hours: "",
    hourlyRateCents: "",
    taskDescription: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!formData.projectId || !formData.workerName.trim() || !formData.hours) {
        throw new Error("Project, worker name, and hours are required");
      }

      const payload: LaborPayload = {
        projectId: formData.projectId,
        workDate: formData.workDate,
        workerName: formData.workerName,
        role: formData.role || null,
        hours: parseFloat(formData.hours),
        hourlyRateCents: formData.hourlyRateCents
          ? parseInt(formData.hourlyRateCents)
          : 0,
        taskDescription: formData.taskDescription || null,
      };

      // Include location if available
      if (location) {
        payload.locationLatitude = location.latitude;
        payload.locationLongitude = location.longitude;
        payload.locationAccuracy = location.accuracy;
      }

      const response = await fetch("/api/erp/labor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add labor entry");
      }

      setSuccess(true);
      setFormData({
        projectId: projectId !== "new" ? projectId : "",
        workDate: today,
        workerName: "",
        role: "",
        hours: "",
        hourlyRateCents: "",
        taskDescription: "",
      });

      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
        setLocationStatus("pending");
        router.refresh();
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
      >
        <span>+ Log Hours</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Log Work Hours</h2>
        {projectTitle && <p className="mt-1 text-sm text-gray-500">{projectTitle}</p>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {projectId === "new" && (
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Project *
              </label>
              <select
                value={formData.projectId}
                onChange={(e) =>
                  setFormData({ ...formData, projectId: e.target.value })
                }
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.jobTitle}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600">Work Date</label>
            <input
              type="date"
              value={formData.workDate}
              onChange={(e) =>
                setFormData({ ...formData, workDate: e.target.value })
              }
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Worker Name *
            </label>
            <input
              type="text"
              value={formData.workerName}
              onChange={(e) =>
                setFormData({ ...formData, workerName: e.target.value })
              }
              placeholder="e.g., John Smith"
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Role
            </label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value })
              }
              placeholder="e.g., Lead Painter, Helper"
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Hours *
              </label>
              <input
                type="number"
                step="0.5"
                value={formData.hours}
                onChange={(e) =>
                  setFormData({ ...formData, hours: e.target.value })
                }
                placeholder="e.g., 8"
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Hourly Rate (cents)
              </label>
              <input
                type="number"
                value={formData.hourlyRateCents}
                onChange={(e) =>
                  setFormData({ ...formData, hourlyRateCents: e.target.value })
                }
                placeholder="e.g., 2500"
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Task Description
            </label>
            <textarea
              value={formData.taskDescription}
              onChange={(e) =>
                setFormData({ ...formData, taskDescription: e.target.value })
              }
              placeholder="What work was done?"
              rows={3}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400"
            />
          </div>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-600">
              Hours logged successfully!
            </div>
          )}

          {/* Location Status */}
          <div className={`rounded p-3 text-xs font-medium ${
            locationStatus === "captured" 
              ? "border border-green-300 bg-green-50 text-green-700"
              : locationStatus === "error"
              ? "border border-yellow-300 bg-yellow-50 text-yellow-700"
              : "border border-gray-300 bg-gray-50 text-gray-700"
          }`}>
            <div className="flex items-center justify-between gap-2">
              <span>
                📍 Location: {locationStatus === "captured" ? `Captured (${location?.accuracy.toFixed(0)}m accuracy)` : locationStatus === "error" ? "Enable location access for precise tracking" : "Waiting for location..."}
              </span>
              {locationStatus === "error" && (
                <button
                  type="button"
                  onClick={() => requestPermission()}
                  className="whitespace-nowrap rounded bg-yellow-600 px-2 py-1 text-xs font-semibold text-white hover:bg-yellow-700"
                >
                  Retry
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setError(null);
              }}
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {isLoading ? "Saving..." : "Log Hours"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
