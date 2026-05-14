import { getAMap } from "@/lib/map/amapLoader";

export interface ClientPoiResult {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: string;
}

interface SearchPoiInput {
  keyword: string;
  city: string;
  limit: number;
  types?: string;
}

function readLocation(location: any) {
  if (!location) return { lng: 0, lat: 0 };
  if (typeof location.lng === "number" && typeof location.lat === "number") {
    return { lng: location.lng, lat: location.lat };
  }
  if (typeof location.getLng === "function" && typeof location.getLat === "function") {
    return { lng: location.getLng(), lat: location.getLat() };
  }
  const [lng, lat] = String(location).split(",").map(Number);
  return { lng: lng || 0, lat: lat || 0 };
}

function normalizeType(typecode?: string) {
  const code = String(typecode || "").slice(0, 2);
  if (code === "05" || code === "06") return "food";
  if (code === "10") return "hotel";
  if (code === "15") return "transport";
  return "attraction";
}

export async function searchPoiWithAmapSdk({
  keyword,
  city,
  limit,
  types,
}: SearchPoiInput): Promise<ClientPoiResult[]> {
  const AMap = await getAMap();
  const pageSize = Math.min(Math.max(limit, 1), 50);

  return new Promise((resolve, reject) => {
    const searcher = new AMap.PlaceSearch({
      city,
      citylimit: true,
      extensions: "all",
      pageIndex: 1,
      pageSize,
      type: types,
    });

    searcher.search(keyword, (status: string, result: any) => {
      if (status !== "complete") {
        reject(new Error(result?.info || "AMap PlaceSearch failed"));
        return;
      }

      const pois = Array.isArray(result?.poiList?.pois) ? result.poiList.pois : [];
      resolve(
        pois.slice(0, pageSize).map((poi: any, index: number) => {
          const coordinate = readLocation(poi.location);
          return {
            id: poi.id || `sdk-poi-${index}`,
            name: poi.name || "",
            address: poi.address || "",
            lng: coordinate.lng,
            lat: coordinate.lat,
            type: normalizeType(poi.typecode),
          };
        })
      );
    });
  });
}
