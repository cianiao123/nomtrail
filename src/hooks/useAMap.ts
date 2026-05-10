"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Activity } from "@/types/trip";

interface UseAMapOptions {
  containerId: string;
  center?: [number, number]; // [lng, lat]
  zoom?: number;
}

interface MarkerInfo {
  marker: any;
  activityId: string;
}

export function useAMap({ containerId, center = [116.397428, 39.90923], zoom = 12 }: UseAMapOptions) {
  const mapRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markersRef = useRef<MarkerInfo[]>([]);
  const polylinesRef = useRef<any[]>([]);

  // Initialize map
  useEffect(() => {
    let map: any = null;
    let cancelled = false;

    async function initMap() {
      try {
        const { getAMap } = await import("@/lib/map/amapLoader");
        if (cancelled) return;
        const AMap = await getAMap();
        if (cancelled) return;

        const container = document.getElementById(containerId);
        if (!container) return;

        map = new AMap.Map(containerId, {
          viewMode: "3D",
          zoom,
          center,
          resizeEnable: true,
          mapStyle: "amap://styles/light",
        });
        map.addControl(new AMap.Scale());
        mapRef.current = map;
        setLoaded(true);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "地图加载失败");
      }
    }

    initMap();

    return () => {
      cancelled = true;
      map?.destroy();
      mapRef.current = null;
    };
  }, [containerId]);

  // Clear all markers and polylines
  const clearAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => map.remove(m.marker));
    polylinesRef.current.forEach((p) => map.remove(p));
    markersRef.current = [];
    polylinesRef.current = [];
  }, []);

  // Add activity markers
  const addActivityMarkers = useCallback(
    (activities: Activity[], onMarkerClick?: (activityId: string) => void) => {
      const map = mapRef.current;
      if (!map || !(window as any).AMap) return;

      clearAll();

      const bounds: any[] = [];

      activities.forEach((activity) => {
        const poi = activity.poi;
        const coord = poi?.coordinate;
        // For activities without coordinates, use demo coordinates
        const lng = coord?.lng || 116.397 + Math.random() * 0.05;
        const lat = coord?.lat || 39.909 + Math.random() * 0.05;

        bounds.push([lng, lat]);

        const content = document.createElement("div");
        content.className = "flex flex-col items-center";
        content.innerHTML = `
          <div style="
            background: #0f3764; color: white; padding: 2px 8px; border-radius: 12px;
            font-size: 12px; white-space: nowrap; margin-bottom: 4px;
          ">${activity.poi?.name || activity.customName || "景点"}</div>
          <div style="
            width: 12px; height: 12px; background: #0f3764; border-radius: 50%;
            border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          "></div>
        `;

        const marker = new (window as any).AMap.Marker({
          position: [lng, lat],
          content,
          anchor: "bottom-center",
          offset: new (window as any).AMap.Pixel(0, 0),
        });

        marker.on("click", () => onMarkerClick?.(activity.id));
        map.add(marker);
        markersRef.current.push({ marker, activityId: activity.id });
      });

      // Fit bounds to show all markers
      if (bounds.length > 0) {
        map.setFitView(bounds, false, [60, 60, 60, 60]);
      }
    },
    [clearAll]
  );

  // Draw route polyline
  const drawRoute = useCallback(
    (points: { lng: number; lat: number }[], color: string = "#0f3764") => {
      const map = mapRef.current;
      if (!map || !(window as any).AMap || points.length < 2) return;

      const path = points.map((p) => [p.lng, p.lat]);
      const polyline = new (window as any).AMap.Polyline({
        path,
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: 0.7,
        lineJoin: "round",
        showDir: true,
      });

      map.add(polyline);
      polylinesRef.current.push(polyline);
      map.setFitView(polyline);
    },
    []
  );

  // Set map center
  const setCenter = useCallback((lng: number, lat: number) => {
    mapRef.current?.setCenter([lng, lat]);
  }, []);

  // Update zoom
  const setZoom = useCallback((level: number) => {
    mapRef.current?.setZoom(level);
  }, []);

  return {
    map: mapRef.current,
    loaded,
    error,
    clearAll,
    addActivityMarkers,
    drawRoute,
    setCenter,
    setZoom,
  };
}
