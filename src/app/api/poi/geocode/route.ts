import { NextRequest, NextResponse } from "next/server";

const AMAP_WEB_KEY = process.env.NEXT_PUBLIC_AMAP_WEB_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";
const AMAP_GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || "";

  if (!address.trim()) {
    return NextResponse.json({ success: false, error: "address is required" }, { status: 400 });
  }

  if (!AMAP_WEB_KEY) {
    return NextResponse.json({ success: false, error: "AMap key not configured" }, { status: 500 });
  }

  try {
    const params = new URLSearchParams({
      key: AMAP_WEB_KEY,
      address,
    });
    const res = await fetch(`${AMAP_GEOCODE_URL}?${params}`);
    const data = await res.json();

    if (data.status !== "1" || !data.geocodes?.length) {
      return NextResponse.json({
        success: false,
        error: data.info || "未找到该城市",
      });
    }

    const geocode = data.geocodes[0];
    const [lng, lat] = String(geocode.location || "").split(",").map(Number);

    if (!lng || !lat) {
      return NextResponse.json({ success: false, error: "定位结果无效" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        name: geocode.city || geocode.province || address,
        lng,
        lat,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
