"use client";

import { useEffect } from "react";
import { useGeolocation, type GeolocationData } from "@/lib/hooks/useGeolocation";

interface LocationTrackerProps {
  onLocationUpdate?: (location: GeolocationData) => void;
  autoStart?: boolean;
}

/**
 * Component that manages location tracking for workers on the schedule page
 * Requests permission and continuously updates location for admin visibility
 */
export function LocationTracker({ onLocationUpdate, autoStart = true }: LocationTrackerProps) {
  const { location, error, loading, permission, requestPermission, startTracking, isTracking } =
    useGeolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      autoRequest: false,
    });

  // Auto-request permission when component mounts
  useEffect(() => {
    if (autoStart && permission === "prompt") {
      requestPermission();
    }
  }, [autoStart, permission, requestPermission]);

  // Start tracking once permission is granted
  useEffect(() => {
    if (permission === "granted" && !isTracking) {
      startTracking();
    }
  }, [permission, isTracking, startTracking]);

  // Notify parent when location updates
  useEffect(() => {
    if (location && onLocationUpdate) {
      onLocationUpdate(location);
    }
  }, [location, onLocationUpdate]);

  // Show status indicator
  const getStatusColor = () => {
    if (permission === "denied") return "bg-red-100 text-red-700";
    if (isTracking) return "bg-green-100 text-green-700";
    if (loading) return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-700";
  };

  const getStatusText = () => {
    if (permission === "denied") return "Location: Access Denied";
    if (isTracking) return `Location: Active (${location?.accuracy.toFixed(0)}m accuracy)`;
    if (loading) return "Location: Requesting...";
    return "Location: Not Active";
  };

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${getStatusColor()}`}>
      <div
        className={`h-2 w-2 rounded-full ${
          isTracking ? "bg-green-500" : permission === "denied" ? "bg-red-500" : "bg-gray-400"
        }`}
      />
      <span>{getStatusText()}</span>
      {error && <span className="text-xs">({error})</span>}
    </div>
  );
}
