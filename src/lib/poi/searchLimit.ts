const DEFAULT_POI_LIMIT = 20;
const MAX_POI_RESULTS = 50;

export function parsePoiLimit(value: string | null) {
  const parsed = Number.parseInt(value || String(DEFAULT_POI_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POI_LIMIT;
  return Math.min(parsed, MAX_POI_RESULTS);
}
