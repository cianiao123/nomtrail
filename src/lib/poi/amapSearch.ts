export function buildAmapPoiSearchParams({
  key,
  keywords,
  city,
  offset,
  page,
  types,
}: {
  key: string;
  keywords: string;
  city: string;
  offset: number;
  page: number;
  types?: string;
}) {
  const params = new URLSearchParams({
    key,
    keywords,
    city,
    offset: String(offset),
    page: String(page),
    extensions: "all",
  });
  if (city.trim()) params.set("citylimit", "true");
  if (types) params.set("types", types);
  return params;
}
