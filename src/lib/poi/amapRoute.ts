export type AmapRouteMode = "walking" | "driving" | "bicycling";

export type AmapRoutePoint = {
  lng: number;
  lat: number;
};

export type AmapRouteResult = {
  mode: AmapRouteMode;
  distanceMeters: number;
  durationSeconds: number;
};

const AMAP_ROUTE_ENDPOINTS: Record<AmapRouteMode, string> = {
  walking: "https://restapi.amap.com/v5/direction/walking",
  driving: "https://restapi.amap.com/v5/direction/driving",
  bicycling: "https://restapi.amap.com/v5/direction/bicycling",
};

function amapWebKey() {
  return (
    process.env.NEXT_PUBLIC_AMAP_WEB_KEY ||
    process.env.NEXT_PUBLIC_AMAP_KEY ||
    ""
  ).trim();
}

function formatAmapRoutePoint(point: AmapRoutePoint) {
  return `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
}

export function buildAmapRouteUrl({
  key,
  mode,
  origin,
  destination,
}: {
  key: string;
  mode: AmapRouteMode;
  origin: AmapRoutePoint;
  destination: AmapRoutePoint;
}) {
  const url = new URL(AMAP_ROUTE_ENDPOINTS[mode]);
  url.searchParams.set("key", key);
  url.searchParams.set("origin", formatAmapRoutePoint(origin));
  url.searchParams.set("destination", formatAmapRoutePoint(destination));
  url.searchParams.set("show_fields", "cost");
  url.searchParams.set("output", "json");
  if (mode === "driving") {
    url.searchParams.set("strategy", "32");
  }
  return url;
}

function readRouteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export async function fetchAmapRoute({
  mode,
  origin,
  destination,
  signal,
}: {
  mode: AmapRouteMode;
  origin: AmapRoutePoint;
  destination: AmapRoutePoint;
  signal?: AbortSignal;
}): Promise<AmapRouteResult | null> {
  const key = amapWebKey();
  if (!key) return null;

  try {
    const url = buildAmapRouteUrl({ key, mode, origin, destination });
    const res = await fetch(url, {
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(2500),
    });
    const data = await res.json() as {
      status?: string;
      route?: {
        paths?: Array<{
          distance?: string | number;
          duration?: string | number;
          cost?: { duration?: string | number };
        }>;
      };
    };
    const path = data.status === "1" ? data.route?.paths?.[0] : undefined;
    const distanceMeters = readRouteNumber(path?.distance);
    const durationSeconds = readRouteNumber(path?.cost?.duration ?? path?.duration);
    if (typeof distanceMeters !== "number" || typeof durationSeconds !== "number") {
      return null;
    }
    return { mode, distanceMeters, durationSeconds };
  } catch {
    return null;
  }
}
