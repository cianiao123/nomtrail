import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.resolve("src/app/trip/[id]/page.tsx"), "utf8");

test("trip detail reserves and hydrates a weather panel", () => {
  assert.match(source, /function WeatherPanel\(\{ days, isLoading/);
  assert.match(source, /正在获取天气/);
  assert.match(source, /暂无天气数据/);
  assert.match(source, /\/api\/weather/);
  assert.doesNotMatch(source, /if \(daysWithWeather\.length === 0\) return null/);
  assert.doesNotMatch(source, /<div className="lg:hidden">\s*<WeatherPanel/s);
});

test("weather panel keeps day labels aligned with itinerary days", () => {
  assert.match(source, /displayWeatherDays = normalizeDisplayDays\(days\)/);
  assert.match(source, /weatherByDate/);
  assert.doesNotMatch(source, /payload\.data!\.forecasts\[index\]/);
});
