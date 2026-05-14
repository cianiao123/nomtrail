import { NextRequest, NextResponse } from "next/server";
import { parsePoiLimit } from "@/lib/poi/searchLimit";

const AMAP_WEB_KEY = process.env.NEXT_PUBLIC_AMAP_WEB_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";
const AMAP_POI_URL = "https://restapi.amap.com/v3/place/text";
const AMAP_PAGE_SIZE = 25;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword") || "";
  const city = searchParams.get("city") || "";
  const types = searchParams.get("types") || "";
  const limit = parsePoiLimit(searchParams.get("limit"));

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
    const searchPage = async (cityKeyword: string, page: number, offset: number) => {
      const params = new URLSearchParams({
        key: AMAP_WEB_KEY,
        keywords: keyword,
        city: cityKeyword,
        offset: String(offset),
        page: String(page),
        extensions: "all",
      });
      if (types) params.set("types", types);
      const res = await fetch(`${AMAP_POI_URL}?${params}`, { cache: "no-store" });
      return res.json();
    };

    const searchMany = async (cityKeyword: string) => {
      const collected: any[] = [];
      let count = 0;
      let lastData: any = null;
      const pageCount = Math.ceil(limit / AMAP_PAGE_SIZE);
      const offset = Math.min(AMAP_PAGE_SIZE, limit);

      for (let page = 1; page <= pageCount; page += 1) {
        const data = await searchPage(cityKeyword, page, offset);
        lastData = data;
        if (data.status !== "1") return { data, pois: collected, count };

        count = Number.parseInt(data.count || "0", 10) || count;
        const pagePois = Array.isArray(data.pois) ? data.pois : [];
        collected.push(...pagePois);

        if (pagePois.length < offset || collected.length >= limit) break;
      }

      return { data: lastData ?? { status: "1", info: "OK" }, pois: collected.slice(0, limit), count };
    };

    let result = await searchMany(city);
    const noResults = result.data.status === "1" && result.pois.length === 0;
    if (city && noResults) {
      result = await searchMany("");
    }

    if (result.data.status !== "1") {
      return NextResponse.json({
        success: false,
        error: result.data.info || "AMap API error",
      });
    }

    const pois = result.pois.map((poi: any, i: number) => ({
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
      data: { pois, count: result.count },
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
