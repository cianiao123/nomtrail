/**
 * AMap JSAPI singleton loader.
 * Uses dynamic import to avoid SSR "window is not defined" errors.
 */

let AMapModule: any = null;
let loadingPromise: Promise<any> | null = null;

export function configureAMapSecurity() {
  if (typeof window === "undefined") return;
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
  if (!securityJsCode) return;
  (window as Window & { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
    securityJsCode,
  };
}

export async function getAMap(): Promise<any> {
  if (AMapModule) return AMapModule;
  if (loadingPromise) return loadingPromise;

  const key = process.env.NEXT_PUBLIC_AMAP_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_AMAP_KEY is not set");
  configureAMapSecurity();

  // Dynamic import to avoid bundling @amap/amap-jsapi-loader during SSR
  const AMapLoader = await import("@amap/amap-jsapi-loader");

  loadingPromise = AMapLoader.default.load({
    key,
    version: "2.0",
    plugins: [
      "AMap.Scale",
      "AMap.ToolBar",
      "AMap.Geolocation",
      "AMap.Geocoder",
      "AMap.AutoComplete",
      "AMap.PlaceSearch",
      "AMap.Driving",
      "AMap.Marker",
      "AMap.Polyline",
      "AMap.InfoWindow",
    ],
  });

  AMapModule = await loadingPromise;
  return AMapModule;
}
