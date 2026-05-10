/**
 * External tools for the travel planning agent.
 *
 * 1. DeepSeek web search for destination and practical travel info
 * 2. Xiaohongshu MCP integration for inspiration search
 * 3. AMap enrichment for POI lookup and coordinates
 */

import { deepseekClient } from "@/lib/llm/deepseekClient";
import type {
  ParsedPlace,
  ConfirmedPlace,
  InspirationItem,
  SavedPlaceCandidate,
} from "@/types/agent";
import { TravelInspirationResultSchema, validateWithSchema } from "./schemas";

export interface WebSearchResult {
  query: string;
  content: string;
  toolCalls?: unknown[];
}

export interface XHSNote {
  title: string;
  content: string;
  author: string;
  likes: number;
  url: string;
  placeMentions: string[];
}

export const XHS_MCP_ENDPOINT =
  process.env.XHS_MCP_URL || "http://localhost:3456/mcp";

export function detectXHSReference(message: string): boolean {
  return /小红书|xhs|rednote|收藏|笔记链接/.test(message);
}

export async function searchPlaceInfo(
  place: ParsedPlace | ConfirmedPlace
): Promise<WebSearchResult> {
  const query = `${place.name} 旅游攻略 开放时间 注意事项 2025`;
  try {
    const result = await deepseekClient.generateWithTools!(
      [
        {
          role: "system",
          content:
            "You are a helpful travel research assistant. Search for practical, up-to-date information about travel destinations. Focus on opening hours, ticket info, best visiting times, and practical tips.",
        },
        {
          role: "user",
          content: `Search for current practical info about: ${query}`,
        },
      ],
      [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        },
      ],
      { temperature: 0.2, maxTokens: 1024 }
    );
    return { query, content: result.content, toolCalls: result.toolCalls };
  } catch (err) {
    return { query, content: `[搜索失败: ${(err as Error).message}]` };
  }
}

export async function searchMultiplePlaces(
  places: (ParsedPlace | ConfirmedPlace)[],
  limit = 3
): Promise<Record<string, WebSearchResult>> {
  const results: Record<string, WebSearchResult> = {};
  const toSearch = places.slice(0, Math.min(places.length, limit));

  for (const place of toSearch) {
    results[place.name] = await searchPlaceInfo(place);
  }

  return results;
}

export function buildEnrichedContext(
  searchResults: Record<string, WebSearchResult>
): string {
  if (Object.keys(searchResults).length === 0) return "";

  return (
    "## 实时搜索信息\n" +
    Object.entries(searchResults)
      .map(([name, result]) => {
        const snippet = result.content.slice(0, 300);
        return `### ${name}\n${snippet}${result.content.length > 300 ? "..." : ""}`;
      })
      .join("\n\n")
  );
}

export async function fetchXHSNote(
  urlOrKeyword: string
): Promise<XHSNote[]> {
  try {
    const res = await fetch(`${XHS_MCP_ENDPOINT}/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "xhs_search",
        arguments: { keyword: urlOrKeyword, count: 6 },
      }),
    });

    if (!res.ok) {
      throw new Error(`MCP returned ${res.status}`);
    }

    const data = await res.json();
    return (data.content?.[0]?.text
      ? JSON.parse(data.content[0].text)
      : []) as XHSNote[];
  } catch {
    return [];
  }
}

export async function extractPlacesFromXHS(
  notes: XHSNote[]
): Promise<string> {
  if (notes.length === 0) return "";
  const combined = notes
    .map((n) => `## ${n.title}\n${n.content.slice(0, 500)}`)
    .join("\n\n");
  return combined;
}

async function searchTravelWeb(
  destination: string,
  preferences: string[],
  dayCount: number
): Promise<WebSearchResult[]> {
  const query = `${destination} ${dayCount}天 ${preferences.join(" ")} 旅游攻略 美食 逛街 景点`;
  try {
    const result = await deepseekClient.generateWithTools!(
      [
        {
          role: "system",
          content:
            "You are a travel research assistant. Search for up-to-date destination guides, itineraries, neighborhood suggestions, food spots, and practical tips. Summarize only the useful travel takeaways.",
        },
        {
          role: "user",
          content: `Search for useful travel inspiration and practical planning info for: ${query}`,
        },
      ],
      [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 4,
        },
      ],
      { temperature: 0.2, maxTokens: 1800 }
    );

    return [{ query, content: result.content, toolCalls: result.toolCalls }];
  } catch (err) {
    return [{ query, content: `[网页搜索失败: ${(err as Error).message}]` }];
  }
}

function normalizeCategory(raw: string): SavedPlaceCandidate["category"] {
  if (/餐|咖啡|甜品|酒吧|小吃|food/i.test(raw)) return "food";
  if (/酒店|民宿|hotel/i.test(raw)) return "hotel";
  if (/机场|车站|地铁|交通|transport/i.test(raw)) return "transport";
  if (/景点|商圈|街区|公园|博物馆|寺|塔|乐园|夜景|attraction/i.test(raw)) {
    return "attraction";
  }
  return "other";
}

async function searchPOIRecord(
  keyword: string,
  city: string
): Promise<{
  name: string;
  address?: string;
  coordinate?: { lat: number; lng: number };
  openingHours?: string;
  ticketReference?: string;
}> {
  const key = (
    process.env.NEXT_PUBLIC_AMAP_WEB_KEY ||
    process.env.NEXT_PUBLIC_AMAP_KEY ||
    ""
  ).trim();

  if (!key) return { name: keyword };

  try {
    const params = new URLSearchParams({
      key,
      keywords: keyword,
      city,
      offset: "1",
      page: "1",
      extensions: "all",
    });
    const res = await fetch(`https://restapi.amap.com/v3/place/text?${params}`);
    const data = (await res.json()) as {
      status?: string;
      pois?: Array<{
        name?: string;
        address?: string;
        location?: string;
        biz_ext?: { opentime_today?: string; cost?: string };
      }>;
    };
    const poi = data.status === "1" ? data.pois?.[0] : undefined;
    if (!poi) return { name: keyword };

    const [lng, lat] = (poi.location || "").split(",").map(Number);
    return {
      name: poi.name || keyword,
      address: poi.address || "",
      coordinate:
        Number.isFinite(lng) && Number.isFinite(lat)
          ? { lng, lat }
          : undefined,
      openingHours: poi.biz_ext?.opentime_today || undefined,
      ticketReference: poi.biz_ext?.cost || undefined,
    };
  } catch {
    return { name: keyword };
  }
}

function combineInspirationText(items: InspirationItem[]): string {
  return items
    .map(
      (item, index) =>
        `# 来源${index + 1}\n标题: ${item.title}\n来源: ${item.sourceType}\n摘要: ${item.summary}\n提及地点: ${item.mentionedPlaces.join("、") || "无"}\n标签: ${item.tags.join("、") || "无"}`
    )
    .join("\n\n");
}

export async function searchTravelInspiration(
  destination: string,
  preferences: string[],
  dayCount: number
): Promise<{
  inspirationItems: InspirationItem[];
  savedPlaceCandidates: SavedPlaceCandidate[];
  debug: {
    xhsCount: number;
    webCount: number;
    enrichedCount: number;
  };
}> {
  const xhsKeyword = `${destination} ${dayCount}天 ${preferences.join(" ")} 小红书 攻略`;
  const xhsNotes = await fetchXHSNote(xhsKeyword);
  const webResults = await searchTravelWeb(destination, preferences, dayCount);

  const xhsItems: InspirationItem[] = xhsNotes.map((note) => ({
    title: note.title,
    summary: note.content.slice(0, 280),
    sourceType: "xhs",
    sourceUrl: note.url,
    author: note.author,
    city: destination,
    mentionedPlaces: note.placeMentions ?? [],
    tags: extractTags(`${note.title}\n${note.content}`),
    qualityScore: Math.min(1, 0.55 + Math.min(note.likes || 0, 2000) / 4000),
  }));

  const webItems: InspirationItem[] = webResults.map((result, index) => ({
    title: `${destination} 公开攻略 ${index + 1}`,
    summary: result.content.slice(0, 280),
    sourceType: "web",
    sourceUrl: "",
    city: destination,
    mentionedPlaces: [],
    tags: extractTags(result.content),
    qualityScore: result.content.startsWith("[") ? 0.2 : 0.5,
  }));

  const inspirationItems = [...xhsItems, ...webItems];
  if (inspirationItems.length === 0) {
    return {
      inspirationItems: [],
      savedPlaceCandidates: [],
      debug: { xhsCount: 0, webCount: 0, enrichedCount: 0 },
    };
  }

  const extractionPrompt = `你是旅行种草内容结构化助手。

目标城市：${destination}
旅行天数：${dayCount}
偏好：${preferences.join("、") || "无"}

请从下面这些小红书/网页攻略摘要中提取适合做行程生成的内容，输出：
1. inspirationItems：可以保留摘要，但要更精炼
2. savedPlaceCandidates：聚合后的候选地点

聚合规则：
- 同名地点合并
- 高频地点 qualityScore 更高
- 候选地点类型只允许 attraction/food/hotel/transport/other
- priorityTag 只允许 must_go/nearby_optional/rainy_backup/night_option/food_candidate
- reason 要写成适合行程生成的一句话
- sourceRefs 用标题或来源简述
- 如果信息不确定，不要编造地址或坐标

种草内容如下：
${combineInspirationText(inspirationItems)}

只输出合法 JSON。`;

  const extracted = await deepseekClient.generateJson<Record<string, unknown>>(
    [
      {
        role: "system",
        content:
          "你是旅行种草内容解析器。请把种草内容转成结构化地点候选池，避免重复，尽量保留高价值地点和玩法。只输出合法JSON。",
      },
      { role: "user", content: extractionPrompt },
    ],
    { temperature: 0.2, maxTokens: 2500 }
  );

  const normalizedPayload = normalizeInspirationPayload(extracted, destination);
  const validated = validateWithSchema(
    TravelInspirationResultSchema,
    normalizedPayload,
    "travel_inspiration"
  );

  const enrichedCandidates: SavedPlaceCandidate[] = [];
  for (const candidate of validated.savedPlaceCandidates.slice(0, 12)) {
    const poi = await searchPOIRecord(candidate.name, candidate.city || destination);
    enrichedCandidates.push({
      ...candidate,
      category: normalizeCategory(candidate.category),
      coordinate: candidate.coordinate ?? poi.coordinate,
      address: candidate.address ?? poi.address,
      openingHours: candidate.openingHours ?? poi.openingHours,
      ticketReference: candidate.ticketReference ?? poi.ticketReference,
    });
  }

  return {
    inspirationItems: validated.inspirationItems,
    savedPlaceCandidates: enrichedCandidates,
    debug: {
      xhsCount: xhsItems.length,
      webCount: webItems.length,
      enrichedCount: enrichedCandidates.length,
    },
  };
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  if (/美食|吃|餐厅|咖啡|甜品/.test(text)) tags.push("美食探索");
  if (/逛街|商圈|购物|买手店/.test(text)) tags.push("购物娱乐");
  if (/夜景|夜游|酒吧|live/.test(text)) tags.push("夜间活动");
  if (/雨天|室内|博物馆|美术馆/.test(text)) tags.push("雨天适配");
  if (/拍照|机位|打卡/.test(text)) tags.push("摄影打卡");
  return tags;
}

function normalizeInspirationPayload(
  payload: Record<string, unknown>,
  destination: string
): {
  inspirationItems: InspirationItem[];
  savedPlaceCandidates: SavedPlaceCandidate[];
} {
  const rawItems = Array.isArray(payload.inspirationItems)
    ? payload.inspirationItems
    : [];
  const rawCandidates = Array.isArray(payload.savedPlaceCandidates)
    ? payload.savedPlaceCandidates
    : [];

  const inspirationItems: InspirationItem[] = rawItems
    .map((item, index) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        title: String(record.title || record.sourceRef || `灵感来源 ${index + 1}`),
        summary: String(record.summary || record.content || ""),
        sourceType: ["xhs", "web", "poi"].includes(String(record.sourceType))
          ? (record.sourceType as InspirationItem["sourceType"])
          : "web",
        sourceUrl: String(record.sourceUrl || record.url || ""),
        author: record.author ? String(record.author) : undefined,
        city: String(record.city || destination),
        mentionedPlaces: Array.isArray(record.mentionedPlaces)
          ? record.mentionedPlaces.map(String)
          : [],
        tags: Array.isArray(record.tags)
          ? record.tags.map(String)
          : extractTags(String(record.summary || record.content || "")),
        qualityScore: clampScore(record.qualityScore),
      };
    })
    .filter((item) => item.summary);

  const savedPlaceCandidates: SavedPlaceCandidate[] = rawCandidates
    .map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        name: String(record.name || ""),
        city: String(record.city || destination),
        category: normalizeCategory(String(record.category || record.type || "")),
        priorityTag: normalizePriorityTag(record.priorityTag),
        reason: String(record.reason || record.summary || "热门种草候选点"),
        sourceRefs: Array.isArray(record.sourceRefs)
          ? record.sourceRefs.map(String)
          : record.sourceRef
            ? [String(record.sourceRef)]
            : [],
        coordinate: normalizeCoordinate(record.coordinate),
        address: record.address ? String(record.address) : undefined,
        openingHours: record.openingHours ? String(record.openingHours) : undefined,
        ticketReference: record.ticketReference ? String(record.ticketReference) : undefined,
        recommendedDuration:
          typeof record.recommendedDuration === "number"
            ? record.recommendedDuration
            : undefined,
        qualityScore: clampScore(record.qualityScore),
      };
    })
    .filter((item) => item.name);

  return { inspirationItems, savedPlaceCandidates };
}

function normalizePriorityTag(
  value: unknown
): SavedPlaceCandidate["priorityTag"] {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "must_go") return "must_go";
  if (normalized === "rainy_backup") return "rainy_backup";
  if (normalized === "night_option") return "night_option";
  if (normalized === "food_candidate") return "food_candidate";
  return "nearby_optional";
}

function normalizeCoordinate(
  value: unknown
): SavedPlaceCandidate["coordinate"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const lat = typeof record.lat === "number" ? record.lat : undefined;
  const lng = typeof record.lng === "number" ? record.lng : undefined;
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }
  return undefined;
}

function clampScore(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}
