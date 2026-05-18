import type { WeatherResponse } from "@/types/weather";

export type WeatherQuery = {
  city: string;
  days: number;
};

const WEATHER_WORDS = /天气|气温|温度|冷不冷|热不热|下雨|下雪|雨|雪|穿什么/;
const TRIP_WORDS = /想去|计划去|准备去|我要去|旅行|旅游|自由行|行程|路线|攻略|玩\d*\s*天|玩|酒店|美食|景点/;

export function parseWeatherQuery(message: string): WeatherQuery | null {
  const text = message.trim();
  if (!WEATHER_WORDS.test(text) || TRIP_WORDS.test(text)) return null;

  const cityMatch = text.match(/(?:今天|明天|后天|这周|周末)?\s*([\u4e00-\u9fa5]{2,12})(?:市)?(?:的)?(?:天气|气温|温度|冷不冷|热不热|下雨|下雪|雨|雪|穿什么)/)
    ?? text.match(/(?:天气|气温|温度|冷不冷|热不热|下雨|下雪|雨|雪|穿什么).*?([\u4e00-\u9fa5]{2,12})(?:市)?/);
  const city = cleanWeatherCity(cityMatch?.[1] || "");
  if (!city) return null;

  return {
    city,
    days: /后天/.test(text) ? 3 : /明天/.test(text) ? 2 : 1,
  };
}

export function formatWeatherAnswer(message: string, weather: WeatherResponse) {
  const query = parseWeatherQuery(message);
  const targetIndex = Math.max(0, Math.min((query?.days ?? 1) - 1, weather.forecasts.length - 1));
  const forecast = weather.forecasts[targetIndex];
  const city = query?.city || normalizeWeatherLocation(weather.location) || "当地";
  const dayLabel = /后天/.test(message) ? "后天" : /明天/.test(message) ? "明天" : "今天";

  if (!forecast) return `暂时没有查到${city}${dayLabel}的天气。`;

  const temp = `${forecast.tempLow}°C到${forecast.tempHigh}°C`;
  const clothing = buildClothingSuggestion(forecast.tempLow, forecast.tempHigh, forecast.condition);
  return `${dayLabel}${city}预计${forecast.condition}，气温${temp}。${clothing}`;
}

function cleanWeatherCity(value: string) {
  return value
    .replace(/^(想问|问下|查下|看看|请问|一下|今天|明天|后天)/, "")
    .replace(/(今天|明天|后天|这周|周末|什么|会不会|有没有|是不是).*$/, "")
    .trim();
}

function normalizeWeatherLocation(location: string) {
  const parts = location.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1]?.replace(/市$/, "") || "";
}

function buildClothingSuggestion(low: number, high: number, condition: string) {
  if (condition.includes("雨")) return "建议带伞，穿防滑好走的鞋。";
  if (condition.includes("雪")) return "注意保暖和防滑，外套、围巾、手套都可以备上。";
  if (high <= 8) return "体感会偏冷，建议穿厚外套或羽绒服。";
  if (low <= 12) return "早晚偏凉，建议外套加内搭。";
  if (high >= 30) return "会比较热，注意防晒和补水。";
  return "体感相对舒适，按日常出门穿搭即可。";
}
