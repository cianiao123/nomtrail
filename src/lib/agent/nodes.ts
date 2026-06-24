/**
 * LangGraph Agent Nodes — P0 MVP
 * Each node is a pure async function: (state) => partial state update
 */

import { db } from "@/lib/db/supabase";
import { deepseekClient } from "@/lib/llm/deepseekClient";
import {
  searchMultiplePlaces,
  buildEnrichedContext,
  detectXHSReference,
  extractPlacesFromXHS,
  fetchXHSNote,
  searchTravelInspiration,
} from "./tools";
import {
  appendMissingWishlistActivities,
  extractWishlistNamesFromContext,
  isWishlistActivity,
  markWishlistNotes,
  markWishlistSource,
  mergeWishlistCandidates,
  normalizeWishlistName,
} from "./wishlist";
import type { TravelAgentState } from "./state";
import {
  IntentResultSchema,
  ParsePlacesResultSchema,
  ParseTripResultSchema,
  GenerateItineraryResultSchema,
  ReviseItineraryResultSchema,
  RecommendDestinationsResultSchema,
  PlaceGuideResultSchema,
  MissingInfoResponseSchema,
  validateWithSchema,
} from "./schemas";
import {
  INTENT_CLASSIFY_PROMPT,
  PARSE_PLACES_PROMPT,
  PARSE_TRIP_PROMPT,
  RECOMMEND_DESTINATIONS_PROMPT,
  PLACE_GUIDE_PROMPT,
  ITINERARY_AGENT_PROMPT,
  REVISE_PROMPT,
  ASK_FOLLOWUP_PROMPT,
} from "./prompts";
import {
  CritiqueResultSchema,
  NormalizeActivitiesResultSchema,
} from "./schemas";
import {
  CRITIQUE_PROMPT,
  NORMALIZE_ACTIVITIES_PROMPT,
} from "./prompts";
import {
  isConstrainedServerlessRuntime,
  isRequestTerminationError,
} from "./runtime";
import {
  AMAP_GEOCODE_URL,
  AMAP_WEATHER_URL,
  buildAmapGeocodeParams,
  buildAmapWeatherParams,
  normalizeAmapWeatherResponse,
  readAdcodeFromGeocodeResponse,
} from "@/lib/weather/amapWeather";
import { formatWeatherAnswer, parseWeatherQuery } from "./weatherIntent";
import { fetchAmapRoute } from "@/lib/poi/amapRoute";
import { saveLocalTrip } from "@/lib/trips/localTripStore";
import { formatAgentNodeName } from "./agents/registry";
import {
  createTransportPlanFromMessage,
  createTransportPlanFromMessages,
  createTransportPlanFromRequirements,
  normalizeTransportDate,
  parseTransportRequest,
} from "./transport";

const SERVER_ANONYMOUS_USER_ID = "anonymous-server-user";
const AMAP_WEB_SERVICE_KEY =
  process.env.AMAP_WEB_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_AMAP_WEB_KEY ||
  process.env.NEXT_PUBLIC_AMAP_KEY ||
  "";
import type {
  ParsedPlace,
  ItineraryVersion,
  AgentActionLogEntry,
  CritiqueResult,
  SavedPlaceCandidate,
  ConfirmedPlace,
  AgentExportPayload,
} from "@/types/agent";
import type { Trip, Day, Activity, ActivityType, POIInfo } from "@/types/trip";

// === Helpers ===

function isPlaceGuideQuery(message: string) {
  return /(?:都)?可以玩什么|怎么玩|玩法|游玩攻略|有什么好玩|玩什么|怎么逛|值得玩/.test(message);
}

const CITY_PLACE_RECOMMENDATION_NAMES = new Set([
  "北京",
  "上海",
  "广州",
  "深圳",
  "成都",
  "重庆",
  "杭州",
  "南京",
  "西安",
  "武汉",
  "长沙",
  "苏州",
  "厦门",
  "青岛",
  "郑州",
  "天津",
  "三亚",
  "大理",
  "桂林",
  "大阪",
  "东京",
  "京都",
]);

function readCityPlaceRecommendationCity(message: string) {
  const match = message.trim().match(/^([\u4e00-\u9fa5]{2,8})(?:市)?(?:有)?(?:什么|啥|哪里|哪儿).*(?:好玩|好吃|逛|推荐|景点|玩法)/);
  const city = match?.[1]?.replace(/市$/, "").replace(/有$/, "") ?? "";
  return CITY_PLACE_RECOMMENDATION_NAMES.has(city) ? city : "";
}

function isCityPlaceRecommendationQuery(message: string) {
  return !!readCityPlaceRecommendationCity(message);
}

function recommendationsToSavedPlaceCandidates(
  city: string,
  result: { title: string; recommendations: { city: string; highlight: string; reason: string }[] }
): SavedPlaceCandidate[] {
  return result.recommendations.map((item, index) => ({
    name: item.city,
    city,
    category: inferCandidateCategory(`${item.city} ${item.highlight} ${item.reason}`),
    priorityTag: index < 3 ? "must_go" : "nearby_optional",
    reason: `${item.highlight}：${item.reason}`,
    sourceRefs: [result.title],
    qualityScore: Math.max(0.55, 0.82 - index * 0.04),
  }));
}

function inferCandidateCategory(text: string): SavedPlaceCandidate["category"] {
  if (/吃|餐|美食|小吃|咖啡|火锅|烧烤|酒吧|夜市/.test(text)) return "food";
  if (/酒店|住宿|民宿/.test(text)) return "hotel";
  if (/机场|车站|交通|码头/.test(text)) return "transport";
  if (/景点|公园|博物馆|故宫|长城|寺|宫|山|湖|海|古镇|街区|胡同|广场|园/.test(text)) return "attraction";
  return "other";
}

async function answerWeatherQuery(message: string) {
  const query = parseWeatherQuery(message);
  if (!query) return "";
  if (!AMAP_WEB_SERVICE_KEY) return `我现在还查不了${query.city}天气，因为高德 Web 服务 Key 没配置好。`;

  const geocodeParams = buildAmapGeocodeParams({ key: AMAP_WEB_SERVICE_KEY, address: query.city });
  const geocodeRes = await fetch(`${AMAP_GEOCODE_URL}?${geocodeParams}`, { cache: "no-store" });
  const geocodeData = await geocodeRes.json();
  const adcode = readAdcodeFromGeocodeResponse(geocodeData);
  if (!adcode) return `暂时没有查到${query.city}的天气城市编码。`;

  const weatherParams = buildAmapWeatherParams({
    key: AMAP_WEB_SERVICE_KEY,
    city: adcode,
    extensions: "all",
  });
  const weatherRes = await fetch(`${AMAP_WEATHER_URL}?${weatherParams}`, { cache: "no-store" });
  const weatherData = await weatherRes.json();
  return formatWeatherAnswer(message, normalizeAmapWeatherResponse(weatherData, query.days));
}

type PlaceGuideSpotDraft = {
  name: string;
  imageKeyword: string;
  highlight: string;
  description: string;
  duration: string;
  suitableFor: string;
};

function buildKnownPlaceGuide(message: string) {
  if (!/亚龙湾/.test(message)) return null;

  return {
    placeName: "亚龙湾",
    title: "亚龙湾游玩攻略",
    intro: "亚龙湾适合海滩玩水、热带雨林观景和轻度水上项目，玩法集中在海岸线和周边景区。",
    bestTime: "上午海水颜色更清透，傍晚适合沙滩散步和拍照。",
    tips: ["注意防晒和补水", "水上项目先确认价格和保险", "森林公园建议预留半天"],
    spots: [
      {
        name: "亚龙湾沙滩",
        imageKeyword: "亚龙湾沙滩",
        highlight: "海滩玩水",
        description: "亚龙湾核心海滩沙质细、海水颜色层次清楚，适合散步、拍照、玩水和放空。",
        duration: "1.5-2小时",
        suitableFor: "亲子、情侣、第一次来三亚",
      },
      {
        name: "亚龙湾热带天堂森林公园",
        imageKeyword: "亚龙湾热带天堂森林公园",
        highlight: "雨林观景",
        description: "可以俯瞰亚龙湾海岸线，也有雨林栈道和观景平台，适合把海景和山景一起安排。",
        duration: "3-4小时",
        suitableFor: "喜欢观景、拍照和轻徒步的人",
      },
      {
        name: "百福湾",
        imageKeyword: "三亚百福湾",
        highlight: "潜水浮潜",
        description: "相对更偏海上体验，适合浮潜、潜水或坐船看海，出行前需要确认当天海况。",
        duration: "2-3小时",
        suitableFor: "水上项目爱好者",
      },
      {
        name: "太阳湾公路",
        imageKeyword: "三亚太阳湾公路",
        highlight: "海岸公路",
        description: "沿海公路视野开阔，适合自驾、骑行或短暂停靠拍海景，但不建议长时间占道停留。",
        duration: "30-60分钟",
        suitableFor: "自驾、拍照、情侣出行",
      },
    ] satisfies PlaceGuideSpotDraft[],
  };
}

/** Build conversation context string from history + current message */
function buildConversationContext(state: TravelAgentState): string {
  const history = (state.conversationHistory ?? [])
    .slice(-20)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");
  return history || state.currentMessage;
}

function buildRecommendationUserMessage(state: TravelAgentState): string {
  return buildConversationContext(state);
}

function isRecommendationFollowUp(message: string, state: TravelAgentState) {
  const text = message.trim();
  if (!text) return false;
  const previousConversation = (state.conversationHistory ?? []).slice(0, -1);
  const hadRecommendationContext = previousConversation.some((item) =>
    /适合你的旅行目的地|我先给你 5 个方向|推荐|目的地|哪里旅游|去哪儿玩|哪里玩|周末适合去哪里/.test(item.content)
  );
  if (!hadRecommendationContext) return false;

  return /^(我人在|人在|我在|从|出发地|预算|人均|周末|这周末|本周末|带|和|想要|偏好)/.test(text)
    || /^我人在北京$/.test(text);
}

function buildTransportPlanFromState(state: TravelAgentState) {
  const fromRequirements = createTransportPlanFromRequirements(state.parsedTripRequirements ?? {});
  if (fromRequirements) return fromRequirements;

  const messages = [
    ...(state.conversationHistory ?? []).map((item) => item.content),
    state.currentMessage ?? "",
  ];
  return createTransportPlanFromMessages(
    messages,
    state.parsedTripRequirements?.startDate ?? new Date().toISOString().slice(0, 10)
  );
}

function buildSelectedTransportContext(state: TravelAgentState): string {
  const plan = state.transportPlan;
  if (!plan || !state.transportConfirmed) return "未确认，按常规首末日轻量安排。";

  const outbound = plan.outboundOptions.find((option) => option.id === plan.selectedOutboundId);
  const returning = plan.returnOptions.find((option) => option.id === plan.selectedReturnId);
  const lines = [];
  if (outbound) {
    lines.push(
      `- 去程：${plan.departDate} ${outbound.fromName} ${outbound.departTime} 出发，${outbound.toName} ${outbound.arriveTime} 到达；第一天游玩从到达后开始，并预留入住/寄存行李时间。`
    );
  }
  if (returning && plan.returnDate) {
    lines.push(
      `- 回程：${plan.returnDate} ${returning.fromName} ${returning.departTime} 出发，${returning.toName} ${returning.arriveTime} 到达；最后一天活动需在返程前结束，并预留去车站/机场时间。`
    );
  }
  return lines.join("\n") || "未确认，按常规首末日轻量安排。";
}

function logAction(
  state: TravelAgentState,
  nodeName: string,
  output: string,
  durationMs: number
): AgentActionLogEntry {
  const agentNodeName = formatAgentNodeName(nodeName);
  return {
    id: `${state.threadId}-${agentNodeName}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    nodeName: agentNodeName,
    intent: state.intent,
    input: state.currentMessage?.slice(0, 200) ?? "",
    output: output.slice(0, 500),
    durationMs,
  };
}

function normalizeWeatherFit(
  value?: string
): "any" | "sunny" | "rainy" | "indoor" | "night" {
  const normalized = (value || "").toLowerCase();
  if (["sunny", "clear"].includes(normalized)) return "sunny";
  if (["rainy", "rain", "wet"].includes(normalized)) return "rainy";
  if (["indoor", "inside"].includes(normalized)) return "indoor";
  if (["night", "evening"].includes(normalized)) return "night";
  return "any";
}

function normalizeGeneratedActivityType(value: unknown): ActivityType {
  const normalized = String(value || "").toLowerCase().trim();
  if (["food", "restaurant", "meal", "dining", "cafe", "coffee", "snack"].includes(normalized)) {
    return "food";
  }
  if (["hotel"].includes(normalized)) return "hotel";
  if (["transport", "transfer", "transit", "traffic"].includes(normalized)) return "transport";
  if (["other"].includes(normalized)) return "other";
  return "attraction";
}

function extractWishlistNames(state: TravelAgentState) {
  return extractWishlistNamesFromContext(buildConversationContext(state));
}

function cloneDay(day: Day): Day {
  return {
    ...day,
    activities: day.activities.map((activity) => ({
      ...activity,
      poi: activity.poi ? {
        ...activity.poi,
        coordinate: { ...activity.poi.coordinate },
        photos: [...activity.poi.photos],
      } : null,
    })),
  };
}

function parseDayIndexFromMessage(message: string): number | null {
  const normalized = message.replace(/\s+/g, "");
  const arabicMatch = normalized.match(/第(\d+)天/);
  if (arabicMatch) return Number(arabicMatch[1]);

  const chineseMatch = normalized.match(/第([一二三四五六七八九十两]+)天/);
  if (!chineseMatch) return null;

  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const value = chineseMatch[1];
  if (value === "十") return 10;
  if (value.length === 1) return map[value] ?? null;
  if (value.startsWith("十")) return 10 + (map[value.slice(1)] ?? 0);
  if (value.endsWith("十")) return (map[value[0]] ?? 0) * 10;
  if (value.length === 2 && value[1] !== "十") {
    return (map[value[0]] ?? 0) * 10 + (map[value[1]] ?? 0);
  }
  const [tens, ones] = value.split("十");
  return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
}

function normalizeParsedBudget(
  budget?: { min?: number | null; max?: number | null } | null,
  fallback?: { min: number; max: number }
): { min: number; max: number } | undefined {
  if (!budget) return fallback;
  const min = typeof budget.min === "number" ? budget.min : 0;
  const max = typeof budget.max === "number" ? budget.max : fallback?.max;
  if (typeof max !== "number") return fallback;
  if (min > 0 && min <= 12 && max >= 1900 && max <= 2100) return fallback;
  return { min, max };
}

function parseBudgetFromMessage(message: string): { min: number; max: number } | undefined {
  const text = message
    .replace(/,/g, "")
    .replace(/\s+/g, "");

  if (/预算[:：]?不限|不限预算|预算不限/.test(text)) return undefined;

  const rangeMatch =
    text.match(/预算[:：]?(?:大概|约|在|控制在)?[￥¥]?(\d+)(?:元|块|rmb|cny)?(?:-|~|到|至|—)(?:[￥¥]?)(\d+)(?:元|块|rmb|cny)?/i) ??
    text.match(/[￥¥](\d+)(?:元|块|rmb|cny)?(?:-|~|到|至|—)(?:[￥¥]?)(\d+)(?:元|块|rmb|cny)?/i) ??
    text.match(/(\d+)(?:元|块|rmb|cny)(?:-|~|到|至|—)(\d+)(?:元|块|rmb|cny)?/i) ??
    text.match(/(\d+)(?:-|~|到|至|—)(\d+)(?:元|块|rmb|cny)/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }

  const underMatch = text.match(/(\d+)(?:元|块|rmb|cny)?(?:以下|以内|内|以下预算|以内预算)/i);
  if (underMatch) {
    const max = Number(underMatch[1]);
    if (Number.isFinite(max)) return { min: 0, max };
  }

  const budgetUnderMatch = text.match(/预算[:：]?(\d+)(?:元|块|rmb|cny)?(?:以下|以内|内)?/i);
  if (budgetUnderMatch && /以下|以内|内/.test(text)) {
    const max = Number(budgetUnderMatch[1]);
    if (Number.isFinite(max)) return { min: 0, max };
  }

  return undefined;
}

function formatBudget(budget?: { min?: number | null; max?: number | null } | null): string {
  if (!budget || typeof budget.max !== "number") return "不限";
  const min = typeof budget.min === "number" ? budget.min : 0;
  if (min <= 0) return `¥${budget.max}以下`;
  return `¥${min}-${budget.max}`;
}

function appendChecklistOffer(message: string): string {
  return `${message.trim()}\n\n需要我再为你生成一份旅行必备清单吗？可以包含证件、衣物、药品、充电设备、预订事项和当地注意事项。`;
}

function hasExplicitTravelerCount(message: string): boolean {
  const text = message.replace(/\s+/g, "");
  return /(?:\d+|[一二两三四五六七八九十])(?:个)?(?:人|成人|大人|小孩|孩子|儿童|宝宝)|一家(?:三|四|五|六|七|八|九|十|\d)口|情侣|夫妻|两口子|双人|单人/.test(text);
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function fetchAmapPoiPhoto(keyword: string, city = "") {
  const key = (
    process.env.AMAP_WEB_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_AMAP_WEB_KEY ||
    process.env.NEXT_PUBLIC_AMAP_KEY ||
    ""
  ).trim();
  if (!key) return "";

  try {
    const params = new URLSearchParams({
      key,
      keywords: keyword,
      city,
      offset: "1",
      page: "1",
      extensions: "all",
    });
    if (city.trim()) params.set("citylimit", "true");
    const res = await fetch(`https://restapi.amap.com/v3/place/text?${params}`, {
      signal: createTimeoutSignal(3000),
    });
    const data = (await res.json()) as {
      status?: string;
      pois?: Array<{ photos?: Array<{ url?: string }> }>;
    };
    return data.status === "1" ? data.pois?.[0]?.photos?.[0]?.url ?? "" : "";
  } catch {
    return "";
  }
}

async function attachPlaceGuidePhotos(
  placeName: string,
  spots: PlaceGuideSpotDraft[]
) {
  const city = /亚龙湾|三亚|海棠湾|大东海|天涯海角/.test(placeName) ? "三亚" : "";
  const fallbackPhoto = await fetchAmapPoiPhoto(placeName, city);

  return Promise.all(
    spots.map(async (spot) => {
      const imageUrl =
        await fetchAmapPoiPhoto(spot.imageKeyword || spot.name, city)
        || await fetchAmapPoiPhoto(`${placeName}${spot.name}`, city)
        || fallbackPhoto;

      return {
        name: spot.name,
        imageUrl,
        highlight: spot.highlight,
        description: spot.description,
        duration: spot.duration,
        suitableFor: spot.suitableFor,
      };
    })
  );
}

function remainingRequestMs(state: TravelAgentState): number {
  const deadline = state.requestDeadlineAt;
  return typeof deadline === "number" ? Math.max(0, deadline - Date.now()) : 60000;
}

function boundedTimeoutSignal(
  state: TravelAgentState,
  desiredMs: number,
  reserveMs = 4000
): AbortSignal {
  const remaining = remainingRequestMs(state);
  return createTimeoutSignal(Math.max(1000, Math.min(desiredMs, remaining - reserveMs)));
}

function itineraryMaxTokens(dayCount: number): number {
  const constrained = isConstrainedServerlessRuntime();
  const base = constrained ? 1600 : 2400;
  const perDay = constrained ? 450 : 650;
  return Math.min(constrained ? 3200 : 5200, base + dayCount * perDay);
}

function itineraryCompletenessIssue(
  days: { dayIndex: number; activities: unknown[] }[],
  dayCount: number
): string | null {
  if (days.length !== dayCount) {
    return `行程天数不匹配：需要 ${dayCount} 天，实际生成 ${days.length} 天`;
  }

  const incompleteDay = days.find((day) => day.activities.length < 2);
  if (incompleteDay) {
    return `第 ${incompleteDay.dayIndex} 天活动不足：至少需要 2 个活动，实际 ${incompleteDay.activities.length} 个`;
  }

  return null;
}

function isAbortError(err: unknown): boolean {
  return isRequestTerminationError(err);
}

function estimateGeneratedCost(
  days: { activities: { estimatedCost?: number }[] }[]
): number {
  return days.reduce(
    (sum, day) => sum + day.activities.reduce(
      (daySum, activity) => daySum + (activity.estimatedCost ?? 0),
      0
    ),
    0
  );
}

function fitGeneratedCostsToBudget<
  T extends {
    budgetSummary?: Record<string, number>;
    overallTips?: string;
    days: {
      activities: {
        estimatedCost?: number;
        notes?: string;
      }[];
    }[];
  },
>(draft: T, budgetMin: number, budgetMax: number): T {
  if (budgetMax <= 0) return draft;

  const currentTotal = estimateGeneratedCost(draft.days);
  const lowerBound = Math.max(0, Math.min(budgetMin, budgetMax));
  const upperBound = Math.max(lowerBound, budgetMax);
  if (currentTotal >= lowerBound && currentTotal <= upperBound) {
    return {
      ...draft,
      budgetSummary: {
        ...(draft.budgetSummary ?? {}),
        totalEstimated: currentTotal,
        budgetMin: lowerBound,
        budgetMax: upperBound,
      },
    };
  }

  const targetTotal = currentTotal > upperBound ? upperBound : lowerBound;
  const activities = draft.days.flatMap((day) => day.activities);
  if (activities.length === 0) return draft;
  const ratio = currentTotal > 0 ? targetTotal / currentTotal : 0;
  let runningTotal = 0;
  let remainingAdjustable = activities.length;

  const days = draft.days.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => {
      const originalCost = activity.estimatedCost ?? 0;
      remainingAdjustable -= 1;
      const adjustedCost = remainingAdjustable === 0
        ? Math.max(0, targetTotal - runningTotal)
        : currentTotal > 0
          ? Math.max(0, Math.round((originalCost * ratio) / 10) * 10)
          : Math.max(0, Math.floor((targetTotal / activities.length) / 10) * 10);
      runningTotal += adjustedCost;
      return {
        ...activity,
        estimatedCost: adjustedCost,
      };
    }),
  }));
  const totalEstimated = estimateGeneratedCost(days);

  return {
    ...draft,
    days,
    budgetSummary: {
      ...(draft.budgetSummary ?? {}),
      totalEstimated,
      budgetMin: lowerBound,
      budgetMax: upperBound,
      adjustedFrom: currentTotal,
    },
    overallTips: draft.overallTips?.includes("已按预算区间")
      ? draft.overallTips
      : `${draft.overallTips ? `${draft.overallTips}\n` : ""}已按预算区间 ${lowerBound}-${upperBound} CNY 调整活动预估费用，实际消费请以现场价格为准。`,
  };
}

function dateForDay(startDate: string, dayIndex: number): string {
  return new Date(new Date(startDate).getTime() + (dayIndex - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
}

function formatCoordinateForPrompt(coordinate?: { lat: number; lng: number }): string {
  if (!coordinate) return "";
  if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)) return "";
  if (coordinate.lat === 0 && coordinate.lng === 0) return "";
  return `；坐标：${coordinate.lng.toFixed(6)},${coordinate.lat.toFixed(6)}`;
}

function formatPlaceForRoutePrompt(place: {
  name: string;
  category: string;
  reason?: string;
  notes?: string;
  openingHours?: string;
  coordinate?: { lat: number; lng: number };
  sourceRefs?: string[];
}) {
  const sourceLabel = place.sourceRefs?.includes("探索页心愿池") ? "[心愿地] " : "";
  const detail = place.reason ?? place.notes ?? "";
  const openingHours = place.openingHours ? `；开放时间参考：${place.openingHours}` : "";
  return `- ${sourceLabel}${place.name} (${place.category})${formatCoordinateForPrompt(place.coordinate)}: ${detail}${openingHours}`;
}

type RouteKnownPlace = {
  name: string;
  category: ActivityType | SavedPlaceCandidate["category"];
  address?: string;
  coordinate?: { lat: number; lng: number };
  openingHours?: string;
  ticketReference?: string | null;
};

function buildRouteKnownPlaces(
  savedCandidates: SavedPlaceCandidate[],
  confirmedPlaces: ConfirmedPlace[]
) {
  return [
    ...confirmedPlaces,
    ...savedCandidates,
  ].filter((place) => place.coordinate);
}

function findKnownPlaceForActivity(
  activity: Activity,
  knownPlaces: RouteKnownPlace[]
) {
  const activityName = normalizeWishlistName(activity.customName ?? activity.poi?.name ?? "");
  if (!activityName) return undefined;
  return knownPlaces.find((place) => {
    const placeName = normalizeWishlistName(place.name);
    return placeName === activityName || activityName.includes(placeName) || placeName.includes(activityName);
  });
}

function poiFromKnownPlace(place: RouteKnownPlace): POIInfo | null {
  if (!place.coordinate) return null;
  return {
    amapId: "",
    name: place.name,
    address: place.address ?? "",
    coordinate: place.coordinate,
    category: place.category,
    photos: [],
    openingHours: place.openingHours,
    priceRange: place.ticketReference ?? undefined,
  };
}

function coordinateOfActivity(activity: Activity) {
  const coordinate = activity.poi?.coordinate;
  if (!coordinate) return undefined;
  if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)) return undefined;
  if (coordinate.lat === 0 && coordinate.lng === 0) return undefined;
  return coordinate;
}

function routeDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(h));
}

function estimateCityTravelMinutes(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.max(6, Math.round((distanceKm / 22) * 60));
}

async function estimateRouteMinutesBetween(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
) {
  const distanceKm = routeDistanceKm(origin, destination);
  const mode = distanceKm <= 2.5 ? "walking" : "driving";
  const route = await fetchAmapRoute({
    mode,
    origin: { lng: origin.lng, lat: origin.lat },
    destination: { lng: destination.lng, lat: destination.lat },
  });
  return route
    ? Math.max(1, Math.round(route.durationSeconds / 60))
    : estimateCityTravelMinutes(distanceKm);
}

function minutesFromTime(value?: string) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeFromMinutes(value: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function optimizeDayRouteOrder(day: Day): Promise<Day> {
  if (day.activities.length < 3) return day;
  const remaining = [...day.activities].sort((a, b) => a.order - b.order);
  const ordered: Activity[] = [];
  const first = remaining.shift();
  if (!first) return day;
  ordered.push(first);

  while (remaining.length) {
    const currentCoord = coordinateOfActivity(ordered[ordered.length - 1]);
    if (!currentCoord) {
      ordered.push(remaining.shift()!);
      continue;
    }

    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const candidateCoord = coordinateOfActivity(candidate);
      const distanceScore = candidateCoord
        ? routeDistanceKm(currentCoord, candidateCoord)
        : 20;
      const foodAfterHotelPenalty =
        ordered[ordered.length - 1].type === "hotel"
        && candidate.type === "food"
        && distanceScore > 3
          ? 15
          : 0;
      const score = distanceScore + foodAfterHotelPenalty + index * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  let cursor = minutesFromTime(day.activities[0]?.startTime) ?? 9 * 60;
  const activities: Activity[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const activity = ordered[index];
    const prev = index > 0 ? ordered[index - 1] : undefined;
    const prevCoord = prev ? coordinateOfActivity(prev) : undefined;
    const coord = coordinateOfActivity(activity);
    const travelMinutesFromPrev = prevCoord && coord
      ? await estimateRouteMinutesBetween(prevCoord, coord)
      : activity.travelMinutesFromPrev;
    if (index > 0 && typeof travelMinutesFromPrev === "number") {
      cursor += travelMinutesFromPrev;
    }
    const startTime = timeFromMinutes(cursor);
    cursor += activity.durationMinutes ?? activity.recommendedDuration ?? 60;
    const endTime = timeFromMinutes(cursor);
    activities.push({
      ...activity,
      order: index + 1,
      startTime,
      endTime,
      travelMinutesFromPrev,
    });
  }

  return { ...day, activities };
}

async function attachKnownPoiAndOptimizeRoutes(
  days: Day[],
  savedCandidates: SavedPlaceCandidate[],
  confirmedPlaces: ConfirmedPlace[]
) {
  const knownPlaces = buildRouteKnownPlaces(savedCandidates, confirmedPlaces);
  const enrichedDays = days.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => {
      if (activity.poi) return activity;
      const knownPlace = findKnownPlaceForActivity(activity, knownPlaces);
      const poi = knownPlace ? poiFromKnownPlace(knownPlace) : null;
      return poi
        ? {
            ...activity,
            poi,
            customName: activity.customName ?? poi.name,
            openingHours: activity.openingHours ?? poi.openingHours,
            ticketReference: activity.ticketReference ?? poi.priceRange,
          }
        : activity;
    }),
  }));
  return Promise.all(enrichedDays.map(optimizeDayRouteOrder));
}

function buildFastItineraryDraft({
  destination,
  startDate,
  dayCount,
  savedCandidates,
  confirmedPlaces,
  budgetMin,
  budgetMax,
}: {
  destination: string;
  startDate: string;
  dayCount: number;
  savedCandidates: SavedPlaceCandidate[];
  confirmedPlaces: ConfirmedPlace[];
  budgetMin: number;
  budgetMax: number;
}) {
  const seen = new Set<string>();
  let candidatePool = [
    ...confirmedPlaces.map((place) => ({
      name: place.name,
      category: place.category,
      reason: place.notes || "用户提到的地点",
      sourceReason: "来自用户确认地点",
    })),
    ...savedCandidates.map((candidate) => ({
      name: candidate.name,
      category: candidate.category,
      reason: candidate.reason,
      sourceReason: candidate.sourceRefs?.includes("探索页心愿池")
        ? "[心愿地] 来自探索页心愿池"
        : "来自已提炼候选地点",
    })),
  ].filter((item) => {
    const key = normalizeWishlistName(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const usedGenericFallback = candidatePool.length < dayCount * 2;

  const genericTemplates = [
    { suffix: "经典地标", category: "attraction", reason: "模型生成超时，先安排城市经典地标段，具体地点可继续让 AI 替换。" },
    { suffix: "美食街区", category: "food", reason: "模型生成超时，先保留美食探索时段，建议后续补充具体餐厅。" },
    { suffix: "购物街区", category: "other", reason: "模型生成超时，先保留购物逛街时段，后续可替换为商场或街区。" },
    { suffix: "城市漫步区", category: "attraction", reason: "模型生成超时，先保留轻松步行游览时段，具体路线可继续微调。" },
    { suffix: "夜间活动区", category: "other", reason: "模型生成超时，先保留晚间活动时段，建议出发前确认营业时间。" },
    { suffix: "室内备选点", category: "attraction", reason: "模型生成超时，先安排室内备选，适合雨天或体力不足时替换。" },
  ] as const;
  let fallbackIndex = 0;
  while (candidatePool.length < dayCount * 2) {
    const template = genericTemplates[fallbackIndex % genericTemplates.length]!;
    const round = Math.floor(fallbackIndex / genericTemplates.length) + 1;
    const name = `${destination}${template.suffix}${round > 1 ? ` ${round}` : ""}`;
    const key = normalizeWishlistName(name);
    fallbackIndex += 1;
    if (seen.has(key)) continue;
    seen.add(key);
    candidatePool = [
      ...candidatePool,
      {
        name,
        category: template.category,
        reason: template.reason,
        sourceReason: "来自快速兜底模板",
      },
    ];
  }

  const timeSlots = [
    { start: "09:30", end: "11:30" },
    { start: "12:00", end: "13:30" },
    { start: "15:00", end: "17:00" },
  ];

  let cursor = 0;
  const days = Array.from({ length: dayCount }, (_, dayOffset) => {
    const dayCandidates = candidatePool.slice(cursor, cursor + 2);
    cursor += dayCandidates.length;
    const activities = dayCandidates.map((picked, index) => {
      const slot = timeSlots[index] ?? timeSlots.at(-1)!;
      const type = normalizeGeneratedActivityType(picked.category);
      return {
        order: index + 1,
        type,
        name: picked.name,
        startTime: slot.start,
        endTime: slot.end,
        durationMinutes: type === "food" ? 90 : 120,
        estimatedCost: type === "food" ? 80 : type === "transport" ? 30 : 50,
        notes: picked.reason || "根据已获取的信息快速安排，建议出发前确认细节。",
        sourceReason: picked.sourceReason,
        bookingRequired: false,
        openingHours: undefined,
        recommendedDuration: type === "food" ? 90 : 120,
        ticketReference: undefined,
        travelMinutesFromPrev: index === 0 ? undefined : 20,
        weatherFit: "any",
      };
    });

    return {
      dayIndex: dayOffset + 1,
      date: dateForDay(startDate, dayOffset + 1),
      theme: `${destination}第 ${dayOffset + 1} 天`,
      activities,
      notes: usedGenericFallback
        ? "主生成耗时较长，已先生成可编辑骨架；具体地点、餐厅和开放时间建议继续让 AI 替换确认。"
        : "基于已提炼候选地点生成，可继续让 AI 微调节奏。",
    };
  });

  return fitGeneratedCostsToBudget({
    days,
    overallTips: usedGenericFallback
      ? `主生成耗时较长，已先生成一版可编辑行程骨架。部分地点是占位类型，请继续补充想去的地点或让 AI 替换为具体 POI。预算已控制在 ${budgetMin}-${budgetMax} CNY 区间内。`
      : `主生成耗时较长，已先使用真实候选地点生成可编辑版本。预算已控制在 ${budgetMin}-${budgetMax} CNY 区间内。`,
    budgetSummary: {},
  }, budgetMin, budgetMax);
}

function extractPlaceToAdd(message: string): string | null {
  const compact = message.replace(/[。！!？?]/g, "").trim();
  const patterns = [
    /第(?:[一二三四五六七八九十两]|\d)+天(?:我)?想去(.+)/,
    /第(?:[一二三四五六七八九十两]|\d)+天(?:我)?要去(.+)/,
    /把(.+?)加到第(?:[一二三四五六七八九十两]|\d)+天/,
    /想去(.+?)(?:，|,)?帮我(?:加进|加入|安排到)行程/,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    const raw = match?.[1]?.trim();
    if (raw) {
      return raw
        .replace(/^(一下|一个|这个)/, "")
        .replace(/(吧|呀|啊)$/, "")
        .trim();
    }
  }
  return null;
}

function buildAddedActivity(targetDay: Day, placeName: string): Day["activities"][number] {
  const lastActivity = [...targetDay.activities].sort((a, b) => a.order - b.order).at(-1);
  const startHour = lastActivity?.endTime ? Number.parseInt(lastActivity.endTime.slice(0, 2), 10) : 17;
  const startMinute = lastActivity?.endTime ? Number.parseInt(lastActivity.endTime.slice(3, 5), 10) : 30;
  const startDate = new Date(`${targetDay.date}T${String(Number.isFinite(startHour) ? startHour : 17).padStart(2, "0")}:${String(Number.isFinite(startMinute) ? startMinute : 30).padStart(2, "0")}:00`);
  startDate.setMinutes(startDate.getMinutes() + 30);
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + 120);

  const formatTime = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  return {
    id: crypto.randomUUID(),
    dayId: targetDay.id,
    order: targetDay.activities.length + 1,
    type: "attraction",
    poi: null,
    customName: placeName,
    startTime: formatTime(startDate),
    endTime: formatTime(endDate),
    durationMinutes: 120,
    estimatedCost: 0,
    notes: "已按你的要求加入这处地点；门票、开放时间和预约规则建议出发前确认。",
    sourceReason: "根据用户补充需求新增",
    openingHours: "",
    recommendedDuration: 120,
    travelMinutesFromPrev: 30,
    bookingRequired: /宫|馆|博物馆|故宫|大学/.test(placeName),
    weatherFit: "any",
    ticketReference: undefined,
    isGenerated: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function reviseByAddingPlace(
  state: TravelAgentState,
  current: NonNullable<TravelAgentState["itineraryDraft"]>,
  dayIndex: number,
  placeName: string
): Partial<TravelAgentState> | null {
  const targetDay = current.days.find((day) => day.dayIndex === dayIndex);
  if (!targetDay) return null;

  if (targetDay.activities.some((activity) => (activity.customName ?? activity.poi?.name ?? "") === placeName)) {
    return {
      assistantMessage: `第 ${dayIndex} 天已经有“${placeName}”了，我先保留现有安排。`,
      actionLog: [
        logAction(state, "revise_itinerary", `skip duplicate place: ${placeName}`, 0),
      ],
    };
  }

  const nextDays = current.days.map((day) => {
    if (day.dayIndex !== dayIndex) return cloneDay(day);
    const cloned = cloneDay(day);
    cloned.activities = [...cloned.activities, buildAddedActivity(cloned, placeName)];
    return cloned;
  });

  return {
    itineraryDraft: {
      ...current,
      days: nextDays,
    },
    assistantMessage: `已把“${placeName}”加入第 ${dayIndex} 天，并尽量保留了当天原有节奏。`,
    actionLog: [
      logAction(state, "revise_itinerary", `added ${placeName} to day ${dayIndex}`, 0),
    ],
  };
}

function reviseForRainyBackup(
  state: TravelAgentState,
  current: NonNullable<TravelAgentState["itineraryDraft"]>
): Partial<TravelAgentState> {
  const destination = state.trip?.destination ?? state.parsedTripRequirements?.destination ?? "";
  const outdoorPattern = /长城|公园|寺|山|湖|园|巷|街区|植物园|大学|胡同|湿地|步行街|古镇|乐园|夜市/;
  let fallbackCursor = 0;
  const changedDays: string[] = [];
  const stripRainyHint = (text: string) =>
    text
      .replace(/\s*雨天改线：原计划为.*?，现改为.*?等室内安排，出发前可再按天气微调。/g, "")
      .replace(/\s*已补充雨天备选说明，优先保留节奏相近的室内替代方案。/g, "")
      .trim();
  const getIndoorFallbackName = (name: string) => {
    const beijingPool = [
      "国家博物馆",
      "首都博物馆",
      "中国美术馆",
      "嘉德艺术中心",
      "Page One 书店",
      "侨福芳草地艺术空间",
    ];
    const genericPool = [
      "城市博物馆",
      "美术馆",
      "艺术中心",
      "独立书店",
      "室内展馆",
      "文化商场",
    ];
    const pool = /北京/.test(destination) ? beijingPool : genericPool;

    if (/巷|胡同|街|步行街|夜市/.test(name)) {
      return pool[(fallbackCursor + 4) % pool.length];
    }
    if (/长城|山|湿地|植物园|公园|园|湖/.test(name)) {
      return pool[fallbackCursor % pool.length];
    }
    if (/寺|大学|古镇|乐园/.test(name)) {
      return pool[(fallbackCursor + 2) % pool.length];
    }
    return pool[fallbackCursor % pool.length];
  };

  const nextDays = current.days.map((day) => {
    const cloned = cloneDay(day);
    let dayChanged = false;
    cloned.activities = cloned.activities.map((activity) => {
      const name = activity.customName ?? activity.poi?.name ?? "";
      if (!outdoorPattern.test(name) && !/户外|步行|登山|骑行/.test(activity.notes ?? "")) {
        return activity;
      }
      const fallbackLabel = getIndoorFallbackName(name);
      fallbackCursor += 1;
      dayChanged = true;
      const baseNotes = stripRainyHint(activity.notes ?? "");
      return {
        ...activity,
        type: "attraction",
        poi: {
          amapId: "",
          name: fallbackLabel,
          address: destination ? `${destination}室内备选` : "室内备选",
          coordinate: { lat: 0, lng: 0 },
          category: "attraction",
          photos: [],
        },
        customName: fallbackLabel,
        notes: `${baseNotes ? `${baseNotes} ` : ""}雨天改线：原计划为${name}，现改为${fallbackLabel}等室内安排，出发前可再按天气微调。`.trim(),
        weatherFit: "indoor",
        updatedAt: new Date().toISOString(),
      };
    });
    if (dayChanged) {
      changedDays.push(`第 ${day.dayIndex} 天`);
    }
    const baseDayNotes = stripRainyHint(cloned.notes ?? "");
    cloned.notes = dayChanged
      ? `${baseDayNotes ? `${baseDayNotes} ` : ""}已补充雨天备选说明，优先保留节奏相近的室内替代方案。`.trim()
      : baseDayNotes;
    return cloned;
  });

  return {
    itineraryDraft: {
      ...current,
      days: nextDays,
      overallTips: `${current.overallTips ? `${current.overallTips}\n` : ""}如遇下雨，优先把户外段替换成博物馆、美术馆、书店或室内展馆这类可停留的室内活动。`.trim(),
    },
    assistantMessage: changedDays.length
      ? `已经把${changedDays.join("、")}里受天气影响更大的户外段改成室内去处了，公园、步行街这类安排不会再被标成“雨天友好”。`
      : "我检查过这份行程了，目前没有明显需要额外补雨天备选的户外段。",
    actionLog: [
      logAction(state, "revise_itinerary", "generated rainy-day fallback", 0),
    ],
  };
}

function totalActivityCount(days: Day[]): number {
  return days.reduce((sum, day) => sum + day.activities.length, 0);
}

function buildDraftFromVersion(
  version: ItineraryVersion,
  tripId: string
): NonNullable<TravelAgentState["itineraryDraft"]> {
  return {
    days: version.days.map((day) => ({
      id: crypto.randomUUID(),
      tripId,
      dayIndex: day.dayIndex,
      date: day.date,
      notes: "",
      activities: day.activities.map((activity) => ({
        id: crypto.randomUUID(),
        dayId: "",
        order: activity.order,
        type: activity.type === "restaurant" ? "food" : activity.type as ActivityType,
        poi: null,
        customName: activity.name,
        startTime: activity.startTime ?? "",
        endTime: activity.endTime ?? "",
        durationMinutes: activity.durationMinutes ?? 60,
        estimatedCost: activity.estimatedCost ?? 0,
        notes: activity.notes ?? "",
        sourceReason: "",
        openingHours: "",
        recommendedDuration: activity.durationMinutes ?? 60,
        bookingRequired: false,
        weatherFit: "any" as const,
        ticketReference: undefined,
        isGenerated: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })).map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({ ...activity, dayId: day.id })),
    })),
    overallTips: undefined,
    budgetSummary: undefined,
  };
}

function findLatestNonEmptyVersion(versions: ItineraryVersion[]): ItineraryVersion | null {
  return [...versions]
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .find((version) => version.days.some((day) => day.activities.length > 0)) ?? null;
}

// === Node 1: load_context ===

export async function loadContextNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const result: Partial<TravelAgentState> = {
    confirmedPlaces: state.confirmedPlaces ?? [],
    versions: state.versions ?? [],
    errors: [],
  };

  if (state.tripId) {
    const supabase = getSupabase();
    const { data: tripRow } = await supabase
      .from("trips")
      .select("*")
      .eq("id", state.tripId)
      .maybeSingle();

    if (tripRow) {
      const { data: dayRows } = await supabase
        .from("days")
        .select("*")
        .eq("trip_id", state.tripId)
        .order("day_index", { ascending: true });

      let activityRows: Array<Record<string, unknown>> = [];
      if (dayRows?.length) {
        const dayIds = dayRows.map((day) => String(day.id));
        const { data: rows } = await supabase
          .from("activities")
          .select("*")
          .in("day_id", dayIds)
          .order("order", { ascending: true });
        activityRows = rows ?? [];
      }

      const days: Day[] = (dayRows ?? []).map((dayRow) => ({
        id: String(dayRow.id),
        tripId: String(dayRow.trip_id),
        dayIndex: Number(dayRow.day_index),
        date: String(dayRow.date),
        notes: String(dayRow.notes ?? ""),
        activities: activityRows
          .filter((row) => String(row.day_id) === String(dayRow.id))
          .map((row) => ({
            id: String(row.id),
            dayId: String(row.day_id),
            order: Number(row.order ?? 0),
            type: String(row.type || "attraction") as ActivityType,
            poi: row.poi_name
              ? {
                  amapId: String(row.poi_id ?? ""),
                  name: String(row.poi_name),
                  address: String(row.poi_address ?? ""),
                  coordinate: {
                    lat: Number(row.poi_lat ?? 0),
                    lng: Number(row.poi_lng ?? 0),
                  },
                  category: String(row.type ?? "other"),
                  photos: [],
                  openingHours: row.opening_hours ? String(row.opening_hours) : undefined,
                }
              : null,
            customName: String(row.poi_name ?? ""),
            startTime: String(row.start_time ?? ""),
            endTime: String(row.end_time ?? ""),
            durationMinutes: Number(row.duration_minutes ?? 60),
            estimatedCost: Number(row.estimated_cost ?? 0),
            notes: String(row.notes ?? ""),
            sourceReason: String(row.source_reason ?? ""),
            openingHours: String(row.opening_hours ?? ""),
            recommendedDuration: Number(row.recommended_duration ?? row.duration_minutes ?? 60),
            travelMinutesFromPrev: row.travel_minutes_from_prev == null ? undefined : Number(row.travel_minutes_from_prev),
            bookingRequired: Boolean(row.booking_required ?? false),
            weatherFit: normalizeWeatherFit(row.weather_fit ? String(row.weather_fit) : undefined),
            ticketReference: row.ticket_reference ? String(row.ticket_reference) : undefined,
            isGenerated: Boolean(row.is_generated ?? false),
            createdAt: String(row.created_at ?? new Date().toISOString()),
            updatedAt: String(row.updated_at ?? new Date().toISOString()),
          })),
        createdAt: String(dayRow.created_at ?? new Date().toISOString()),
        updatedAt: String(dayRow.updated_at ?? new Date().toISOString()),
      }));

      const trip: Trip = {
        id: String(tripRow.id),
        userId: String(tripRow.user_id ?? SERVER_ANONYMOUS_USER_ID),
        title: String(tripRow.title ?? ""),
        destination: String(tripRow.destination ?? ""),
        destinationCoord: {
          lat: Number(tripRow.destination_lat ?? 0),
          lng: Number(tripRow.destination_lng ?? 0),
        },
        startDate: String(tripRow.start_date ?? ""),
        endDate: String(tripRow.end_date ?? ""),
        travelers: {
          adults: Number(tripRow.adults ?? 1),
          children: Number(tripRow.children ?? 0),
        },
        budget: {
          currency: String(tripRow.currency ?? "CNY"),
          min: Number(tripRow.budget_min ?? 0),
          max: Number(tripRow.budget_max ?? 10000),
        },
        preferences: Array.isArray(tripRow.preferences) ? tripRow.preferences as Trip["preferences"] : [],
        days,
        status: (tripRow.status as Trip["status"]) ?? "draft",
        isPublic: Boolean(tripRow.is_public ?? false),
        createdAt: String(tripRow.created_at ?? new Date().toISOString()),
        updatedAt: String(tripRow.updated_at ?? new Date().toISOString()),
      };

      result.trip = trip;
      if (days.length > 0) {
        result.itineraryDraft = {
          days,
          overallTips: state.itineraryDraft?.overallTips,
          budgetSummary: state.itineraryDraft?.budgetSummary,
        };
      }
      result.parsedTripRequirements = state.parsedTripRequirements ?? {
        destination: trip.destination,
        destinationCoord: trip.destinationCoord,
        startDate: trip.startDate,
        endDate: trip.endDate,
        dayCount: trip.days.length || Math.max(
          1,
          Math.ceil(
            (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000
          ) + 1
        ),
        travelers: trip.travelers,
        budget: trip.budget,
        preferences: trip.preferences,
      };
    }
  }

  // Load itinerary versions from DB
  if (state.tripId) {
    const versions = await db.query<ItineraryVersion>(
      "itinerary_versions",
      (v) => v.tripId === state.tripId
    );
    result.versions = versions.sort(
      (a, b) => b.versionNumber - a.versionNumber
    );
    result.currentVersionNumber = versions.length > 0
      ? Math.max(...versions.map((v) => v.versionNumber))
      : 0;

    const loadedDays = result.itineraryDraft?.days ?? [];
    if ((!loadedDays.length || totalActivityCount(loadedDays) === 0) && result.versions.length > 0) {
      const fallbackVersion = findLatestNonEmptyVersion(result.versions);
      if (fallbackVersion) {
        result.itineraryDraft = buildDraftFromVersion(fallbackVersion, state.tripId);
      }
    }
  }

  result.actionLog = [
    logAction(
      state,
      "load_context",
      `loaded trip=${!!result.trip}, versions=${result.versions?.length ?? 0}`,
      Date.now() - t0
    ),
  ];

  return result;
}

// === Node 2: classify_intent ===

export async function classifyIntentNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();

  // Preserve pre-set intent (from confirm/resume flow)
  if (state.intent && state.intentConfidence && state.intentConfidence >= 1) {
    return {};
  }

  const msg = state.currentMessage ?? "";
  if (isTripDurationAdviceQuery(msg) || isAccommodationAdviceQuery(msg)) {
    return {
      intent: "recommendDestinations",
      intentConfidence: 0.95,
      actionLog: [
        logAction(state, "classify_intent", "keyword: recommendation_advice", Date.now() - t0),
      ],
    };
  }

  const quickIntent = detectQuickIntent(msg, state);

  // Use keyword detection if it's a clear match — skip LLM for speed
  if (quickIntent !== "generalChat") {
    return {
      intent: quickIntent as TravelAgentState["intent"],
      intentConfidence: 0.9,
      actionLog: [
        logAction(state, "classify_intent", `keyword: ${quickIntent}`, Date.now() - t0),
      ],
    };
  }

  // Only call LLM for ambiguous/general messages
  try {
    const history = (state.conversationHistory ?? [])
      .slice(-10)
      .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content.slice(0, 100)}`)
      .join("\n");

    const prompt = INTENT_CLASSIFY_PROMPT
      .replace("{conversationHistory}", history || "（无历史）")
      .replace("{hasTrip}", String(!!state.trip))
      .replace("{destination}", state.trip?.destination ?? "未知")
      .replace("{confirmedPlaceCount}", String(state.confirmedPlaces?.length ?? 0))
      .replace("{versionCount}", String(state.versions?.length ?? 0))
      .replace("{hasDraft}", String(!!state.itineraryDraft?.days?.length))
      .replace("{missingInfo}", (state.missingInfo ?? []).join(", ") || "无")
      .replace("{userMessage}", msg);

    const parsed = await deepseekClient.generateJson(
      [
        { role: "system", content: "意图分类。只输出JSON。" },
        { role: "user", content: prompt },
      ],
      { temperature: 0, maxTokens: 100 }
    );
    const v = validateWithSchema(IntentResultSchema, parsed, "intent");
    return {
      intent: v.intent as TravelAgentState["intent"],
      intentConfidence: v.confidence,
      actionLog: [logAction(state, "classify_intent", `llm: ${v.intent}`, Date.now() - t0)],
    };
  } catch {
    return {
      intent: quickIntent as TravelAgentState["intent"],
      intentConfidence: 0.5,
      actionLog: [logAction(state, "classify_intent", "fallback", Date.now() - t0)],
    };
  }
}

/** Keyword-based quick intent detection as LLM fallback */
function isTripDurationAdviceQuery(msg: string) {
  const text = msg.trim();
  return /(?:适合|建议|推荐|一般|通常|大概|最好)?.{0,12}(?:玩|游玩|旅行|旅游|安排|待|待上|留).{0,8}(?:几天|多少天|几晚|多久).{0,12}(?:合适|比较好|够|够不够)?/.test(text)
    || /(?:几天|多少天|几晚|多久).{0,12}(?:合适|比较好|够|够不够)/.test(text);
}

function isAccommodationAdviceQuery(msg: string) {
  const text = msg.trim();
  return /(?:住在哪里|住哪儿|住哪里|住宿|酒店|民宿|客栈|住.*方便|住.*合适|建议住|推荐住|住宿推荐|酒店推荐|住.*区域|哪个区域住)/.test(text);
}

function detectQuickIntent(
  msg: string,
  state: TravelAgentState
): TravelAgentState["intent"] | "generalChat" {
  const text = msg.trim();
  if (!text) return "generalChat";

  const createPatterns = /想去|去.+玩|玩(?:儿)?\s*\d+\s*天|计划玩|安排.*行程|规划.*行程|做个行程|生成行程|继续帮我规划|按这个目的地继续/;
  const recommendPatterns = /推荐.*(城市|目的地|地方|国家)|适合.*(旅游|旅行|度假).*(城市|地方|国家)|去哪里玩|去哪儿玩|有什么.*目的地|想找.*旅行地/;
  const placeGuidePatterns = /(?:都)?可以玩什么|怎么玩|玩法|游玩攻略|有什么好玩|玩什么|怎么逛|值得玩/;
  const explicitTripInfoPatterns = /\d+\s*天|\d+\s*晚|预算|人均|\d+\s*人|自由行|亲子|蜜月|城市漫步|美食|海岛|避暑|打卡/;
  const placeListPatterns = /、|，|,|还有|以及|下面|收藏|笔记|景点|餐厅|咖啡|酒店|必去|想去|打卡/;
  const tripScopedAddPatterns = /第[一二三四五六七八九十0-9]+天.*(想去|加入|加上|安排)|想去.+(加进|加入|安排到).*(行程|第[一二三四五六七八九十0-9]+天)|把.+加到.+(行程|第[一二三四五六七八九十0-9]+天)/;
  const revisePatterns = /太赶|太累|太满|太多|太少|太松|松散|加(?:一)?个|添加|加入|加进|去掉|删除|换成|替换|修改|改成|轻松|放松|紧凑|充实|多玩|室内|雨天|亲子|预算低|便宜/;
  const critiquePatterns = /合理|检查|看看|顺路|绕路|可以不|会不会|怎么样|行不行|体检|评估|问题/;
  const exportPatterns = /导出|分享|发送|复制|下载|markdown|notion|清单/;
  const checklistAcceptancePatterns = /^(需要|要|可以|好|好的|来一份|生成|帮我生成|做一份|要的|需要的)$/;
  const generatePatterns = /开始规划|开始创建|生成(?:行程)?|直接(?:生成|规划|安排)|帮我(?:规划|安排|排)|你(?:来|帮我|定|安排)|规划吧|开始吧|可以了|好了|确认创建/;
  const editInfoPatterns = /^修改信息$|^继续修改$|改信息|重新填|补充信息/;
  const noMorePlacesPatterns = /^没有$|^不用了?$|^不需要$|^没了$|^先这样$/;
  const formSubmitPatterns = /^(补充信息|确认信息)[:：]/;

  const hasTrip = !!state.trip;
  const hasTripContext = !!(state.trip || state.tripId);
  const hasPlaces = (state.confirmedPlaces?.length ?? 0) > 0;
  const hasItinerary = !!state.itineraryDraft?.days?.length || (state.versions?.length ?? 0) > 0;
  const reqs = state.parsedTripRequirements;
  const hasParsedReqs = !!reqs?.destination;
  const missingInfo = state.missingInfo ?? [];
  const hasMissingInfo = missingInfo.length > 0;
  const hasEssentialReqs = !!reqs?.destination
    && !!(reqs.dayCount || (reqs.startDate && reqs.endDate))
    && !!reqs.preferences?.length;

  if (placeGuidePatterns.test(text) || isAccommodationAdviceQuery(text)) return "recommendDestinations";
  if (isRecommendationFollowUp(text, state)) return "recommendDestinations";

  if (!hasTrip && !hasParsedReqs && recommendPatterns.test(text) && !explicitTripInfoPatterns.test(text)) {
    return "recommendDestinations";
  }

  const lastAssistantMessage = [...(state.conversationHistory ?? [])]
    .reverse()
    .find((item) => item.role === "agent")?.content ?? "";
  const isAnsweringChecklistOffer =
    /旅行必备清单|行前清单/.test(lastAssistantMessage) && checklistAcceptancePatterns.test(text);

  if (hasItinerary && (exportPatterns.test(text) || isAnsweringChecklistOffer)) return "exportItinerary";
  if (hasItinerary && critiquePatterns.test(text) && /会不会|是否|合理|行不行|可以不|检查|看看|评估|体检/.test(text)) {
    return "critiqueItinerary";
  }
  if ((hasItinerary || hasTripContext) && tripScopedAddPatterns.test(text)) return "reviseItinerary";
  if (hasItinerary && revisePatterns.test(text)) return "reviseItinerary";
  if ((hasItinerary || hasTripContext) && /(帮我.*(添加|加入|加进).*(行程)|想去.+帮我.*(加|安排).*(行程)|把.+加到行程|室内行程)/.test(text)) {
    return "reviseItinerary";
  }
  if (hasItinerary && critiquePatterns.test(text)) return "critiqueItinerary";

  if (editInfoPatterns.test(text)) return "parseTrip";
  if (formSubmitPatterns.test(text)) return "parseTrip";

  if (hasEssentialReqs && (generatePatterns.test(text) || noMorePlacesPatterns.test(text))) {
    return "generateItinerary";
  }

  if (hasParsedReqs && hasMissingInfo) {
    return "parseTrip";
  }

  if (!hasTrip && (createPatterns.test(text) || explicitTripInfoPatterns.test(text))) return "parseTrip";

  if (hasTrip && !hasPlaces && /、|，|,|还有|以及|下面|收藏|笔记/.test(text) && placeListPatterns.test(text)) return "parsePlaces";

  if (!hasItinerary && (hasTrip || hasEssentialReqs || hasPlaces) && generatePatterns.test(text)) {
    return "generateItinerary";
  }

  return "generalChat";
}

export async function recommendDestinationsNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();

  try {
    if (isTripDurationAdviceQuery(state.currentMessage ?? "")) {
      const reply = await deepseekClient.generateText(
        [
          {
            role: "system",
            content:
              "你是目的地玩法建议助手。用户在问某个地方适合玩几天时，请做归纳总结：先给推荐天数，再说明短住/标准/深度玩法分别适合什么，不要进入正式行程规划，也不要要求用户补全日期、预算、人数。",
          },
          { role: "user", content: state.currentMessage ?? "" },
        ],
        { temperature: 0.35, maxTokens: 320 }
      );

      return {
        assistantMessage: reply.trim(),
        actionLog: [
          logAction(
            state,
            "recommend_destinations",
            "duration advice summary",
            Date.now() - t0
          ),
        ],
      };
    }

    const cityPlaceRecommendationCity = readCityPlaceRecommendationCity(state.currentMessage ?? "");
    if (isCityPlaceRecommendationQuery(state.currentMessage ?? "")) {
      const prompt = RECOMMEND_DESTINATIONS_PROMPT.replace(
        "{userMessage}",
        buildRecommendationUserMessage(state)
      );

      const parsed = await deepseekClient.generateJson(
        [
          { role: "system", content: "你是城市内 POI 推荐助手。只输出合法 JSON。推荐必须是用户指定城市里的具体地点、街区、餐厅或玩法，不要推荐其他城市。" },
          { role: "user", content: prompt },
        ],
        { temperature: 0.4, maxTokens: 900 }
      );
      const result = validateWithSchema(
        RecommendDestinationsResultSchema,
        parsed,
        "recommend_destinations"
      );
      const candidates = recommendationsToSavedPlaceCandidates(cityPlaceRecommendationCity, result);

      return {
        assistantMessage: result.intro,
        savedPlaceCandidates: candidates,
        selectedSavedPlaces: [],
        candidatePoolConfirmed: false,
        needsHumanConfirmation: candidates.length > 0,
        pendingConfirmationType: "candidates",
        pendingMessage: candidates.length > 0
          ? `我先把${cityPlaceRecommendationCity}值得去的地点整理成候选 POI，你可以点选想加入行程的地方。`
          : result.intro,
        actionLog: [
          logAction(
            state,
            "recommend_destinations",
            `local candidates=${candidates.length}`,
            Date.now() - t0
          ),
        ],
      };
    }

    if (isPlaceGuideQuery(state.currentMessage ?? "")) {
      const knownGuide = buildKnownPlaceGuide(state.currentMessage ?? "");
      const result = knownGuide ?? validateWithSchema(
        PlaceGuideResultSchema,
        await deepseekClient.generateJson(
          [
            { role: "system", content: "你是景点游玩攻略助手。只输出合法 JSON。所有玩法必须围绕用户询问的同一个地点，不要跨城市推荐。" },
            {
              role: "user",
              content: PLACE_GUIDE_PROMPT.replace(
                "{userMessage}",
                state.currentMessage ?? ""
              ),
            },
          ],
          { temperature: 0.25, maxTokens: 1300 }
        ),
        "place_guide"
      );
      const spots = await attachPlaceGuidePhotos(result.placeName, result.spots);

      return {
        assistantMessage: result.intro,
        responsePayload: {
          type: "place_guide_card",
          placeName: result.placeName,
          title: result.title,
          intro: result.intro,
          bestTime: result.bestTime,
          tips: result.tips,
          spots,
        },
        actionLog: [
          logAction(
            state,
            "place_guide",
            `generated ${result.spots.length} spots for ${result.placeName}`,
            Date.now() - t0
          ),
        ],
      };
    }

    const prompt = RECOMMEND_DESTINATIONS_PROMPT.replace(
      "{userMessage}",
      buildRecommendationUserMessage(state)
    );

    const parsed = await deepseekClient.generateJson(
      [
        { role: "system", content: "你是旅行目的地推荐顾问。只输出合法 JSON。" },
        { role: "user", content: prompt },
      ],
      { temperature: 0.5, maxTokens: 900 }
    );

    const result = validateWithSchema(
      RecommendDestinationsResultSchema,
      parsed,
      "recommend_destinations"
    );

    return {
      assistantMessage: result.intro,
      responsePayload: {
        type: "destination_recommendation_card",
        title: result.title,
        intro: result.intro,
        recommendations: result.recommendations,
      },
      actionLog: [
        logAction(
          state,
          "recommend_destinations",
          `recommended ${result.recommendations.length} destinations`,
          Date.now() - t0
        ),
      ],
    };
  } catch (err) {
    return {
      errors: [...(state.errors ?? []), `recommend_destinations: ${(err as Error).message}`],
      assistantMessage: "我可以先按旅行风格给你推荐几个城市，比如城市漫步、美食度假、自然风光。你也可以直接告诉我你偏好的旅行感觉。",
      actionLog: [
        logAction(
          state,
          "recommend_destinations",
          `error: ${(err as Error).message}`,
          Date.now() - t0
        ),
      ],
    };
  }
}

export async function generalChatNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();

  try {
    const weatherAnswer = await answerWeatherQuery(state.currentMessage ?? "");
    if (weatherAnswer) {
      return {
        assistantMessage: weatherAnswer,
        actionLog: [
          logAction(state, "general_chat", "answered weather query", Date.now() - t0),
        ],
      };
    }

    const reply = await deepseekClient.generateText(
      [
        {
          role: "system",
          content:
            "你是中文旅行助手。对于用户的泛旅行问题、闲聊、犹豫和灵感探索，先自然回答，再轻轻引导用户告诉你偏好的目的地、旅行风格或出行时间。回答简洁，不要输出 Markdown 标题。",
        },
        { role: "user", content: state.currentMessage ?? "" },
      ],
      { temperature: 0.6, maxTokens: 220 }
    );

    return {
      assistantMessage: reply.trim(),
      actionLog: [
        logAction(state, "general_chat", "responded to general chat", Date.now() - t0),
      ],
    };
  } catch (err) {
    return {
      assistantMessage: "当然可以。你可以先告诉我你更想要哪种旅行感觉，比如城市漫步、美食放松、自然风景，或者我先给你推荐几个目的地方向。",
      errors: [...(state.errors ?? []), `general_chat: ${(err as Error).message}`],
      actionLog: [
        logAction(state, "general_chat", `error: ${(err as Error).message}`, Date.now() - t0),
      ],
    };
  }
}

// === Node 3: parse_places ===

export async function parsePlacesNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  let msg = state.currentMessage;

  // Quick check: if message is too short, return empty
  if (!msg || msg.trim().length < 3) {
    return {
      parsedPlaces: [],
      assistantMessage: "",
    };
  }

  // Phase 4: Detect XHS references and attempt MCP fetch
  if (detectXHSReference(msg)) {
    try {
      const notes = await fetchXHSNote(msg);
      if (notes.length > 0) {
        const extracted = await extractPlacesFromXHS(notes);
        if (extracted) msg = extracted;
      }
    } catch {
      // XHS MCP not available — fall through to regular parsing
    }
  }

  try {
    const prompt = PARSE_PLACES_PROMPT.replace("{userMessage}", msg);

    const parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content:
            "你是旅行地点信息提取器。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.2, maxTokens: 1024 }
    );

    const validated = validateWithSchema(
      ParsePlacesResultSchema,
      parsed,
      "parse_places"
    );

    // Assign IDs to places
    const places: ParsedPlace[] = validated.places.map((p, i) => ({
      ...p,
      id: `${state.threadId}-place-${i}-${Date.now()}`,
    }));

    const placeList = places
      .map((p) => `- ${p.name} (${p.category}) ${p.priority === "must_go" ? "⭐必去" : ""}`)
      .join("\n");

    return {
      parsedPlaces: places,
      assistantMessage: `我从你的文本中找到了 ${places.length} 个地点：\n\n${placeList}\n\n请确认这些地点是否正确，你可以编辑或删除。`,
      actionLog: [
        logAction(
          state,
          "parse_places",
          `parsed ${places.length} places`,
          Date.now() - t0
        ),
      ],
    };
  } catch (err) {
    return {
      parsedPlaces: [],
      errors: [
        ...(state.errors ?? []),
        `parse_places failed: ${(err as Error).message}`,
      ],
      assistantMessage:
        "抱歉，解析地点时出错了。请确保你的文本包含清晰的地点名称，再试一次。",
      actionLog: [
        logAction(
          state,
          "parse_places",
          `error: ${(err as Error).message}`,
          Date.now() - t0
        ),
      ],
    };
  }
}

// === Node 4: plan_transport ===

export async function planTransportNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const plan =
    createTransportPlanFromMessage(state.currentMessage ?? "") ??
    buildTransportPlanFromState(state);

  if (!plan) {
    return {
      actionLog: [
        logAction(
          state,
          "plan_transport",
          "skipped: no cross-city transport request",
          Date.now() - t0
        ),
      ],
    };
  }

  return {
    transportPlan: plan,
    transportConfirmed: false,
    needsHumanConfirmation: true,
    pendingConfirmationType: "transport",
    pendingMessage: "太好了，旅行信息已经齐了。第一步我先帮你把往返大交通排出来，选好后我会按照到达和返程时间继续安排游玩节奏。",
    assistantMessage: "",
    actionLog: [
      logAction(
        state,
        "plan_transport",
        `mock ${plan.origin}->${plan.destination}, outbound=${plan.outboundOptions.length}, return=${plan.returnOptions.length}`,
        Date.now() - t0
      ),
    ],
  };
}

// === Node 5: generate_itinerary ===

export async function researchInspirationNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const trip = state.trip;
  const reqs = state.parsedTripRequirements;
  const destination = trip?.destination ?? reqs?.destination ?? "";
  const preferences = (trip?.preferences ?? reqs?.preferences ?? []) as string[];
  const dayCount =
    reqs?.dayCount ??
    trip?.days?.length ??
    ((trip?.startDate && trip?.endDate)
      ? Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1
      : 3);

  if (!destination) {
    return {};
  }

  try {
    const result = await searchTravelInspiration(destination, preferences, dayCount);
    const candidateContext = result.savedPlaceCandidates
      .slice(0, 8)
      .map((candidate) => `${candidate.name}(${candidate.priorityTag})`)
      .join("、");

    return {
      inspirationItems: result.inspirationItems,
      savedPlaceCandidates: result.savedPlaceCandidates,
      selectedSavedPlaces: [],
      candidatePoolConfirmed: result.savedPlaceCandidates.length === 0,
      needsHumanConfirmation: result.savedPlaceCandidates.length > 0,
      pendingConfirmationType: result.savedPlaceCandidates.length > 0 ? "candidates" : undefined,
      pendingMessage: result.savedPlaceCandidates.length > 0
        ? "交通搞定了。接下来是第二步：我先整理 10 个候选地点，你可以点选想加入行程的地点，也可以不选，让我自动取舍后继续细致规划。"
        : "",
      assistantMessage: "",
      actionLog: [
        logAction(state, "xhs_search", `xhs=${result.debug.xhsCount}`, Date.now() - t0),
        logAction(state, "web_search", `web=${result.debug.webCount}`, Date.now() - t0),
        ...result.debug.verticals.map((nodeName) =>
          logAction(state, nodeName, "completed", Date.now() - t0)
        ),
        logAction(state, "extract_places", `items=${result.inspirationItems.length}`, Date.now() - t0),
        logAction(state, "dedupe_candidates", `candidates=${result.savedPlaceCandidates.length}`, Date.now() - t0),
        logAction(state, "poi_enrich", candidateContext || "none", Date.now() - t0),
      ],
    };
  } catch (err) {
    return {
      errors: [...(state.errors ?? []), `research_inspiration: ${(err as Error).message}`],
      actionLog: [
        logAction(state, "xhs_search", "fallback", Date.now() - t0),
        logAction(state, "web_search", `error: ${(err as Error).message}`, Date.now() - t0),
      ],
    };
  }
}

export async function generateItineraryNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();

  const trip = state.trip;
  const reqs = state.parsedTripRequirements;

  // Fallback to parsed requirements if no trip exists yet
  const destination = trip?.destination ?? reqs?.destination ?? "未知";
  const startDate = trip?.startDate ?? reqs?.startDate ?? new Date().toISOString().slice(0, 10);
  const endDate = trip?.endDate ?? reqs?.endDate ?? "";
  const adults = trip?.travelers?.adults ?? reqs?.travelers?.adults ?? 1;
  const children = trip?.travelers?.children ?? reqs?.travelers?.children ?? 0;
  const budgetMin = trip?.budget?.min ?? reqs?.budget?.min ?? 0;
  const budgetMax = trip?.budget?.max ?? reqs?.budget?.max ?? 5000;
  const preferences = trip?.preferences ?? reqs?.preferences ?? [];

  const dayCount = reqs?.dayCount ?? trip?.days?.length ?? (endDate
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : 3);

  if (!destination || destination === "未知") {
    return {
      errors: ["Cannot generate: no destination"],
      assistantMessage: "请先告诉我你正在路上哪里旅行。",
    };
  }

  const places = state.confirmedPlaces ?? [];
  const wishlistNames = extractWishlistNames(state);
  const savedCandidates = mergeWishlistCandidates(wishlistNames, destination, (state.selectedSavedPlaces?.length
    ? state.selectedSavedPlaces
    : state.savedPlaceCandidates) ?? []);
  const mustGo = places.filter((p) => p.priority === "must_go" || p.priority === "want_to_go");
  const optional = places.filter((p) => p.priority === "optional");

  // No specific places → use auto-researched candidate pool, then LLM knowledge as last resort
  const useLLMKnowledge = places.length === 0 && savedCandidates.length === 0;
  let mustGoStr = "";
  let optionalStr = "";
  let inspirationSummary = "";

  if (places.length === 0 && savedCandidates.length > 0) {
    const mappedMustGo = savedCandidates.filter((p) => p.priorityTag === "must_go" || p.priorityTag === "food_candidate");
    const mappedOptional = savedCandidates.filter((p) => p.priorityTag !== "must_go" && p.priorityTag !== "food_candidate");
    mustGoStr = mappedMustGo
      .map(formatPlaceForRoutePrompt)
      .join("\n");
    optionalStr = mappedOptional
      .map(formatPlaceForRoutePrompt)
      .join("\n") || "无";
    inspirationSummary = (state.inspirationItems ?? [])
      .slice(0, 4)
      .map((item) => `- [${item.sourceType}] ${item.title}: ${item.summary.slice(0, 90)}`)
      .join("\n");
  } else if (useLLMKnowledge) {
    mustGoStr = `（用户未指定具体地点，请根据目的地"${destination}"和偏好推荐最值得去的景点、餐厅等）`;
    optionalStr = "无";
  } else {
    mustGoStr = mustGo.map(formatPlaceForRoutePrompt).join("\n");
    optionalStr = optional.map(formatPlaceForRoutePrompt).join("\n") || "无";
  }

  try {
    // Web search for real-time info about destination. On Vercel, keep this
    // lightweight because the inspiration step has already performed web search.
    let enrichedContext = "";
    try {
      const hasInspirationContext =
        (state.inspirationItems?.length ?? 0) > 0
        || savedCandidates.length > 0;
      if (!(isConstrainedServerlessRuntime() && hasInspirationContext)) {
        const destPlace = { name: destination, category: "attraction" as const, priority: "want_to_go" as const, sourceText: destination, id: "", estimatedDuration: 60 };
        const results = await searchMultiplePlaces([destPlace], 1);
        enrichedContext = buildEnrichedContext(results);
      }
    } catch { /* skip if unavailable */ }

    const prompt = ITINERARY_AGENT_PROMPT
      .replace("{dayCount}", String(dayCount))
      .replace("{destination}", destination)
      .replace("{startDate}", startDate)
      .replace("{endDate}", endDate || startDate)
      .replace("{adults}", String(adults))
      .replace("{children}", String(children))
      .replace("{budgetMin}", String(budgetMin))
      .replace("{budgetMax}", String(budgetMax))
      .replace("{preferences}", preferences.join("、") || "无特殊偏好")
      .replace("{pace}", "moderate")
      .replace("{transportContext}", buildSelectedTransportContext(state))
      .replace("{mustGoPlaces}", mustGoStr)
      .replace("{optionalPlaces}", optionalStr)
      .replace("{inspirationSummary}", inspirationSummary || "无")
      .replace("{enrichedContext}", enrichedContext || "无实时数据");

    const maxTokens = itineraryMaxTokens(dayCount);
    const generationTimeoutMs = 90000;
    let parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content:
            "你是专业旅行规划师。生成每天的行程安排，在备注中加入实用建议。绝不编造开放时间或实时数据。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      {
        temperature: 0.3,
        maxTokens,
        signal: boundedTimeoutSignal(state, generationTimeoutMs),
      }
    );

    let validated = validateWithSchema(
      GenerateItineraryResultSchema,
      parsed,
      "generate_itinerary"
    );

    let completenessIssue = itineraryCompletenessIssue(validated.days, dayCount);
    if (completenessIssue && remainingRequestMs(state) > 18000) {
      parsed = await deepseekClient.generateJson(
        [
          {
            role: "system",
            content:
              "你是专业旅行规划师。只输出合法JSON。",
          },
          {
            role: "user",
            content:
              `${prompt}\n\n上一次输出不完整：${completenessIssue}。请重新生成完整 ${dayCount} 天行程：days数组长度必须等于${dayCount}，dayIndex必须从1连续到${dayCount}，且每天必须有2-4个活动。`,
          },
        ],
        {
          temperature: 0.2,
          maxTokens,
          signal: boundedTimeoutSignal(state, 45000),
        }
      );
      validated = validateWithSchema(
        GenerateItineraryResultSchema,
        parsed,
        "generate_itinerary"
      );
    }

    completenessIssue = itineraryCompletenessIssue(validated.days, dayCount);
    if (completenessIssue && remainingRequestMs(state) <= 18000) {
      throw new DOMException("Itinerary generation deadline reached", "AbortError");
    }

    if (completenessIssue) {
      throw new Error(completenessIssue);
    }

    validated = fitGeneratedCostsToBudget(validated, budgetMin, budgetMax);
    // Convert to Day[] shape compatible with existing Trip type
    const generatedDays: Day[] = validated.days.map((d) => ({
      id: `${state.threadId}-day-${d.dayIndex}`,
      tripId: state.tripId ?? "",
      dayIndex: d.dayIndex,
      date: d.date,
      activities: d.activities.map((a) => ({
        id: `${state.threadId}-act-${d.dayIndex}-${a.order}`,
        dayId: `${state.threadId}-day-${d.dayIndex}`,
        order: a.order,
        type: normalizeGeneratedActivityType(a.type),
        poi: null,
        customName: a.name,
        startTime: a.startTime,
        endTime: a.endTime,
        durationMinutes: a.durationMinutes,
        estimatedCost: a.estimatedCost,
        notes: isWishlistActivity(a.name, wishlistNames)
          ? markWishlistNotes(a.notes)
          : a.notes,
        sourceReason: isWishlistActivity(a.name, wishlistNames)
          ? markWishlistSource(a.sourceReason)
          : a.sourceReason,
        bookingRequired: a.bookingRequired,
        openingHours: a.openingHours,
        recommendedDuration: a.recommendedDuration,
        weatherFit: normalizeWeatherFit(a.weatherFit),
        ticketReference: a.ticketReference ?? undefined,
        travelMinutesFromPrev: a.travelMinutesFromPrev,
        isGenerated: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      notes: d.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const days = await attachKnownPoiAndOptimizeRoutes(appendMissingWishlistActivities(
      generatedDays,
      wishlistNames,
      state.threadId
    ), savedCandidates, places);

    const summary = validated.days
      .map((d) => `Day ${d.dayIndex}: ${d.theme ?? ""} (${d.activities.length}个活动)`)
      .join("\n");

    return {
      itineraryDraft: {
        days,
        overallTips: validated.overallTips,
        budgetSummary: {
          ...(validated.budgetSummary ?? {}),
          totalEstimated: estimateGeneratedCost(validated.days),
          budgetMin,
          budgetMax,
        },
      },
      assistantMessage: appendChecklistOffer(`已为你生成 ${dayCount} 天的行程：\n\n${summary}\n\n${validated.overallTips ?? ""}`),
      actionLog: [
        logAction(
          state,
          "generate_itinerary",
          `generated ${dayCount} day itinerary`,
          Date.now() - t0
        ),
      ],
    };
  } catch (err) {
    const errMsg = (err as Error).message || String(err);
    if (isAbortError(err)) {
      const fallbackDraft = buildFastItineraryDraft({
        destination,
        startDate,
        dayCount,
        savedCandidates,
        confirmedPlaces: places,
        budgetMin,
        budgetMax,
      });
      if (!fallbackDraft) {
        return {
          errors: [
            ...(state.errors ?? []),
            "generate_itinerary aborted: insufficient verified candidates for complete fallback",
          ],
          assistantMessage:
            `生成行程超时了，而且真实候选地点不足以生成完整 ${dayCount} 天行程。我没有保存半成品，请重新点击开始规划，或先补充几个明确想去的地点。`,
          actionLog: [
            logAction(
              state,
              "generate_itinerary",
              "abort without fallback candidates",
              Date.now() - t0
            ),
          ],
        };
      }
      const wishlistNames = extractWishlistNames(state);
      const fallbackDays: Day[] = fallbackDraft.days.map((d) => ({
        id: `${state.threadId}-day-${d.dayIndex}`,
        tripId: state.tripId ?? "",
        dayIndex: d.dayIndex,
        date: d.date,
        activities: d.activities.map((a) => ({
          id: `${state.threadId}-act-${d.dayIndex}-${a.order}`,
          dayId: `${state.threadId}-day-${d.dayIndex}`,
          order: a.order,
          type: normalizeGeneratedActivityType(a.type),
          poi: null,
          customName: a.name,
          startTime: a.startTime,
          endTime: a.endTime,
          durationMinutes: a.durationMinutes,
          estimatedCost: a.estimatedCost,
          notes: isWishlistActivity(a.name, wishlistNames)
            ? markWishlistNotes(a.notes)
            : a.notes,
          sourceReason: isWishlistActivity(a.name, wishlistNames)
            ? markWishlistSource(a.sourceReason)
            : a.sourceReason,
          bookingRequired: a.bookingRequired,
          openingHours: a.openingHours,
          recommendedDuration: a.recommendedDuration,
          weatherFit: normalizeWeatherFit(a.weatherFit),
          ticketReference: a.ticketReference ?? undefined,
          travelMinutesFromPrev: a.travelMinutesFromPrev,
          isGenerated: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
        notes: d.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      const days = await attachKnownPoiAndOptimizeRoutes(appendMissingWishlistActivities(
        fallbackDays,
        wishlistNames,
        state.threadId
      ), savedCandidates, places);
      const summary = fallbackDraft.days
        .map((d) => `Day ${d.dayIndex}: ${d.theme ?? ""} (${d.activities.length}个活动)`)
        .join("\n");

      return {
        itineraryDraft: {
          days,
          overallTips: fallbackDraft.overallTips,
          budgetSummary: {
            ...(fallbackDraft.budgetSummary ?? {}),
            totalEstimated: estimateGeneratedCost(fallbackDraft.days),
            budgetMin,
            budgetMax,
          },
        },
        assistantMessage: appendChecklistOffer(`生成耗时较长，我先为你生成一版快速行程：\n\n${summary}\n\n${fallbackDraft.overallTips ?? ""}`),
        actionLog: [
          logAction(
            state,
            "generate_itinerary",
            `fallback after abort: ${dayCount} day itinerary`,
            Date.now() - t0
          ),
        ],
      };
    }

    return {
      errors: [
        ...(state.errors ?? []),
        `generate_itinerary failed: ${errMsg}`,
      ],
      assistantMessage:
        `生成行程时遇到问题：${errMsg.slice(0, 300)}`,
      actionLog: [
        logAction(
          state,
          "generate_itinerary",
          `error: ${errMsg}`,
          Date.now() - t0
        ),
      ],
    };
  }
}

// === Node 5: revise_itinerary ===

export async function reviseItineraryNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();

  const fallbackDraft =
    state.tripId && state.versions?.length
      ? findLatestNonEmptyVersion(state.versions)
      : null;
  const current = state.itineraryDraft?.days?.length && totalActivityCount(state.itineraryDraft.days) > 0
    ? state.itineraryDraft
    : fallbackDraft && state.tripId
      ? buildDraftFromVersion(fallbackDraft, state.tripId)
      : state.itineraryDraft;
  const message = state.currentMessage?.trim() ?? "";
  if (!current?.days?.length) {
    return {
      errors: ["Cannot revise: no current itinerary"],
      assistantMessage: "当前没有可修改的行程。请先生成一份行程。",
    };
  }

  const dayIndex = parseDayIndexFromMessage(message);
  const placeToAdd = extractPlaceToAdd(message);
  if (dayIndex && placeToAdd) {
    const revised = reviseByAddingPlace(state, current, dayIndex, placeToAdd);
    if (revised) {
      return revised;
    }
  }

  if (/雨天|下雨|室内行程|备份方案/.test(message)) {
    return reviseForRainyBackup(state, current);
  }

  try {
    const prompt = REVISE_PROMPT
      .replace("{userFeedback}", state.currentMessage)
      .replace("{currentItineraryJSON}", JSON.stringify(current, null, 2));

    const parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content:
            "你是旅行行程编辑。精确应用用户要求的修改。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.2, maxTokens: 4096 }
    );

    const validated = validateWithSchema(
      ReviseItineraryResultSchema,
      parsed,
      "revise_itinerary"
    );

    // Convert to Day[]
    const days: Day[] = validated.days.map((d) => ({
      id: `${state.threadId}-day-${d.dayIndex}-v${(state.currentVersionNumber ?? 0) + 1}`,
      tripId: state.tripId ?? "",
      dayIndex: d.dayIndex,
      date: d.date,
      activities: d.activities.map((a) => ({
        id: `${state.threadId}-act-${d.dayIndex}-${a.order}-${Date.now()}`,
        dayId: `${state.threadId}-day-${d.dayIndex}`,
        order: a.order,
        type: normalizeGeneratedActivityType(a.type),
        poi: null,
        customName: a.name,
        startTime: a.startTime,
        endTime: a.endTime,
        durationMinutes: a.durationMinutes,
        estimatedCost: a.estimatedCost,
        notes: a.notes,
        sourceReason: a.sourceReason,
        bookingRequired: a.bookingRequired,
        openingHours: a.openingHours,
        recommendedDuration: a.recommendedDuration,
        weatherFit: normalizeWeatherFit(a.weatherFit),
        ticketReference: a.ticketReference ?? undefined,
        travelMinutesFromPrev: a.travelMinutesFromPrev,
        isGenerated: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      notes: d.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    return {
      itineraryDraft: {
        days,
        overallTips: validated.overallTips ?? current.overallTips,
        budgetSummary: current.budgetSummary,
      },
      assistantMessage: `已根据你的反馈修改行程：\n${validated.changeDescription}`,
      actionLog: [
        logAction(
          state,
          "revise_itinerary",
          `revised: ${validated.changeDescription}`,
          Date.now() - t0
        ),
      ],
    };
  } catch (err) {
    return {
      errors: [
        ...(state.errors ?? []),
        `revise_itinerary failed: ${(err as Error).message}`,
      ],
      assistantMessage: "修改行程时出现问题，我先没动原计划。你可以继续说得更具体一点，比如“第二天加一个室内景点”或“把某个地点放到第一天下午”。",
      actionLog: [
        logAction(
          state,
          "revise_itinerary",
          `error: ${(err as Error).message}`,
          Date.now() - t0
        ),
      ],
    };
  }
}

// === Node 5.5: normalize_activities (standardize LLM output → system format) ===

export async function normalizeActivitiesNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const draft = state.itineraryDraft;
  const reqs = state.parsedTripRequirements;

  if (!draft?.days?.length) {
    return {};
  }

  const destination = state.trip?.destination ?? reqs?.destination ?? "";
  const startDate = state.trip?.startDate ?? reqs?.startDate ?? new Date().toISOString().slice(0, 10);
  const endDate = state.trip?.endDate ?? reqs?.endDate ?? startDate;
  const dayCount = draft.days.length;

  try {
    const prompt = NORMALIZE_ACTIVITIES_PROMPT
      .replace("{destination}", destination)
      .replace("{startDate}", startDate)
      .replace("{endDate}", endDate)
      .replace("{dayCount}", String(dayCount))
      .replace("{tripId}", state.tripId || "unknown")
      .replace("{itineraryJSON}", JSON.stringify(draft, null, 2));

    const parsed = await deepseekClient.generateJson(
      [
        { role: "system", content: "你是行程数据标准化器。只输出合法JSON。" },
        { role: "user", content: prompt },
      ],
      { temperature: 0.1, maxTokens: 2048, signal: boundedTimeoutSignal(state, 8000, 2500) }
    );

    const v = validateWithSchema(NormalizeActivitiesResultSchema, parsed, "normalize");

    // Group activities by dayIndex
    const dayMap = new Map<number, typeof v.activities>();
    for (const a of v.activities) {
      if (!dayMap.has(a.dayIndex)) dayMap.set(a.dayIndex, []);
      dayMap.get(a.dayIndex)!.push(a);
    }

    // Convert to Day[] format
    const days: Day[] = [];
    for (const [dayIndex, activities] of dayMap) {
      days.push({
        id: `${state.threadId}-day-${dayIndex}`,
        tripId: state.tripId ?? "",
        dayIndex,
        date: activities[0]?.date ?? "",
        activities: activities.sort((a, b) => a.order - b.order).map((a) => ({
          id: a.id,
          dayId: `${state.threadId}-day-${dayIndex}`,
          order: a.order,
          type: a.type,
          poi: null,
          customName: a.name,
          startTime: a.startTime,
          endTime: a.endTime,
          durationMinutes: a.durationMinutes,
          estimatedCost: a.estimatedCost,
          notes: a.notes,
          sourceReason: a.notes,
          openingHours: undefined,
          recommendedDuration: a.durationMinutes,
          travelMinutesFromPrev: undefined,
          bookingRequired: /预约|预定/.test(a.notes),
          weatherFit: /雨|室内/.test(a.notes) ? "rainy" : "any",
          ticketReference: undefined,
          isGenerated: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
        notes: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const optimizedDays = await attachKnownPoiAndOptimizeRoutes(
      days,
      state.selectedSavedPlaces?.length
        ? state.selectedSavedPlaces
        : state.savedPlaceCandidates ?? [],
      state.confirmedPlaces ?? []
    );

    return {
      itineraryDraft: { ...draft, days: optimizedDays },
      actionLog: [logAction(state, "normalize_activities", `${v.activities.length} activities normalized`, Date.now() - t0)],
    };
  } catch (err) {
    // Normalization failed — keep original itinerary
    return {
      actionLog: [logAction(state, "normalize_activities", `skipped: ${(err as Error).message}`, Date.now() - t0)],
    };
  }
}

// === Node 6: save_version ===

export async function saveVersionNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const draft = state.itineraryDraft;

  if (!draft?.days?.length) {
    return {};
  }

  if (!state.tripId) {
    return {
      actionLog: [logAction(state, "save_version", "skipped: no tripId", Date.now() - t0)],
    };
  }

  const newVersionNumber = (state.currentVersionNumber ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const currentVersion = (state.versions ?? []).find((version) => version.isCurrent);
  const draftActivityCount = totalActivityCount(draft.days);
  const historicalActivityCount = state.versions?.reduce(
    (sum, version) => sum + version.days.reduce((daySum, day) => daySum + day.activities.length, 0),
    0
  ) ?? 0;

  if (draftActivityCount === 0 && historicalActivityCount > 0) {
    return {
      errors: [...(state.errors ?? []), "save_version skipped: empty itinerary draft"],
      assistantMessage: "这次修改没有形成有效行程，我先保留了原来的安排，没有覆盖你的行程数据。",
      actionLog: [
        logAction(state, "save_version", "skipped empty itinerary draft", Date.now() - t0),
      ],
    };
  }

  const version: ItineraryVersion = {
    id: versionId,
    versionId,
    tripId: state.tripId,
    versionNumber: newVersionNumber,
    days: draft.days.map((d) => ({
      dayIndex: d.dayIndex,
      date: d.date,
      activities: d.activities.map((a) => ({
        order: a.order,
        type: a.type,
        name: a.customName ?? a.poi?.name ?? "未命名",
        startTime: a.startTime,
        endTime: a.endTime,
        durationMinutes: a.durationMinutes,
        estimatedCost: a.estimatedCost,
        notes: a.notes,
      })),
    })),
    changeDescription:
      newVersionNumber === 1
        ? "初始行程生成"
        : state.currentMessage?.slice(0, 100) ?? "修改行程",
    parentVersionId: currentVersion?.versionId,
    isCurrent: true,
    createdAt: new Date().toISOString(),
  };

  // Mark previous versions as not current
  const prevVersions = await db.query<ItineraryVersion>(
    "itinerary_versions",
    (v) => v.tripId === state.tripId && v.isCurrent
  );
  for (const pv of prevVersions) {
    await db.put("itinerary_versions", { ...pv, isCurrent: false });
  }

  // Save new version
  await db.put("itinerary_versions", version);

  // === Write generated itinerary back to the Trip and normalized day/activity tables ===
  let tripUpdated = false;
  let tripUpdateErrorMessage: string | null = null;
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const { data: existingDays } = await supabase
      .from("days")
      .select("id")
      .eq("trip_id", state.tripId);

    const existingDayIds = (existingDays ?? []).map((day) => String(day.id));
    if (existingDayIds.length > 0) {
      await supabase.from("activities").delete().in("day_id", existingDayIds);
      await supabase.from("days").delete().eq("trip_id", state.tripId);
    }

    const dayIdMap = new Map<number, string>();
    const dayRows = draft.days.map((day) => {
      const dayId = crypto.randomUUID();
      dayIdMap.set(day.dayIndex, dayId);
      return {
        id: dayId,
        trip_id: state.tripId,
        day_index: day.dayIndex,
        date: day.date,
        notes: day.notes || "",
      };
    });

    if (dayRows.length > 0) {
      const { error: dayInsertError } = await supabase.from("days").insert(dayRows);
      if (dayInsertError) throw dayInsertError;
    }

    const activityRows = draft.days.flatMap((day) =>
      day.activities.map((activity) => ({
        id: crypto.randomUUID(),
        day_id: dayIdMap.get(day.dayIndex),
        order: activity.order,
        type: activity.type,
        poi_id: activity.poi?.amapId || null,
        poi_name: activity.customName || activity.poi?.name || "",
        poi_address: activity.poi?.address || "",
        poi_lat: activity.poi?.coordinate?.lat ?? null,
        poi_lng: activity.poi?.coordinate?.lng ?? null,
        start_time: activity.startTime || "",
        end_time: activity.endTime || "",
        duration_minutes: activity.durationMinutes ?? 60,
        estimated_cost: activity.estimatedCost ?? 0,
        notes: activity.notes || "",
        source_reason: activity.sourceReason || "",
        opening_hours: activity.openingHours || "",
        recommended_duration: activity.recommendedDuration ?? activity.durationMinutes ?? 60,
        travel_minutes_from_prev: activity.travelMinutesFromPrev ?? null,
        booking_required: activity.bookingRequired ?? false,
        weather_fit: activity.weatherFit || "any",
        ticket_reference: activity.ticketReference || "",
        is_generated: true,
      }))
    );

    if (activityRows.length > 0) {
      const { error: actInsertError } = await supabase.from("activities").insert(activityRows);
      if (actInsertError) {
        const fallbackRows = activityRows.map((row) => ({
          id: row.id,
          day_id: row.day_id,
          order: row.order,
          type: row.type,
          poi_name: row.poi_name,
          start_time: row.start_time,
          end_time: row.end_time,
          duration_minutes: row.duration_minutes,
          estimated_cost: row.estimated_cost,
          notes: row.notes,
          source_reason: row.source_reason,
          is_generated: row.is_generated,
        }));
        const { error: fallbackError } = await supabase.from("activities").insert(fallbackRows);
        if (fallbackError) throw fallbackError;
      }
    }

    const { error: tripUpdateError } = await supabase
      .from("trips")
      .update({
        status: "generated",
        updated_at: now,
      })
      .eq("id", state.tripId);

    if (tripUpdateError) throw tripUpdateError;
    tripUpdated = true;
  } catch (err) {
    tripUpdateErrorMessage = (err as Error).message;
  }

  const allVersions = [...(state.versions ?? []), version];
  const summaryMessage = state.assistantMessage?.trim();

  return {
    versions: allVersions,
    currentVersionNumber: newVersionNumber,
    errors: tripUpdateErrorMessage
      ? [...(state.errors ?? []), `save_version trip sync failed: ${tripUpdateErrorMessage}`]
      : state.errors,
    assistantMessage: summaryMessage || (tripUpdated
      ? "已经帮你更新好了，这份行程现在就是最新版本。"
      : "已经帮你保存这次调整。"),
    actionLog: [
      logAction(
        state,
        "save_version",
        `saved v${newVersionNumber}${tripUpdated ? ", trip updated" : ""}`,
        Date.now() - t0
      ),
    ],
  };
}

// === Node 7: ask_follow_up ===

export async function askFollowUpNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();

  // Determine what's missing
  const missing: string[] = [];
  if (!state.trip) {
    if (!state.parsedTripRequirements?.destination) {
      missing.push("destination");
    }
    if (
      !state.parsedTripRequirements?.startDate ||
      !state.parsedTripRequirements?.endDate
    ) {
      missing.push("dates");
    }
  }

  if (missing.length === 0) {
    return {
      assistantMessage:
        "我能帮你做什么？可以粘贴你正在路上的地点，或者告诉我你的旅行需求。",
    };
  }

  try {
    const prompt = ASK_FOLLOWUP_PROMPT
      .replace("{missingInfo}", missing.join(", "))
      .replace("{userMessage}", buildConversationContext(state));

    const parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content:
            "你为旅行规划助手生成友好的追问问题。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, maxTokens: 512 }
    );

    const validated = validateWithSchema(
      MissingInfoResponseSchema,
      parsed,
      "ask_followup"
    );

    const questions = validated.questions
      .map((q) => `- ${q.question}\n  例如：${q.example ?? ""}`)
      .join("\n\n");

    return {
      missingInfo: missing,
      assistantMessage: `我需要了解更多信息才能帮你规划：\n\n${questions}`,
      actionLog: [
        logAction(
          state,
          "ask_follow_up",
          `missing: ${missing.join(", ")}`,
          Date.now() - t0
        ),
      ],
    };
  } catch {
    // Fallback: simple questions
    const questions = missing
      .map((m) => {
        switch (m) {
          case "destination":
            return "- 你正在路上哪里旅行？";
          case "dates":
            return "- 计划哪几天出发？";
          default:
            return `- 请提供更多关于${m}的信息`;
        }
      })
      .join("\n");

    return {
      missingInfo: missing,
      assistantMessage: `我需要了解更多信息：\n\n${questions}`,
    };
  }
}

// === Node 8: confirm_places (Phase 2: Human-in-the-loop) ===

export async function confirmPlacesNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const parsed = state.parsedPlaces ?? [];
  const confirmed = state.confirmedPlaces ?? [];

  // If already confirmed (resumed after user approval), pass through
  if (confirmed.length > 0) {
    return {
      needsHumanConfirmation: false,
      actionLog: [
        logAction(
          state,
          "confirm_places",
          `${confirmed.length} places confirmed`,
          Date.now() - t0
        ),
      ],
    };
  }

  // If no places to confirm, skip
  if (parsed.length === 0) {
    return {
      needsHumanConfirmation: false,
    };
  }

  // Set checkpoint: needs user confirmation
  const placeList = parsed
    .map(
      (p) =>
        `- ${p.priority === "must_go" ? "⭐" : "  "} ${p.name} (${p.category})${p.notes ? ` — ${p.notes}` : ""}`
    )
    .join("\n");

  return {
    needsHumanConfirmation: true,
    pendingConfirmationType: "places",
    pendingMessage: `请确认以下 ${parsed.length} 个地点：\n\n${placeList}\n\n你可以删除不需要的地点，或修改信息后确认。`,
    actionLog: [
      logAction(
        state,
        "confirm_places",
        `awaiting confirmation for ${parsed.length} places`,
        Date.now() - t0
      ),
    ],
  };
}

// === Node 9: critique_itinerary (Phase 2: itinerary health check) ===

export async function critiqueItineraryNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const draft = state.itineraryDraft;

  if (!draft?.days?.length) {
    return {}; // skip silently, generate step already logged the error
  }

  try {
    const candidateContext = (state.savedPlaceCandidates ?? [])
      .slice(0, 8)
      .map((candidate) => {
        const pieces = [
          candidate.name,
          candidate.reason,
          candidate.openingHours ? `开放时间:${candidate.openingHours}` : "",
          candidate.ticketReference ? `价格:${candidate.ticketReference}` : "",
        ].filter(Boolean);
        return `- ${pieces.join(" | ")}`;
      })
      .join("\n");

    const prompt = CRITIQUE_PROMPT
      .replace("{candidateContext}", candidateContext || "无候选地点上下文")
      .replace("{enrichedContext}", candidateContext || "无实时数据")
      .replace("{itineraryJSON}", JSON.stringify(draft, null, 2));

    const parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content:
            "你是旅行质量审核员。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, maxTokens: 768, signal: boundedTimeoutSignal(state, 8000, 2500) }
    );

    const validated = validateWithSchema(
      CritiqueResultSchema,
      parsed,
      "critique_itinerary"
    );

    const critique: CritiqueResult = {
      ...validated,
      issues: validated.issues.map((issue) => ({
        ...issue,
        activityIndex: issue.activityIndex ?? undefined,
        category:
          issue.category === "rest" || issue.category === "logistics" || issue.category === "feasibility"
            ? "other"
            : issue.category,
      })),
      analyzedAt: new Date().toISOString(),
    };

    const highIssues = critique.issues.filter(
      (i) => i.severity === "error"
    );
    const warnIssues = critique.issues.filter(
      (i) => i.severity === "warning"
    );

    let message = `行程体检完成！\n`;
    message += `整体评分：${critique.overallScore}/10\n\n`;

    if (highIssues.length > 0) {
      message += `🔴 严重问题 (${highIssues.length}个)：\n`;
      message += highIssues
        .map((i) => `  - Day ${i.dayIndex + 1}: ${i.message}\n    💡 ${i.suggestion}`)
        .join("\n");
      message += `\n\n`;
    }

    if (warnIssues.length > 0) {
      message += `🟡 注意事项 (${warnIssues.length}个)：\n`;
      message += warnIssues
        .map((i) => `  - Day ${i.dayIndex + 1}: ${i.message}\n    💡 ${i.suggestion}`)
        .join("\n");
      message += `\n\n`;
    }

    if (critique.issues.length === 0) {
      message += `✅ 没有发现问题，行程看起来很好！`;
    }

    message += critique.summary;

    return {
      critiqueResult: critique,
      assistantMessage: message,
      actionLog: [
        logAction(
          state,
          "critique_itinerary",
          `score=${critique.overallScore}, issues=${critique.issues.length}`,
          Date.now() - t0
        ),
      ],
    };
  } catch (err) {
    return {
      errors: [
        ...(state.errors ?? []),
        `critique_itinerary failed: ${(err as Error).message}`,
      ],
      assistantMessage: "行程体检时出现问题，请稍后重试。",
      actionLog: [
        logAction(
          state,
          "critique_itinerary",
          `error: ${(err as Error).message}`,
          Date.now() - t0
        ),
      ],
    };
  }
}

// === Node 10: export_itinerary (Phase 2: format export) ===

export async function exportItineraryNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const draft = state.itineraryDraft;

  if (!draft?.days?.length) {
    return {
      errors: ["Cannot export: no itinerary"],
      assistantMessage: "当前没有可导出的行程。请先生成一份行程。",
    };
  }

  let format: "friend_summary" | "detailed_plan" | "checklist" | "markdown" =
    "detailed_plan";
  const msg = state.currentMessage ?? "";
  const lastAssistantMessage = [...(state.conversationHistory ?? [])]
    .reverse()
    .find((item) => item.role === "agent")?.content ?? "";
  const isAnsweringChecklistOffer =
    /旅行必备清单|行前清单/.test(lastAssistantMessage)
    && /^(需要|要|可以|好|好的|来一份|生成|帮我生成|做一份|要的|需要的)$/.test(msg.trim());
  if (/朋友|简洁|分享给别人/.test(msg)) format = "friend_summary";
  if (/清单|checklist|准备|行李/.test(msg) || isAnsweringChecklistOffer) format = "checklist";
  if (/markdown|md|notion/.test(msg)) format = "markdown";

  const title =
    state.trip?.title || state.trip?.destination || "旅行行程";

  let content = "";
  const checklistItems: AgentExportPayload["checklistItems"] = format === "checklist"
    ? [
        { categoryId: "todo", label: "确认往返交通票据和出发到达时间" },
        { categoryId: "todo", label: "确认酒店/民宿订单和入住方式" },
        { categoryId: "todo", label: "预约或购买重点景点门票" },
        { categoryId: "todo", label: "查看目的地天气并调整穿搭" },
        { categoryId: "todo", label: "收藏行程路线，提前下载离线地图" },
        { categoryId: "documents", label: "身份证/护照等有效证件" },
        { categoryId: "documents", label: "学生证、老年证等优惠证件" },
        { categoryId: "documents", label: "酒店、交通、门票订单截图或电子凭证" },
        { categoryId: "documents", label: "少量现金和常用银行卡" },
        { categoryId: "clothing", label: "舒适好走的鞋" },
        { categoryId: "clothing", label: "换洗衣物和睡衣" },
        { categoryId: "clothing", label: "外套、防晒衣或雨具" },
        { categoryId: "clothing", label: "常用药品、纸巾和个人洗护用品" },
        { categoryId: "electronics", label: "手机和充电器" },
        { categoryId: "electronics", label: "充电宝和数据线" },
        { categoryId: "electronics", label: "耳机、相机或拍摄设备" },
      ]
    : undefined;

  if (format === "checklist") {
    for (const day of draft.days) {
      for (const activity of day.activities) {
        if (activity.notes?.includes("预约") || activity.notes?.includes("票")) {
          checklistItems?.push({
            categoryId: "todo",
            label: `${activity.customName ?? "行程活动"}：${activity.notes}`,
          });
        }
      }
    }
  }

  switch (format) {
    case "friend_summary": {
      content = `## ${title} 简要行程\n\n`;
      for (const day of draft.days) {
        content += `### Day ${day.dayIndex}\n`;
        for (const a of day.activities) {
          content += `- ${a.startTime ?? ""} ${a.customName ?? "未命名"}\n`;
        }
        content += `\n`;
      }
      if (draft.overallTips) content += `### 小贴士\n${draft.overallTips}\n`;
      break;
    }
    case "checklist": {
      const categoryTitles = {
        todo: "待办事项",
        documents: "重要证件",
        clothing: "衣物穿搭",
        electronics: "数码电子",
      };
      content = `## ${title} 旅行必备清单\n\n`;
      for (const categoryId of ["todo", "documents", "clothing", "electronics"] as const) {
        const categoryItems = checklistItems?.filter((item) => item.categoryId === categoryId) ?? [];
        content += `### ${categoryTitles[categoryId]}\n`;
        for (const item of categoryItems) {
          content += `- [ ] ${item.label}\n`;
        }
        content += "\n";
      }
      break;
    }
    case "markdown":
    case "detailed_plan":
    default: {
      content = `# ${title}\n\n`;
      if (draft.overallTips) content += `> ${draft.overallTips}\n\n`;
      for (const day of draft.days) {
        content += `## Day ${day.dayIndex} — ${day.date}\n\n`;
        content += `| 时间 | 活动 | 类型 | 时长 | 预算 |\n|------|------|------|------|------|\n`;
        for (const a of day.activities) {
          content += `| ${a.startTime ?? "-"} | ${a.customName ?? "未命名"} | ${a.type} | ${a.durationMinutes ?? "-"}min | ¥${a.estimatedCost ?? 0} |\n`;
        }
        content += `\n`;
        if (day.notes) content += `${day.notes}\n\n`;
      }
      break;
    }
  }

  return {
    responsePayload: {
      format,
      content,
      title,
      tripId: state.tripId ?? state.trip?.id,
      checklistItems,
    },
    assistantMessage: format === "checklist"
      ? "已生成旅行必备清单，并写入到对应行程详情页的“旅行清单”里。"
      : `已导出为 ${format === "friend_summary" ? "简洁版" : "详细行程"}`,
    actionLog: [
      logAction(state, "export_itinerary", `format=${format}`, Date.now() - t0),
    ],
  };
}

// === Node 11: parse_trip (Phase 3: NL → structured trip, with multi-turn memory) ===

export async function parseTripNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const msg = state.currentMessage;
  const existing = state.parsedTripRequirements;
  const history = (state.conversationHistory ?? [])
    .slice(-20)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");

  if (!msg || msg.trim().length < 1) {
    return { missingInfo: ["origin", "destination", "dates"], assistantMessage: "请告诉我从哪里出发、要去哪里旅行、计划几天？" };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Build an explicit prompt that separates "already known" from "new message"
    const existingStr = existing?.destination
      ? `\n\n【已提取的信息（来自之前的对话）】\n- 出发地：${existing.origin ?? "未知"}\n- 目的地：${existing.destination ?? "未知"}\n- 日期：${existing.startDate ?? "?"} 至 ${existing.endDate ?? "?"}\n- 天数：${existing.dayCount ?? "?"}\n- 人数：${existing.travelers?.adults ?? "?"}成人${existing.travelers?.children ? ` +${existing.travelers.children}儿童` : ""}\n- 预算：${existing.budget ? `¥${existing.budget.min}-${existing.budget.max}` : "?"}\n- 偏好：${existing.preferences?.join("、") ?? "?"}\n\n请根据用户最新消息更新/补完以上信息，不要丢失已有字段。`
      : "";

    const prompt = PARSE_TRIP_PROMPT
      .replace("{userMessage}", msg)
      .replace("{currentDate}", today)
      .replace("{conversationHistory}", history || "（首轮对话）")
      .replace("{existingRequirements}", existingStr);

    const parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content: "你是旅行需求解析器。结合对话历史和已提取信息，从用户最新消息中增量补完旅行需求。已有字段保留，缺失字段从消息提取。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.2, maxTokens: 1024 }
    );

    const v = validateWithSchema(ParseTripResultSchema, parsed, "parse_trip");
    const transportRequest = parseTransportRequest(buildConversationContext(state));
    const travelersFromLatestMessage = hasExplicitTravelerCount(msg);
    const nextTravelers = travelersFromLatestMessage
      ? v.travelers || existing?.travelers
      : existing?.travelers;
    const budgetFromLatestMessage = parseBudgetFromMessage(msg);

    // Merge with existing requirements (latest values win)
    const merged = {
      origin: v.origin || transportRequest?.origin || existing?.origin,
      destination: v.destination || transportRequest?.destination || existing?.destination,
      startDate: v.startDate || (transportRequest?.departDate ? normalizeTransportDate(transportRequest.departDate) : undefined) || existing?.startDate,
      endDate: v.endDate || (transportRequest?.returnDate ? normalizeTransportDate(transportRequest.returnDate) : undefined) || existing?.endDate,
      dayCount: v.dayCount ?? existing?.dayCount,
      travelers: nextTravelers,
      budget: budgetFromLatestMessage ?? normalizeParsedBudget(v.budget, existing?.budget),
      preferences: v.preferences || existing?.preferences,
    };

    const missing = v.missingInfo ?? [];
    if (!merged.origin) missing.push("origin");
    if (!merged.destination) missing.push("destination");
    if (!merged.startDate && !merged.dayCount) {
      if (!missing.includes("dates")) missing.push("dates");
    }
    // Remove dates from missing if dayCount is known
    if (merged.dayCount && missing.includes("dates")) {
      missing.splice(missing.indexOf("dates"), 1);
    }
    if (!merged.travelers && !missing.includes("travelers")) {
      missing.push("travelers");
    }
    if (merged.budget && missing.includes("budget")) {
      missing.splice(missing.indexOf("budget"), 1);
    }

    return {
      parsedTripRequirements: merged,
      missingInfo: [...new Set(missing)],
      assistantMessage: "",
      actionLog: [logAction(state, "parse_trip", `route=${merged.origin ?? "?"}->${merged.destination ?? "?"}, missing=${missing.join(",")}`, Date.now() - t0)],
    };
  } catch (err) {
    return {
      errors: [...(state.errors ?? []), `parse_trip: ${(err as Error).message}`],
      missingInfo: ["origin", "destination", "dates"],
      assistantMessage: "抱歉，没能提取到信息。请直接告诉我出发地、目的地、日期或天数。",
    };
  }
}

// === Node 12: collect_missing_info (Phase 3: smart follow-up) ===

export async function collectMissingInfoNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const missing = state.missingInfo ?? [];
  const parsed = state.parsedTripRequirements;

  // Filter out fields that are already satisfied
  const reallyMissing = missing.filter((m) => {
    if (m === "origin" && parsed?.origin) return false;
    if ((m === "dates" || m === "startDate" || m === "endDate") && parsed?.dayCount) return false;
    if ((m === "travelers" || m === "adults") && parsed?.travelers?.adults) return false;
    if (m === "budget" && parsed?.budget) return false;
    if (m === "preferences" && parsed?.preferences?.length) return false;
    if (m === "destination" && parsed?.destination) return false;
    if (m === "dayCount" && parsed?.dayCount) return false;
    return true;
  });

  // Required fields: origin, destination, dayCount/dates, preferences
  // Optional fields: travelers, budget (don't block flow)
  const essentialMissing = reallyMissing.filter((m) =>
    m === "origin" || m === "destination" || m === "dates" || m === "startDate" || m === "dayCount" || m === "preferences"
  );

  // If dayCount is known but dates/startDate is missing, it's not essential
  const hasEssential = parsed?.origin
    && parsed?.destination
    && (parsed?.dayCount || (parsed?.startDate && parsed?.endDate))
    && parsed?.preferences?.length
    && essentialMissing.filter(m => m !== "dates" || !parsed?.dayCount).length === 0;

  // User clicked "继续修改" — force re-show the form
  const isEditRequest = /^修改信息$|^继续修改$/.test(state.currentMessage ?? "");
  const isFormSubmit = /^(补充信息|确认信息)[:：]/.test(state.currentMessage ?? "");
  const wantsGeneration = /直接|开始|生成|规划|安排|帮我/.test(state.currentMessage ?? "");
  const questionLabels: Record<string, string> = {
    origin: "从哪里出发？",
    destination: "想去哪里？",
    startDate: "什么时候出发？",
    endDate: "什么时候返回？",
    dayCount: "计划玩几天？",
    travelers: "几个人一起去？",
    preferences: "有什么旅行偏好？",
    budget: "预算大概多少？",
  };
  const optionSets: Record<string, string[]> = {
    origin: ["北京", "上海", "广州"],
    destination: ["北京", "上海", "成都"],
    startDate: [],
    endDate: [],
    dayCount: ["3天", "5天", "7天"],
    travelers: ["1人", "2人", "一家人"],
    preferences: ["美食探索", "自然风光", "历史文化"],
    budget: ["¥3000以下", "¥3000-8000", "¥8000以上"],
  };
  const currentValue = (field: string) => {
    if (field === "origin") return parsed?.origin ?? "";
    if (field === "destination") return parsed?.destination ?? "";
    if (field === "startDate") return parsed?.startDate ?? "";
    if (field === "endDate") return parsed?.endDate ?? "";
    if (field === "dayCount") return parsed?.dayCount ? `${parsed.dayCount}天` : "";
    if (field === "travelers") {
      const adults = parsed?.travelers?.adults;
      const children = parsed?.travelers?.children ?? 0;
      if (!adults) return "";
      return children ? `${adults}成人 + ${children}儿童` : `${adults}人`;
    }
    if (field === "preferences") return parsed?.preferences?.join("、") ?? "";
    if (field === "budget") {
      if (typeof parsed?.budget?.min === "number" && typeof parsed?.budget?.max === "number") {
        return parsed.budget.min <= 0 ? `¥${parsed.budget.max}以下` : `¥${parsed.budget.min}-${parsed.budget.max}`;
      }
      if (typeof parsed?.budget?.min === "number") return `¥${parsed.budget.min}以上`;
      return "";
    }
    return "";
  };
  const buildFormItems = (fields: string[], includeValues = false) => fields.map((field, idx) => ({
    field,
    index: idx + 1,
    question: questionLabels[field] || `请提供${field}`,
    options: optionSets[field] || [],
    value: includeValues ? currentValue(field) : "",
  }));

  if (hasEssential && !isEditRequest && (isFormSubmit || wantsGeneration)) {
    const continuationLog = isFormSubmit
      ? "form submitted, continue planning"
      : "direct generation, continue planning";
    return {
      missingInfo: [...reallyMissing],
      assistantMessage: "",
      responsePayload: undefined,
      actionLog: [logAction(state, "collect_missing_info", continuationLog, Date.now() - t0)],
    };
  }

  // Priority order: origin → destination → dayCount → travelers → preferences → budget
  const priorityOrder = ["origin", "destination", "dayCount", "travelers", "preferences", "budget"];
  const normalized = new Set<string>();
  for (const m of reallyMissing) {
    if (m === "startDate" || m === "endDate" || m === "dayCount" || m === "dates") {
      if (!parsed?.startDate && !parsed?.dayCount) normalized.add("dayCount");
    } else if (m === "adults" || m === "children" || m === "travelers") {
      if (!parsed?.travelers?.adults) normalized.add("travelers");
    } else if (m === "budgetMin" || m === "budgetMax" || m === "budget") {
      if (!parsed?.budget) normalized.add("budget");
    } else if (m === "origin") {
      if (!parsed?.origin) normalized.add("origin");
    } else if (m === "destination") {
      if (!parsed?.destination) normalized.add("destination");
    } else if (m === "preferences") {
      if (!parsed?.preferences?.length) normalized.add("preferences");
    } else {
      normalized.add(m);
    }
  }
  // Sort by priority
  const sorted = [...normalized].sort((a, b) => {
    const ia = priorityOrder.indexOf(a);
    const ib = priorityOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const questionCardFields = [
    "origin",
    "destination",
    "startDate",
    "endDate",
    "dayCount",
    "travelers",
    "preferences",
    "budget",
  ];

  const formItems = buildFormItems(questionCardFields, true);

  const summary = isEditRequest
    ? "请修改以下信息"
    : parsed?.destination
      ? `已识别：${parsed.origin ? `${parsed.origin} → ` : ""}${parsed.destination}${parsed.dayCount ? ` · ${parsed.dayCount}天` : ""}${parsed.travelers?.adults ? ` · ${parsed.travelers.adults}人` : ""}${parsed.preferences?.length ? ` · ${parsed.preferences.join("、")}` : ""}。请补充缺失信息。`
      : "";

  return {
    missingInfo: [...reallyMissing],
    responsePayload: { type: "question_card", formItems, summary },
    assistantMessage: "",
    actionLog: [logAction(state, "collect_missing_info", `form: ${sorted.join(",")}`, Date.now() - t0)],
  };
}

// === Node 13: create_trip (auto-create Trip in DB, show card) ===

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

function buildLocalTripFromDraft({
  tripId,
  userId,
  title,
  destination,
  startDate,
  endDate,
  dayCount,
  state,
}: {
  tripId: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  state: TravelAgentState;
}): Trip {
  const now = new Date().toISOString();
  const reqs = state.parsedTripRequirements;
  const draft = state.itineraryDraft;
  const days = draft?.days?.length
    ? draft.days.map((day, index) => {
        const dayId = day.id || crypto.randomUUID();
        return {
          ...day,
          id: dayId,
          tripId,
          dayIndex: typeof day.dayIndex === "number" ? day.dayIndex : index,
          date: day.date || new Date(new Date(startDate).getTime() + index * 86400000).toISOString().slice(0, 10),
          notes: day.notes || "",
          activities: (day.activities ?? []).map((activity, activityIndex) => ({
            ...activity,
            id: activity.id || crypto.randomUUID(),
            dayId,
            order: activity.order ?? activityIndex + 1,
            type: normalizeGeneratedActivityType(activity.type),
            poi: activity.poi ?? null,
            customName: activity.customName || activity.poi?.name || "",
            isGenerated: true,
            createdAt: activity.createdAt || now,
            updatedAt: activity.updatedAt || now,
          })),
          createdAt: day.createdAt || now,
          updatedAt: day.updatedAt || now,
        };
      })
    : Array.from({ length: dayCount }, (_, index) => {
        const dayId = crypto.randomUUID();
        return {
          id: dayId,
          tripId,
          dayIndex: index + 1,
          date: new Date(new Date(startDate).getTime() + index * 86400000).toISOString().slice(0, 10),
          activities: [],
          notes: "",
          createdAt: now,
          updatedAt: now,
        };
      });

  return {
    id: tripId,
    userId,
    title,
    destination,
    destinationCoord: reqs?.destinationCoord ?? { lat: 0, lng: 0 },
    startDate,
    endDate,
    travelers: {
      adults: reqs?.travelers?.adults ?? 1,
      children: reqs?.travelers?.children ?? 0,
    },
    budget: {
      currency: "CNY",
      min: reqs?.budget?.min ?? 0,
      max: reqs?.budget?.max ?? 10000,
    },
    preferences: (reqs?.preferences ?? []) as Trip["preferences"],
    days,
    status: draft?.days?.length ? "generated" : "draft",
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createTripNode(
  state: TravelAgentState
): Promise<Partial<TravelAgentState>> {
  const t0 = Date.now();
  const reqs = state.parsedTripRequirements;
  const draft = state.itineraryDraft;

  // Already has a trip → skip
  if (state.tripId && state.trip) {
    return {};
  }

  if (!reqs?.destination) {
    return { errors: ["Cannot create trip: no destination"] };
  }

  const dest = reqs.destination!;
  const title = `${dest}之旅`;
  const today = new Date().toISOString().slice(0, 10);
  const dayCount = reqs.dayCount || draft?.days?.length || 3;
  const startDate = reqs.startDate || today;
  const endDate = reqs.endDate ||
    new Date(new Date(startDate).getTime() + (dayCount - 1) * 86400000)
      .toISOString().slice(0, 10);
  const tripId = crypto.randomUUID();
  const userId = state.userId || SERVER_ANONYMOUS_USER_ID;

  try {
    const supabase = getSupabase();

    // Step 1: Create trip in Supabase
    const { error: tripError } = await supabase.from("trips").insert({
      id: tripId,
      user_id: userId,
      title,
      destination: dest,
      destination_lat: reqs.destinationCoord?.lat ?? null,
      destination_lng: reqs.destinationCoord?.lng ?? null,
      start_date: startDate,
      end_date: endDate,
      adults: reqs.travelers?.adults ?? 1,
      children: reqs.travelers?.children ?? 0,
      currency: "CNY",
      budget_min: reqs.budget?.min ?? 0,
      budget_max: reqs.budget?.max ?? 10000,
      preferences: reqs.preferences ?? [],
      status: draft?.days?.length ? "generated" : "draft",
      is_public: false,
    });

    if (tripError) throw new Error(`Trip insert failed: ${JSON.stringify(tripError)}`);

    // Step 2: If we have generated days, save them
    let savedDayCount = 0;
    let savedActivityCount = 0;

    if (draft?.days?.length) {
      const dayIdMap = new Map<number, string>();
      const dayRows = draft.days.map((day) => {
        const dayId = crypto.randomUUID();
        dayIdMap.set(day.dayIndex, dayId);
        return {
          id: dayId,
          trip_id: tripId,
          day_index: day.dayIndex,
          date: day.date || new Date(new Date(startDate).getTime() + (day.dayIndex - 1) * 86400000).toISOString().slice(0, 10),
          notes: day.notes || "",
        };
      });

      const { error: dayError } = await supabase.from("days").insert(dayRows);
      if (dayError) throw new Error(`Day insert failed: ${JSON.stringify(dayError)}`);
      savedDayCount = dayRows.length;

      const activityRows = draft.days.flatMap((day) =>
        (day.activities ?? []).map((a, index) => ({
          id: crypto.randomUUID(),
          day_id: dayIdMap.get(day.dayIndex),
          order: a.order ?? (index + 1),
          type: a.type || "attraction",
          poi_name: a.customName || a.poi?.name || "未命名",
          poi_address: a.poi?.address || "",
          poi_lat: a.poi?.coordinate?.lat ?? null,
          poi_lng: a.poi?.coordinate?.lng ?? null,
          start_time: a.startTime || "",
          end_time: a.endTime || "",
          duration_minutes: a.durationMinutes ?? 60,
          estimated_cost: a.estimatedCost ?? 0,
          notes: a.notes || "",
          source_reason: a.sourceReason || "",
          opening_hours: a.openingHours || "",
          recommended_duration: a.recommendedDuration ?? a.durationMinutes ?? 60,
          travel_minutes_from_prev: a.travelMinutesFromPrev ?? null,
          booking_required: a.bookingRequired ?? false,
          weather_fit: a.weatherFit || "any",
          ticket_reference: a.ticketReference || "",
          is_generated: true,
        }))
      );

      if (activityRows.length > 0) {
        const { error: actError } = await supabase.from("activities").insert(activityRows);
        if (actError) {
          const fallbackRows = activityRows.map((row) => ({
            id: row.id,
            day_id: row.day_id,
            order: row.order,
            type: row.type,
            poi_name: row.poi_name,
            start_time: row.start_time,
            end_time: row.end_time,
            duration_minutes: row.duration_minutes,
            estimated_cost: row.estimated_cost,
            notes: row.notes,
            source_reason: row.source_reason,
            is_generated: row.is_generated,
          }));
          const { error: fallbackError } = await supabase.from("activities").insert(fallbackRows);
          if (fallbackError) throw new Error(`Activity insert failed: ${JSON.stringify(fallbackError)}`);
        }
        savedActivityCount = activityRows.length;
      }
    }

    // Step 3: Build response card
    const travelersStr = `${reqs.travelers?.adults ?? 1}成人${reqs.travelers?.children ? ` +${reqs.travelers.children}儿童` : ""}`;
    const budgetStr = formatBudget(reqs.budget);

    const card = {
      type: "trip_card",
      tripId,
      title,
      destination: dest,
      dates: `${startDate} ~ ${endDate}`,
      dayCount,
      travelers: travelersStr,
      budget: budgetStr,
      savedDays: savedDayCount,
      savedActivities: savedActivityCount,
    };

    // Step 4: Build a minimal assistant message — trip card handles the visual display
    let msg = `已为你创建 **${title}**`;
    if (draft?.days?.length) {
      msg += `，包含 ${draft.days.length} 天行程，${draft.days.reduce((sum, d) => sum + (d.activities?.length ?? 0), 0)} 个活动`;
    }
    msg += "。点击下方卡片查看详情 →";
    if (draft?.days?.length) {
      msg = appendChecklistOffer(msg);
    }

    return {
      tripId,
      responsePayload: card,
      assistantMessage: msg,
      actionLog: [logAction(state, "create_trip", `tripId=${tripId}, days=${savedDayCount}, activities=${savedActivityCount}`, Date.now() - t0)],
    };
  } catch (err) {
    const localTrip = buildLocalTripFromDraft({
      tripId,
      userId,
      title,
      destination: dest,
      startDate,
      endDate,
      dayCount,
      state,
    });
    saveLocalTrip(localTrip);
    const savedActivityCount = localTrip.days.reduce((sum, day) => sum + day.activities.length, 0);
    const travelersStr = `${reqs.travelers?.adults ?? 1}成人${reqs.travelers?.children ? ` +${reqs.travelers.children}儿童` : ""}`;
    const card = {
      type: "trip_card",
      tripId,
      title,
      destination: dest,
      dates: `${startDate} ~ ${endDate}`,
      dayCount,
      travelers: travelersStr,
      budget: formatBudget(reqs.budget),
      savedDays: localTrip.days.length,
      savedActivities: savedActivityCount,
    };
    let msg = `已为你创建 **${title}**，包含 ${localTrip.days.length} 天行程，${savedActivityCount} 个活动。`;
    msg += "当前 Supabase 暂时连不上，我先保存到本地开发存储。点击下方卡片查看详情 →";
    if (localTrip.days.length) {
      msg = appendChecklistOffer(msg);
    }

    return {
      tripId,
      responsePayload: card,
      assistantMessage: msg,
      errors: [...(state.errors ?? []), `create_trip remote fallback: ${(err as Error).message}`],
      actionLog: [logAction(state, "create_trip", `local fallback tripId=${tripId}, days=${localTrip.days.length}, activities=${savedActivityCount}`, Date.now() - t0)],
    };
  }
}
