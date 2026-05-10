import { NextRequest, NextResponse } from "next/server";

const AMAP_WEB_KEY = process.env.NEXT_PUBLIC_AMAP_WEB_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";
const AMAP_POI_URL = "https://restapi.amap.com/v3/place/text";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword") || "";
  const city = searchParams.get("city") || "";
  const types = searchParams.get("types") || "";
  const limit = searchParams.get("limit") || "20";

  if (!keyword) {
    return NextResponse.json({ success: false, error: "keyword is required" }, { status: 400 });
  }

  if (!AMAP_WEB_KEY) {
    return NextResponse.json({
      success: true,
      data: { pois: [], count: 0 },
      note: "AMap key not configured",
    });
  }

  try {
    const searchOnce = async (cityKeyword: string) => {
      const params = new URLSearchParams({
        key: AMAP_WEB_KEY,
        keywords: keyword,
        city: cityKeyword,
        offset: limit,
        page: "1",
        extensions: "all",
      });
      if (types) params.set("types", types);
      const res = await fetch(`${AMAP_POI_URL}?${params}`);
      return res.json();
    };

    let data = await searchOnce(city);
    const noResults = data.status === "1" && (!data.pois || data.pois.length === 0);
    if (city && noResults) {
      data = await searchOnce("");
    }

    if (data.status !== "1") {
      return NextResponse.json({
        success: false,
        error: data.info || "AMap API error",
      });
    }

    const pois = (data.pois || []).map((poi: any, i: number) => ({
      amapId: poi.id || `poi-${i}`,
      name: poi.name,
      address: poi.address || "",
      coordinate: {
        lng: parseFloat(poi.location?.split(",")[0] || "0"),
        lat: parseFloat(poi.location?.split(",")[1] || "0"),
      },
      category: poi.typecode || "",
      type: getTypeLabel(poi.typecode || ""),
    }));

    return NextResponse.json({
      success: true,
      data: { pois, count: parseInt(data.count || "0") },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

function getTypeLabel(typecode: string): string {
  const code = typecode.substring(0, 2);
  const map: Record<string, string> = {
    "05": "food",
    "06": "food",
    "10": "hotel",
    "11": "attraction",
    "14": "attraction",
    "15": "transport",
  };
  return map[code] || "attraction";
}
