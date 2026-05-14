"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/shared/Icon";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils/cn";
import { createId } from "@/lib/utils/createId";

interface POI {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: string;
}

const POPULAR_CITIES = [
  { name: "北京", lng: 116.397, lat: 39.909 },
  { name: "上海", lng: 121.473, lat: 31.230 },
  { name: "杭州", lng: 120.155, lat: 30.274 },
  { name: "成都", lng: 104.066, lat: 30.573 },
  { name: "西安", lng: 108.940, lat: 34.260 },
  { name: "广州", lng: 113.264, lat: 23.129 },
  { name: "深圳", lng: 114.058, lat: 22.543 },
  { name: "重庆", lng: 106.551, lat: 29.563 },
  { name: "厦门", lng: 118.089, lat: 24.480 },
  { name: "大理", lng: 100.230, lat: 25.592 },
  { name: "丽江", lng: 100.233, lat: 26.872 },
  { name: "三亚", lng: 109.508, lat: 18.253 },
];

const CATEGORY_MAP: Record<string, { label: string; keyword: string }> = {
  all: { label: "推荐", keyword: "景点" },
  scenic: { label: "景点", keyword: "景点" },
  food: { label: "美食", keyword: "美食" },
  hotel: { label: "住宿", keyword: "酒店" },
};

const CATEGORY_ICONS: Record<string, string> = {
  all: "apps",
  scenic: "landscape",
  food: "restaurant",
  hotel: "hotel",
};

const TYPE_COLORS: Record<string, string> = {
  food: "#2d6f9f",
  hotel: "#526579",
  scenic: "#0f5f9f",
  transport: "#285c83",
};
const TYPE_LABELS: Record<string, string> = {
  food: "美食", hotel: "住宿", scenic: "景点", transport: "交通",
};

const POI_ICONS: Record<string, string> = {
  food: "restaurant",
  hotel: "hotel",
  scenic: "landscape",
  attraction: "landscape",
  transport: "directions_bus",
};

function markerSvg(iconName: string, size: number): string {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
  const paths: Record<string, string> = {
    directions_bus: '<path d="M8 6h8"/><path d="M6 11h12"/><path d="M6 15h12"/><path d="M7 19h1"/><path d="M16 19h1"/><rect x="5" y="3" width="14" height="16" rx="2"/>',
    hotel: '<path d="M3 21V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14"/><path d="M15 11h4a2 2 0 0 1 2 2v8"/><path d="M7 10h4"/><path d="M7 14h4"/>',
    landscape: '<path d="m3 20 7.5-13 4.5 8 2-3.5L21 20H3Z"/><path d="M11 20 8.5 16h7L13 20"/>',
    restaurant: '<path d="M4 3v8"/><path d="M8 3v8"/><path d="M4 7h4"/><path d="M6 11v10"/><path d="M17 3v18"/><path d="M14 3h6"/>',
  };
  return `<svg ${common}>${paths[iconName] ?? '<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'}</svg>`;
}

function normalizePoiType(type: string): string {
  return type === "attraction" ? "scenic" : type || "scenic";
}

export default function ExplorePage() {
  const router = useRouter();
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const psRef = useRef<any>(null);
  const AMapRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedCity, setSelectedCity] = useState(POPULAR_CITIES[0]!);
  const [searchText, setSearchText] = useState("");
  const [searchError, setSearchError] = useState("");
  const [category, setCategory] = useState("all");
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [activePOI, setActivePOI] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<POI[]>([]);
  const [showWishlist, setShowWishlist] = useState(false);

  const MARKER_ICONS: Record<string, string> = {
    food: "restaurant",
    hotel: "hotel",
    scenic: "landscape",
    transport: "directions_bus",
  };

  const renderMarkers = useCallback((poiList: POI[], activeId: string | null) => {
    const AMap = AMapRef.current;
    const map = mapRef.current;
    if (!AMap || !map) return;

    markersRef.current.forEach((m: any) => map.remove(m));
    markersRef.current = [];

    const points: [number, number][] = [];
    poiList.forEach((poi) => {
      if (!poi.lng) return;
      points.push([poi.lng, poi.lat]);

      const color = TYPE_COLORS[poi.type] || "#0f5f9f";
      const iconName = MARKER_ICONS[poi.type] || "place";
      const isActive = activeId === poi.id;
      const size = isActive ? 32 : 26;
      const iconSize = isActive ? 16 : 13;

      const div = document.createElement("div");
      div.innerHTML = `<div style="
        width:${size}px;height:${size}px;background:${color};color:#fff;
        border-radius:50%;display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 10px rgba(0,0,0,0.25);
        border:2px solid #fff;cursor:pointer;transition:all 0.25s ease;
        position:relative;
      ">
        ${markerSvg(iconName, iconSize)}
        ${isActive ? `<div style="
          position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);
          width:6px;height:6px;background:${color};border-radius:50%;
          border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.15);
        "></div>` : ""}
      </div>`;

      const marker = new AMap.Marker({
        position: [poi.lng, poi.lat],
        content: div,
        anchor: "bottom-center",
        offset: new AMap.Pixel(0, isActive ? -6 : 0),
        zIndex: isActive ? 100 : 10,
      });
      marker.on("click", () => setActivePOI(poi.id));
      map.add(marker);
      markersRef.current.push(marker);
    });

    try {
      if (points.length > 0) map.setFitView(points, false, [50, 50, 50, 50]);
    } catch (e) { /* ignore */ }
  }, []);

  const doSearch = useCallback((cityName: string, catKey: string) => {
    setLoading(true);
    const keyword = CATEGORY_MAP[catKey]?.keyword || "景点";
    const params = new URLSearchParams({ keyword, city: cityName, limit: "20" });

    fetch(`/api/poi/search?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.pois?.length > 0) {
          const list = data.data.pois.map((p: any) => ({
            id: p.amapId || createId("poi"),
            name: p.name,
            address: p.address || "",
            lng: p.coordinate?.lng || 0,
            lat: p.coordinate?.lat || 0,
            type: normalizePoiType(p.type),
          }));
          setPois(list);
          setTimeout(() => { try { renderMarkers(list, null); } catch (e) {} }, 100);
        } else {
          setPois([]);
        }
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [renderMarkers]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import("@amap/amap-jsapi-loader")
      .then(async (mod) => {
        const { configureAMapSecurity } = await import("@/lib/map/amapLoader");
        configureAMapSecurity();
        return (mod.default || mod).load({
          key: process.env.NEXT_PUBLIC_AMAP_KEY || "",
          version: "2.0",
          plugins: ["AMap.Scale", "AMap.PlaceSearch", "AMap.Geocoder", "AMap.Marker", "AMap.InfoWindow"],
        });
      })
      .then((AMap: any) => {
        if (destroyed || !containerRef.current) return;
        AMapRef.current = AMap;

        const map = new AMap.Map(containerRef.current, {
          zoom: 12, center: [POPULAR_CITIES[0]!.lng, POPULAR_CITIES[0]!.lat],
          viewMode: "2D", resizeEnable: true,
        });
        map.addControl(new AMap.Scale());
        mapRef.current = map;

        const ps = new AMap.PlaceSearch({
          pageSize: 20, pageIndex: 1, city: POPULAR_CITIES[0]!.name,
          citylimit: true, extensions: "all",
        });
        psRef.current = ps;
        setMapReady(true);

        setTimeout(() => { if (!destroyed) doSearch(POPULAR_CITIES[0]!.name, "all"); }, 600);
      })
      .catch((err: any) => {
        if (!destroyed) setMapError(err.message || "地图加载失败");
      });

    return () => { destroyed = true; mapRef.current?.destroy(); };
  }, [doSearch]);

  const selectCity = useCallback((city: typeof POPULAR_CITIES[0]) => {
    setSelectedCity(city);
    setSearchText("");
    setSearchError("");
    setActivePOI(null);
    if (mapRef.current) {
      mapRef.current.setCenter([city.lng, city.lat]);
      mapRef.current.setZoom(12);
    }
    setTimeout(() => doSearch(city.name, category), 300);
  }, [category, doSearch]);

  const locateCity = useCallback(async (cityName: string) => {
    const name = cityName.trim();
    if (!name) return;

    setLocating(true);
    setSearchError("");

    try {
      const res = await fetch(`/api/poi/geocode?${new URLSearchParams({ address: name })}`);
      const json = await res.json();

      if (!res.ok || !json.success || !json.data?.lng || !json.data?.lat) {
        setSearchError(json.error || "暂时没有定位到这个城市，可以换个城市名试试。");
        return;
      }

      const nextCity = {
        name,
        lng: Number(json.data.lng),
        lat: Number(json.data.lat),
      };
      setSelectedCity(nextCity);
      setActivePOI(null);
      mapRef.current?.setCenter([nextCity.lng, nextCity.lat]);
      mapRef.current?.setZoom(12);
      doSearch(nextCity.name, category);
    } catch {
      setSearchError("探索这个城市时遇到问题，请稍后再试。");
    } finally {
      setLocating(false);
    }
  }, [category, doSearch]);

  const selectCategory = useCallback((catKey: string) => {
    setCategory(catKey);
    doSearch(selectedCity.name, catKey);
  }, [selectedCity.name, doSearch]);

  const focusPOI = useCallback((poi: POI) => {
    setActivePOI(poi.id);
    if (mapRef.current && poi.lng) {
      mapRef.current.setCenter([poi.lng, poi.lat]);
      mapRef.current.setZoom(16);
    }
    document.getElementById(`poi-${poi.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    if (pois.length > 0) renderMarkers(pois, activePOI);
  }, [activePOI, pois, renderMarkers]);

  const addToWishlist = useCallback((poi: POI) => {
    setWishlist((prev) => {
      if (prev.some((item) => item.id === poi.id)) return prev;
      return [...prev, poi];
    });
  }, []);

  const removeFromWishlist = useCallback((poiId: string) => {
    setWishlist((prev) => prev.filter((item) => item.id !== poiId));
  }, []);

  const startPlanning = useCallback((mode: "ai" | "manual") => {
    const params = new URLSearchParams({
      mode,
      destination: selectedCity.name,
    });
    if (wishlist.length > 0) {
      params.set("wishlist", wishlist.map((item) => item.name).join("、"));
    }
    router.push(`/create?${params}`);
  }, [router, selectedCity.name, wishlist]);

  return (
    <div className="h-full overflow-hidden px-4 pb-4 pt-4 md:px-6">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-outline-variant/60 bg-[rgba(247,251,255,0.82)] shadow-[0_24px_70px_rgba(8,35,69,0.10)] lg:flex-row">
      {/* Left Panel */}
      <div className="flex min-h-0 w-full flex-col overflow-hidden border-b border-outline-variant/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(237,244,251,0.92))] lg:w-[400px] lg:border-b-0 lg:border-r xl:w-[440px]">
        <div className="border-b border-outline-variant/55 px-5 py-5">
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-primary">Destination Salon</p>
          <h1 className="mb-4 font-display text-[2rem] leading-tight text-primary">探索目的地</h1>
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              locateCity(searchText);
            }}
          >
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="输入城市，比如青岛、东京、清迈..."
              className="w-full rounded-2xl border border-outline-variant/70 bg-[rgba(255,255,255,0.74)] py-3 pl-10 pr-[92px] text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <button
              type="submit"
              disabled={!searchText.trim() || locating}
              className="absolute right-1.5 top-1/2 flex h-9 -translate-y-1/2 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locating ? <LoadingSpinner size="sm" /> : <Icon name="travel_explore" className="text-[15px]" />}
              探索
            </button>
          </form>
          {searchError && (
            <p className="mt-2 text-xs text-error">{searchError}</p>
          )}
        </div>

        {/* City Tags */}
        <div className="border-b border-outline-variant/55 px-5 py-4">
          <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">热门推荐</p>
          <div
            className="relative flex gap-2 overflow-x-auto"
            style={{
              maskImage: "linear-gradient(to right, black, black calc(100% - 16px), transparent)",
              WebkitMaskImage: "linear-gradient(to right, black, black calc(100% - 16px), transparent)",
            }}
          >
            {POPULAR_CITIES.map((city) => (
              <button
                key={city.name}
                onClick={() => selectCity(city)}
                className={cn(
                  "flex-shrink-0 rounded-full px-4 py-2 text-sm transition-all",
                  selectedCity.name === city.name
                    ? "bg-primary text-white shadow-[0_10px_24px_rgba(8,35,69,0.18)]"
                    : "bg-[rgba(255,255,255,0.72)] text-on-surface-variant hover:bg-[rgba(255,255,255,0.96)]"
                )}
              >
                {city.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-shrink-0 gap-2 border-b border-outline-variant/55 px-5 py-3">
          {Object.entries(CATEGORY_MAP).map(([key, cat]) => {
            const isActive = category === key;
            return (
              <button
                key={key}
                onClick={() => selectCategory(key)}
                className={cn(
                  "active:scale-95 flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs transition-all duration-200",
                  isActive
                    ? "border-primary/25 bg-primary-fixed/55 text-primary shadow-sm"
                    : "border-outline-variant/50 bg-[rgba(255,255,255,0.68)] text-on-surface-variant hover:bg-[rgba(255,255,255,0.94)]"
                )}
              >
                <Icon
                  name={CATEGORY_ICONS[key] || "place"}
                  className={cn("text-[16px]", isActive && "text-primary")}
                  filled={isActive}
                />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* POI List */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
              <span className="ml-3 text-on-surface-variant">搜索中...</span>
            </div>
          ) : pois.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="travel_explore" className="mb-3 text-[48px] text-outline" weight={200} />
              <p className="font-body-md text-on-surface-variant">该城市暂无搜索结果</p>
              <p className="mt-1 font-caption text-outline">尝试切换分类或选择其他城市</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">找到 {pois.length} 个地点</p>
              {pois.map((poi) => (
                <div
                  id={`poi-${poi.id}`}
                  key={poi.id}
                  onClick={() => focusPOI(poi)}
                  className={cn(
                    "cursor-pointer rounded-[22px] border p-4 transition-all duration-200 hover:shadow-[0_16px_36px_rgba(8,35,69,0.09)]",
                    activePOI === poi.id
                      ? "border-primary/30 bg-primary-fixed/45"
                      : "border-outline-variant/55 bg-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,255,255,0.96)]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl transition-colors",
                      activePOI === poi.id
                        ? "bg-primary text-white"
                        : "bg-primary-fixed/55 text-primary"
                    )}>
                      <Icon
                        name={POI_ICONS[poi.type] || "place"}
                        className="text-[16px]"
                        filled={activePOI === poi.id}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="truncate font-medium text-on-surface">{poi.name}</h4>
                        <span
                          className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: `${TYPE_COLORS[poi.type] || "#0f5f9f"}18`,
                            color: TYPE_COLORS[poi.type] || "#0f5f9f",
                          }}
                        >
                          {TYPE_LABELS[poi.type] || "景点"}
                        </span>
                      </div>
                      <p className="truncate font-caption text-on-surface-variant">{poi.address}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToWishlist(poi);
                      }}
                      className={cn(
                        "flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-caption transition-all hover:shadow-md active:scale-95",
                        wishlist.some((item) => item.id === poi.id)
                          ? "bg-primary-fixed/70 text-primary"
                          : "bg-primary text-white"
                      )}
                    >
                      {wishlist.some((item) => item.id === poi.id) ? "已加入" : "加心愿"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Map */}
      <div className="relative hidden flex-1 bg-[rgba(237,244,251,0.64)] lg:block">
        {mapError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(247,251,255,0.92)]">
            <div className="text-center">
              <Icon name="map_off" className="text-[48px] text-error/50 mb-3" />
              <p className="font-body-md text-on-surface-variant">{mapError}</p>
            </div>
          </div>
        ) : (
          <>
            <div ref={containerRef} className="w-full h-full" />
            <div className="absolute left-5 top-5 z-10 rounded-xl border border-outline-variant/55 bg-[rgba(247,251,255,0.84)] px-4 py-2.5 shadow-[0_12px_26px_rgba(8,35,69,0.10)] backdrop-blur">
              <h2 className="font-display text-[1.45rem] leading-none text-primary">{selectedCity.name}</h2>
            </div>
            <div className="absolute right-4 top-4 z-10 flex flex-col gap-0.5 rounded-[18px] border border-outline-variant/60 bg-[rgba(247,251,255,0.9)] p-1 shadow-[0_10px_28px_rgba(8,35,69,0.10)] backdrop-blur-[12px]">
              <button
                onClick={() => mapRef.current?.zoomIn()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-primary-fixed/50 hover:text-primary"
                title="放大"
              >
                <Icon name="add" className="text-[20px]" />
              </button>
              <div className="mx-auto my-0.5 h-px w-6 bg-outline-variant/70" />
              <button
                onClick={() => mapRef.current?.zoomOut()}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-primary-fixed/50 hover:text-primary"
                title="缩小"
              >
                <Icon name="remove" className="text-[20px]" />
              </button>
              <div className="mx-auto my-0.5 h-px w-6 bg-outline-variant/70" />
              <button
                onClick={() => {
                  mapRef.current?.setCenter([selectedCity.lng, selectedCity.lat]);
                  mapRef.current?.setZoom(12);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-primary-fixed/50 hover:text-primary"
                title="定位当前城市"
              >
                <Icon name="my_location" className="text-[18px]" />
              </button>
            </div>
          </>
        )}
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(247,251,255,0.92)]">
            <div className="text-center">
              <LoadingSpinner size="lg" className="mx-auto mb-3" />
              <p className="font-body-md text-on-surface-variant">地图加载中...</p>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowWishlist(true)}
        className={cn(
          "fixed bottom-24 right-4 z-40 flex items-center gap-2.5 rounded-full border border-white/10 px-4 py-3 text-white shadow-[0_18px_40px_rgba(8,35,69,0.24)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(8,35,69,0.30)] active:scale-95 lg:bottom-8 lg:right-8",
          showWishlist && "pointer-events-none opacity-0 scale-90"
        )}
        style={{
          background: "linear-gradient(180deg, rgba(15,55,100,0.96) 0%, rgba(7,27,51,0.98) 100%)",
        }}
      >
        <Icon name="favorite" className="text-[21px]" filled />
        <span className="hidden text-sm font-medium sm:block">心愿池</span>
        {wishlist.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-primary">
            {wishlist.length}
          </span>
        )}
      </button>

      {showWishlist && (
        <>
          <div
            className="fixed inset-0 z-[1100] bg-black/24 backdrop-blur-[2px]"
            onClick={() => setShowWishlist(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-[1110] flex w-full max-w-[460px] flex-col border-l border-outline-variant/60 bg-[rgba(247,251,255,0.96)] shadow-[-24px_0_70px_rgba(8,35,69,0.16)] backdrop-blur-2xl">
            <div className="border-b border-outline-variant/60 bg-[linear-gradient(135deg,rgba(15,55,100,0.96),rgba(7,27,51,0.98))] px-6 py-6 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] tracking-[0.22em] text-white/58">WISHLIST</p>
                  <h2 className="mt-2 font-display text-[2rem] leading-none text-white">心愿池</h2>
                </div>
                <button
                  onClick={() => setShowWishlist(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/72 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="关闭心愿池"
                >
                  <Icon name="close" className="text-[21px]" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {wishlist.length === 0 ? (
                <div className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/70 bg-white/58 px-6 text-center">
                  <Icon name="favorite_border" className="mb-4 text-[46px] text-outline" />
                  <p className="font-medium text-on-surface">还没有心愿地点</p>
                  <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                    在左侧推荐地点里点击“加心愿”，这里会自动收集起来。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                      已加入 {wishlist.length} 个地点
                    </p>
                    <button
                      onClick={() => setWishlist([])}
                      className="text-xs font-medium text-on-surface-variant transition-colors hover:text-primary"
                    >
                      清空
                    </button>
                  </div>
                  {wishlist.map((poi, index) => (
                    <div
                      key={poi.id}
                      className="rounded-2xl border border-outline-variant/55 bg-white/78 p-4 shadow-[0_12px_28px_rgba(8,35,69,0.05)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-fixed/65 text-primary">
                          <span className="text-sm font-semibold">{index + 1}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-medium text-on-surface">{poi.name}</h3>
                            <span className="rounded-full bg-primary-fixed/55 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {TYPE_LABELS[poi.type] || "景点"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-on-surface-variant">{poi.address || selectedCity.name}</p>
                        </div>
                        <button
                          onClick={() => removeFromWishlist(poi.id)}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
                          aria-label="移出心愿池"
                        >
                          <Icon name="close" className="text-[18px]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-outline-variant/60 bg-white/82 p-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => startPlanning("ai")}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(8,35,69,0.16)] transition-all hover:-translate-y-0.5 hover:bg-primary/92"
                >
                  <Icon name="auto_awesome" className="text-[18px]" />
                  AI 规划
                </button>
                <button
                  onClick={() => startPlanning("manual")}
                  className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant/70 bg-white px-4 py-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                >
                  <Icon name="edit_calendar" className="text-[18px]" />
                  手动规划
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
      </div>
    </div>
  );
}
