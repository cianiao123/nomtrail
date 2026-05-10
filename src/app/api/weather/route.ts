import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const days = parseInt(searchParams.get("days") || "7");

  // Mock weather data - in prod this would proxy to QWeather API
  const conditions = ["晴", "多云", "小雨", "晴转多云", "阴", "阵雨", "晴"];
  const forecasts = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split("T")[0],
      condition: conditions[i % conditions.length]!,
      tempHigh: Math.round(Math.random() * 10 + 20),
      tempLow: Math.round(Math.random() * 8 + 8),
      humidity: Math.round(Math.random() * 40 + 30),
      windSpeed: Math.round(Math.random() * 8 + 2),
      icon: (100 + i).toString(),
      precipProbability: i % 2 === 0 ? 0.1 : 0.6,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      location: `${lat}, ${lng}`,
      forecasts,
    },
  });
}
