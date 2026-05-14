"use client";

import { useEffect, useRef, useState } from "react";
import { useTripStore } from "@/stores/tripStore";
import { useMapStore } from "@/stores/mapStore";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Icon } from "@/components/shared/Icon";
import type { Activity } from "@/types/trip";

type LngLat = [number, number];
type MapOverlay = unknown;
type AMapMap = {
  add: (overlay: MapOverlay) => void;
  addControl: (control: MapOverlay) => void;
  clearMap: () => void;
  destroy: () => void;
  setCenter: (point: LngLat) => void;
  setFitView: (overlays?: MapOverlay[], immediately?: boolean, avoid?: [number, number, number, number], maxZoom?: number) => void;
  setZoom: (zoom: number) => void;
};
type AMapMarker = MapOverlay & {
  on: (event: "click", handler: () => void) => void;
};
type AMapApi = {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap;
  Geocoder: new (options: Record<string, unknown>) => {
    getLocation: (
      address: string,
      callback: (status: string, result: { geocodes?: { location?: unknown }[] }) => void
    ) => void;
  };
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  Polyline: new (options: Record<string, unknown>) => MapOverlay;
  Pixel: new (x: number, y: number) => MapOverlay;
  Scale: new () => MapOverlay;
  InfoWindow: new (options: Record<string, unknown>) => { open: (map: AMapMap, point: LngLat) => void };
};

let AMapLoaderPromise: Promise<AMapApi> | null = null;
let AMapInstance: AMapApi | null = null;
const geocodeCache = new Map<string, LngLat | null>();
const geocodeInFlight = new Map<string, Promise<LngLat | null>>();

function loadAMapSDK(): Promise<AMapApi> {
  if (AMapInstance) return Promise.resolve(AMapInstance);
  if (AMapLoaderPromise) return AMapLoaderPromise;

  AMapLoaderPromise = import("@amap/amap-jsapi-loader")
    .then(async (mod) => {
      const { configureAMapSecurity } = await import("@/lib/map/amapLoader");
      configureAMapSecurity();
      const loader = mod.default || mod;
      return loader.load({
        key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
        version: "2.0",
        plugins: ["AMap.Scale", "AMap.Geolocation", "AMap.Geocoder", "AMap.PlaceSearch", "AMap.Marker", "AMap.Polyline", "AMap.InfoWindow"],
      });
    })
    .then((AMap: AMapApi) => { AMapInstance = AMap; return AMap; });

  return AMapLoaderPromise;
}

function createMarkerHTML(label: string, isFirst: boolean) {
  const bg = isFirst ? "#0f3764" : "#526579";
  const size = isFirst ? 28 : 24;
  const fontSize = isFirst ? 12 : 11;
  return `<div style="width:${size}px;height:${size}px;background:${bg};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.2);border:2.5px solid #fff;cursor:pointer;font-family:'DM Sans',-apple-system,sans-serif;">${label}</div>`;
}

function buildGeocodeCacheKey(destCity: string, name: string) {
  return `${destCity.trim()}::${name.trim()}`;
}

async function geocodeActivity(webKey: string, destCity: string, name: string): Promise<LngLat | null> {
  const cacheKey = buildGeocodeCacheKey(destCity, name);
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? null;
  }
  const inFlight = geocodeInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const task = resolveActivityCoordinate(webKey, destCity, name)
    .then((point) => {
      geocodeCache.set(cacheKey, point);
      geocodeInFlight.delete(cacheKey);
      return point;
    })
    .catch(() => {
      geocodeInFlight.delete(cacheKey);
      return null;
    });

  geocodeInFlight.set(cacheKey, task);
  return task;
}

async function resolveActivityCoordinate(webKey: string, destCity: string, name: string): Promise<LngLat | null> {
  const sdkPoint = await geocodeWithSDK(destCity, name);
  if (sdkPoint) return sdkPoint;

  const poiPoint = await searchPOI(name, destCity);
  if (poiPoint) return poiPoint;

  if (!webKey) return null;

  try {
    const params = new URLSearchParams({
      key: webKey,
      city: destCity,
      address: name,
    });
    const res = await fetch(`https://restapi.amap.com/v3/geocode/geo?${params}`);
    const data = await res.json() as { status?: string; geocodes?: { location?: string }[] };
    const location = data.status === "1" ? data.geocodes?.[0]?.location : undefined;
    if (!location) return null;
    const [lng, lat] = location.split(",").map(Number);
    return toLngLat(lng, lat);
  } catch {
    return null;
  }
}

async function searchPOI(name: string, destCity: string): Promise<LngLat | null> {
  try {
    const params = new URLSearchParams({
      keyword: name,
      city: destCity,
    });
    const res = await fetch(`/api/poi/search?${params}`);
    const data = await res.json() as {
      success?: boolean;
      data?: { pois?: { coordinate?: { lng?: number; lat?: number } }[] };
    };
    const coord = data.success ? data.data?.pois?.[0]?.coordinate : undefined;
    return toLngLat(coord?.lng, coord?.lat);
  } catch {
    return null;
  }
}

function geocodeWithSDK(destCity: string, name: string): Promise<LngLat | null> {
  const AMap = AMapInstance;
  if (!AMap?.Geocoder) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (point: LngLat | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(point);
    };
    const timeoutId = window.setTimeout(() => finish(null), 1200);
    const geocoder = new AMap.Geocoder({ city: destCity || undefined });
    geocoder.getLocation(`${destCity}${name}`, (status, result) => {
      if (status !== "complete") {
        finish(null);
        return;
      }
      finish(readAMapLocation(result.geocodes?.[0]?.location));
    });
  });
}

function readAMapLocation(location: unknown): LngLat | null {
  if (!location) return null;
  if (typeof location === "string") {
    const [lng, lat] = location.split(",").map(Number);
    return toLngLat(lng, lat);
  }
  if (typeof location === "object") {
    const loc = location as {
      lng?: number;
      lat?: number;
      getLng?: () => number;
      getLat?: () => number;
    };
    return toLngLat(loc.lng ?? loc.getLng?.(), loc.lat ?? loc.getLat?.());
  }
  return null;
}

function toLngLat(lng?: number, lat?: number): LngLat | null {
  if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 || lat === 0) {
    return null;
  }
  return [lng, lat];
}

function fitMapToMarkers(map: AMapMap, markers: AMapMarker[]) {
  requestAnimationFrame(() => {
    if (markers.length >= 2) {
      map.setFitView(markers, false, [36, 36, 36, 36], 17);
    } else if (markers.length === 1) {
      map.setFitView(markers, false, [48, 48, 48, 48], 16);
    }
  });
}

function addMarker(map: AMapMap, activity: Activity, idx: number, lng: number, lat: number) {
  const AMap = AMapInstance;
  if (!AMap) throw new Error("AMap SDK is not ready");
  const div = document.createElement("div");
  div.innerHTML = createMarkerHTML(String(idx + 1), idx === 0);
  const marker = new AMap.Marker({
    position: [lng, lat],
    content: div,
    anchor: "bottom-center",
    offset: new AMap.Pixel(0, -4),
  });
  marker.on("click", () => {
    new AMap.InfoWindow({
      content: `<div style="padding:14px 18px;font-family:inherit;min-width:200px"><h4 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.1rem;font-weight:500;color:#0f1f33;margin:0 0 6px 0">${activity.poi?.name || activity.customName || ""}</h4><div style="display:flex;gap:12px;font-size:0.75rem;color:#526579"><span>${activity.startTime || ""} - ${activity.endTime || ""}</span></div></div>`,
      offset: new AMap.Pixel(0, -30),
    }).open(map, [lng, lat]);
  });
  map.add(marker);
  return marker;
}

function drawRouteLine(map: AMapMap, points: LngLat[]) {
  const AMap = AMapInstance;
  if (!AMap || points.length < 2) return;

  const glowLine = new AMap.Polyline({
    path: points,
    strokeColor: "#8fb4d9",
    strokeWeight: 11,
    strokeOpacity: 0.26,
    strokeStyle: "solid",
    lineJoin: "round",
    lineCap: "round",
    zIndex: 70,
  });

  const polyline = new AMap.Polyline({
    path: points,
    strokeColor: "#143d6b",
    strokeWeight: 4,
    strokeOpacity: 0.94,
    strokeStyle: "solid",
    lineJoin: "round",
    lineCap: "round",
    showDir: true,
    zIndex: 80,
  });

  const accentLine = new AMap.Polyline({
    path: points,
    strokeColor: "#dbe9f6",
    strokeWeight: 2,
    strokeOpacity: 0.75,
    strokeStyle: "dashed",
    strokeDasharray: [8, 8],
    lineJoin: "round",
    lineCap: "round",
    zIndex: 81,
  });

  map.add(glowLine);
  map.add(polyline);
  map.add(accentLine);
}

export function MapPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const destroyedRef = useRef(false);
  const renderRunRef = useRef(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const currentTrip = useTripStore((s) => s.currentTrip);
  const updateActivity = useTripStore((s) => s.updateActivity);
  const selectedDayIndex = useMapStore((s) => s.selectedDayIndex);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current) return;
    destroyedRef.current = false;

    loadAMapSDK()
      .then((AMap) => {
        if (destroyedRef.current || !containerRef.current) return;
        const map = new AMap.Map(containerRef.current, {
          zoom: 12,
          center: [116.397, 39.909],
          viewMode: "2D",
          resizeEnable: true,
        });
        map.addControl(new AMap.Scale());
        mapRef.current = map;
        setState("ready");
      })
      .catch((err: Error) => {
        if (!destroyedRef.current) {
          setErrorMsg(err.message || "未知错误");
          setState("error");
        }
      });

    return () => {
      destroyedRef.current = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  // Update markers when selected day changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready" || !currentTrip) return;

    const renderRun = renderRunRef.current + 1;
    renderRunRef.current = renderRun;
    map.clearMap();

    const day = currentTrip.days[selectedDayIndex];
    if (!day?.activities?.length) {
      const point = toLngLat(currentTrip.destinationCoord?.lng, currentTrip.destinationCoord?.lat);
      if (point) {
        map.setCenter(point);
        map.setZoom(12);
      }
      return;
    }

    const destCity = currentTrip.destination || "";
    const webKey = process.env.NEXT_PUBLIC_AMAP_WEB_KEY || "";
    const markers: AMapMarker[] = [];
    const routePoints: Array<LngLat | null> = new Array(day.activities.length).fill(null);

    const markerTasks = day.activities.map(async (activity, idx) => {
      const coord = activity.poi?.coordinate;
      const point = toLngLat(coord?.lng, coord?.lat);
      if (point) {
        const marker = addMarker(map, activity, idx, point[0], point[1]);
        markers.push(marker);
        routePoints[idx] = point;
        return;
      }
      const name = activity.poi?.name || activity.customName || "";
      if (!name) return;

      const geocodedPoint = await geocodeActivity(webKey, destCity, name);
      if (!geocodedPoint || destroyedRef.current || renderRunRef.current !== renderRun) return;
      if (activity.poi && !point) {
        updateActivity(activity.id, {
          poi: {
            ...activity.poi,
            coordinate: {
              lng: geocodedPoint[0],
              lat: geocodedPoint[1],
            },
          },
        });
      }
      const marker = addMarker(map, activity, idx, geocodedPoint[0], geocodedPoint[1]);
      markers.push(marker);
      routePoints[idx] = geocodedPoint;
    });

    Promise.allSettled(markerTasks).then(() => {
      if (destroyedRef.current || renderRunRef.current !== renderRun) return;
      const orderedPoints = routePoints.filter((point): point is LngLat => !!point);
      drawRouteLine(map, orderedPoints);
      fitMapToMarkers(map, markers);
    });
  }, [selectedDayIndex, state, currentTrip, updateActivity]);

  if (state === "error") {
    return (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center overflow-hidden bg-surface-container">
        <div className="text-center p-8">
          <Icon name="map_off" className="text-[48px] text-error/50 mb-4" />
          <p className="font-body-md text-on-surface-variant">地图加载失败</p>
          <p className="font-caption text-on-surface-variant mt-2">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[240px] w-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-container">
          <div className="text-center">
            <LoadingSpinner size="lg" className="mx-auto mb-3" />
            <p className="font-body-md text-on-surface-variant">地图加载中...</p>
          </div>
        </div>
      )}
    </div>
  );
}
