import { NextRequest, NextResponse } from "next/server";
import {
  AMAP_GEOCODE_URL,
  AMAP_REGEOCODE_URL,
  AMAP_WEATHER_URL,
  buildAmapGeocodeParams,
  buildAmapRegeocodeParams,
  buildAmapWeatherParams,
  normalizeAmapWeatherResponse,
  readAdcodeFromGeocodeResponse,
  readAdcodeFromRegeocodeResponse,
} from "@/lib/weather/amapWeather";

const AMAP_WEB_SERVICE_KEY =
  process.env.AMAP_WEB_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_AMAP_WEB_KEY ||
  process.env.NEXT_PUBLIC_AMAP_KEY ||
  "";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const adcode = searchParams.get("adcode") || "";
  const city = searchParams.get("city") || searchParams.get("destination") || "";
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const days = clampDays(searchParams.get("days"));

  if (!AMAP_WEB_SERVICE_KEY) {
    return NextResponse.json({ success: false, error: "AMap web service key not configured" }, { status: 500 });
  }

  if (!adcode && !city.trim() && (!lat || !lng)) {
    return NextResponse.json({ success: false, error: "city, destination, adcode or lat/lng is required" }, { status: 400 });
  }

  try {
    const cityAdcode = await resolveAdcode({ key: AMAP_WEB_SERVICE_KEY, adcode, city, lat, lng });
    if (!cityAdcode) {
      return NextResponse.json({ success: false, error: "未找到可查询天气的城市编码" }, { status: 404 });
    }

    const weatherParams = buildAmapWeatherParams({
      key: AMAP_WEB_SERVICE_KEY,
      city: cityAdcode,
      extensions: "all",
    });
    const res = await fetch(`${AMAP_WEATHER_URL}?${weatherParams}`, { cache: "no-store" });
    const data = await res.json();
    const weather = normalizeAmapWeatherResponse(data, days);

    return NextResponse.json({
      success: true,
      data: weather,
      meta: {
        provider: "amap",
        adcode: cityAdcode,
        maxForecastDays: 4,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String((err as Error).message || err) }, { status: 500 });
  }
}

function clampDays(value: string | null) {
  const parsed = Number.parseInt(value || "4", 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(4, Math.max(1, parsed));
}

async function resolveAdcode({
  key,
  adcode,
  city,
  lat,
  lng,
}: {
  key: string;
  adcode: string;
  city: string;
  lat: string | null;
  lng: string | null;
}) {
  if (/^\d{6}$/.test(adcode)) return adcode;
  if (/^\d{6}$/.test(city)) return city;

  if (city.trim()) {
    const params = buildAmapGeocodeParams({ key, address: city.trim() });
    const res = await fetch(`${AMAP_GEOCODE_URL}?${params}`, { cache: "no-store" });
    const data = await res.json();
    return readAdcodeFromGeocodeResponse(data);
  }

  if (lat && lng) {
    const params = buildAmapRegeocodeParams({ key, lat, lng });
    const res = await fetch(`${AMAP_REGEOCODE_URL}?${params}`, { cache: "no-store" });
    const data = await res.json();
    return readAdcodeFromRegeocodeResponse(data);
  }

  return "";
}
