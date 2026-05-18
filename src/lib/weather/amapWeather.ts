import type { WeatherResponse } from "@/types/weather";

export const AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo";
export const AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo";
export const AMAP_REGEOCODE_URL = "https://restapi.amap.com/v3/geocode/regeo";

type AMapWeatherCast = {
  date?: string;
  dayweather?: string;
  nightweather?: string;
  daytemp?: string;
  nighttemp?: string;
  daypower?: string;
};

type AMapWeatherForecast = {
  city?: string;
  adcode?: string;
  province?: string;
  casts?: AMapWeatherCast[];
};

type AMapWeatherResponse = {
  status?: string;
  info?: string;
  forecasts?: AMapWeatherForecast[];
};

type AMapGeocodeResponse = {
  status?: string;
  geocodes?: { adcode?: string | unknown[]; city?: string | unknown[] }[];
};

type AMapRegeocodeResponse = {
  status?: string;
  regeocode?: {
    addressComponent?: {
      adcode?: string;
      city?: string | unknown[];
    };
  };
};

export function buildAmapWeatherParams({
  key,
  city,
  extensions = "all",
}: {
  key: string;
  city: string;
  extensions?: "base" | "all";
}) {
  return new URLSearchParams({
    key,
    city,
    extensions,
    output: "JSON",
  });
}

export function buildAmapGeocodeParams({ key, address }: { key: string; address: string }) {
  return new URLSearchParams({
    key,
    address,
    output: "JSON",
  });
}

export function buildAmapRegeocodeParams({
  key,
  lng,
  lat,
}: {
  key: string;
  lng: string;
  lat: string;
}) {
  return new URLSearchParams({
    key,
    location: `${lng},${lat}`,
    output: "JSON",
  });
}

export function readAdcodeFromGeocodeResponse(data: AMapGeocodeResponse) {
  if (data.status !== "1") return "";
  const rawAdcode = data.geocodes?.[0]?.adcode;
  return typeof rawAdcode === "string" ? rawAdcode : "";
}

export function readAdcodeFromRegeocodeResponse(data: AMapRegeocodeResponse) {
  if (data.status !== "1") return "";
  return data.regeocode?.addressComponent?.adcode || "";
}

export function normalizeAmapWeatherResponse(data: AMapWeatherResponse, days: number): WeatherResponse {
  if (data.status !== "1") {
    throw new Error(data.info || "AMap weather API error");
  }

  const forecast = data.forecasts?.[0];
  const casts = forecast?.casts ?? [];
  const location = [forecast?.province, forecast?.city].filter(Boolean).join(" ") || forecast?.adcode || "";

  return {
    location,
    forecasts: casts.slice(0, days).map((cast) => {
      const condition = mergeWeatherCondition(cast.dayweather, cast.nightweather);
      return {
        date: cast.date || "",
        condition,
        tempHigh: parseWeatherNumber(cast.daytemp),
        tempLow: parseWeatherNumber(cast.nighttemp),
        humidity: 0,
        windSpeed: parseWeatherNumber(cast.daypower),
        icon: weatherIcon(condition),
        precipProbability: condition.includes("雨") || condition.includes("雪") ? 0.6 : 0.1,
      };
    }),
  };
}

function mergeWeatherCondition(day?: string, night?: string) {
  if (!day && !night) return "未知";
  if (!night || day === night) return day || night || "未知";
  return `${day}转${night}`;
}

function parseWeatherNumber(value?: string) {
  const match = String(value ?? "").match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

function weatherIcon(condition: string) {
  if (condition.includes("雨")) return "rainy";
  if (condition.includes("雪")) return "weather_snowy";
  if (condition.includes("晴")) return "wb_sunny";
  if (condition.includes("阴")) return "cloud";
  return "partly_cloudy_day";
}
