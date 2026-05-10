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
import type { TravelAgentState } from "./state";
import {
  IntentResultSchema,
  ParsePlacesResultSchema,
  ParseTripResultSchema,
  GenerateItineraryResultSchema,
  ReviseItineraryResultSchema,
  RecommendDestinationsResultSchema,
  MissingInfoResponseSchema,
  validateWithSchema,
} from "./schemas";
import {
  INTENT_CLASSIFY_PROMPT,
  PARSE_PLACES_PROMPT,
  PARSE_TRIP_PROMPT,
  RECOMMEND_DESTINATIONS_PROMPT,
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
import type {
  ParsedPlace,
  ItineraryVersion,
  AgentActionLogEntry,
  CritiqueResult,
} from "@/types/agent";
import type { Trip, Day, ActivityType } from "@/types/trip";

// === Helpers ===

/** Build conversation context string from history + current message */
function buildConversationContext(state: TravelAgentState): string {
  const history = (state.conversationHistory ?? [])
    .slice(-20)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");
  return history || state.currentMessage;
}

function logAction(
  state: TravelAgentState,
  nodeName: string,
  output: string,
  durationMs: number
): AgentActionLogEntry {
  return {
    id: `${state.threadId}-${nodeName}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    nodeName,
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

function normalizePlaceName(name: string) {
  return name
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .replace(/[·・,，。.\-—_]/g, "")
    .toLowerCase();
}

function extractWishlistNames(state: TravelAgentState) {
  const context = buildConversationContext(state);
  const match = context.match(/心愿地点加入行程[:：]([^\n。]+)/);
  if (!match?.[1]) return [];

  return match[1]
    .split(/[、,，]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function isWishlistActivity(activityName: string, wishlistNames: string[]) {
  const normalizedActivityName = normalizePlaceName(activityName);
  return wishlistNames.some((wishlistName) => {
    const normalizedWishlistName = normalizePlaceName(wishlistName);
    return normalizedWishlistName
      && (normalizedActivityName.includes(normalizedWishlistName)
        || normalizedWishlistName.includes(normalizedActivityName));
  });
}

function markWishlistSource(sourceReason: string | undefined) {
  const value = sourceReason ?? "";
  return value.includes("心愿地") ? value : `[心愿地]${value ? ` ${value}` : ""}`;
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
        userId: String(tripRow.user_id ?? "local-user"),
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
function detectQuickIntent(
  msg: string,
  state: TravelAgentState
): TravelAgentState["intent"] | "generalChat" {
  const text = msg.trim();
  if (!text) return "generalChat";

  const createPatterns = /想去|去.+玩|玩(?:儿)?\s*\d+\s*天|计划玩|安排.*行程|规划.*行程|做个行程|生成行程|继续帮我规划|按这个目的地继续/;
  const recommendPatterns = /推荐.*(城市|目的地|地方|国家)|适合.*(旅游|旅行|度假).*(城市|地方|国家)|去哪里玩|去哪儿玩|有什么.*目的地|想找.*旅行地/;
  const explicitTripInfoPatterns = /\d+\s*天|\d+\s*晚|预算|人均|\d+\s*人|自由行|亲子|蜜月|城市漫步|美食|海岛|避暑|打卡/;
  const placeListPatterns = /、|，|,|还有|以及|下面|收藏|笔记|景点|餐厅|咖啡|酒店|必去|想去|打卡/;
  const tripScopedAddPatterns = /第[一二三四五六七八九十0-9]+天.*(想去|加入|加上|安排)|想去.+(加进|加入|安排到).*(行程|第[一二三四五六七八九十0-9]+天)|把.+加到.+(行程|第[一二三四五六七八九十0-9]+天)/;
  const revisePatterns = /太赶|太累|太满|太多|太少|太松|松散|加(?:一)?个|添加|加入|加进|去掉|删除|换成|替换|修改|改成|轻松|放松|紧凑|充实|多玩|室内|雨天|亲子|预算低|便宜/;
  const critiquePatterns = /合理|检查|看看|顺路|绕路|可以不|会不会|怎么样|行不行|体检|评估|问题/;
  const exportPatterns = /导出|分享|发送|复制|下载|markdown|notion|清单/;
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

  if (!hasTrip && !hasParsedReqs && recommendPatterns.test(text) && !explicitTripInfoPatterns.test(text)) {
    return "recommendDestinations";
  }

  if (hasItinerary && exportPatterns.test(text)) return "exportItinerary";
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
    const prompt = RECOMMEND_DESTINATIONS_PROMPT.replace(
      "{userMessage}",
      state.currentMessage ?? ""
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

// === Node 4: generate_itinerary ===

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
      selectedSavedPlaces: result.savedPlaceCandidates,
      assistantMessage: "",
      actionLog: [
        logAction(state, "xhs_search", `xhs=${result.debug.xhsCount}`, Date.now() - t0),
        logAction(state, "web_search", `web=${result.debug.webCount}`, Date.now() - t0),
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
  const savedCandidates = (state.selectedSavedPlaces?.length
    ? state.selectedSavedPlaces
    : state.savedPlaceCandidates) ?? [];
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
      .map((p) => `- ${p.name} (${p.category}): ${p.reason}${p.openingHours ? `；开放时间参考：${p.openingHours}` : ""}`)
      .join("\n");
    optionalStr = mappedOptional
      .map((p) => `- ${p.name} (${p.category}): ${p.reason}`)
      .join("\n") || "无";
    inspirationSummary = (state.inspirationItems ?? [])
      .slice(0, 4)
      .map((item) => `- [${item.sourceType}] ${item.title}: ${item.summary.slice(0, 90)}`)
      .join("\n");
  } else if (useLLMKnowledge) {
    mustGoStr = `（用户未指定具体地点，请根据目的地"${destination}"和偏好推荐最值得去的景点、餐厅等）`;
    optionalStr = "无";
  } else {
    mustGoStr = mustGo.map((p) => `- ${p.name} (${p.category}): ${p.notes ?? ""}`).join("\n");
    optionalStr = optional.map((p) => `- ${p.name} (${p.category}): ${p.notes ?? ""}`).join("\n") || "无";
  }

  try {
    // Web search for real-time info about destination
    let enrichedContext = "";
    try {
      const destPlace = { name: destination, category: "attraction" as const, priority: "want_to_go" as const, sourceText: destination, id: "", estimatedDuration: 60 };
      const results = await searchMultiplePlaces([destPlace], 1);
      enrichedContext = buildEnrichedContext(results);
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
      .replace("{mustGoPlaces}", mustGoStr)
      .replace("{optionalPlaces}", optionalStr)
      .replace("{inspirationSummary}", inspirationSummary || "无")
      .replace("{enrichedContext}", enrichedContext || "无实时数据");

    const parsed = await deepseekClient.generateJson(
      [
        {
          role: "system",
          content:
            "你是专业旅行规划师。生成每天的行程安排，在备注中加入实用建议。绝不编造开放时间或实时数据。只输出合法JSON。",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, maxTokens: 4096 }
    );

    const validated = validateWithSchema(
      GenerateItineraryResultSchema,
      parsed,
      "generate_itinerary"
    );
    const wishlistNames = extractWishlistNames(state);

    // Convert to Day[] shape compatible with existing Trip type
    const days: Day[] = validated.days.map((d) => ({
      id: `${state.threadId}-day-${d.dayIndex}`,
      tripId: state.tripId ?? "",
      dayIndex: d.dayIndex,
      date: d.date,
      activities: d.activities.map((a) => ({
        id: `${state.threadId}-act-${d.dayIndex}-${a.order}`,
        dayId: `${state.threadId}-day-${d.dayIndex}`,
        order: a.order,
        type: a.type === "restaurant" ? "food" : a.type,
        poi: null,
        customName: a.name,
        startTime: a.startTime,
        endTime: a.endTime,
        durationMinutes: a.durationMinutes,
        estimatedCost: a.estimatedCost,
        notes: a.notes,
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

    const summary = validated.days
      .map((d) => `Day ${d.dayIndex}: ${d.theme ?? ""} (${d.activities.length}个活动)`)
      .join("\n");

    return {
      itineraryDraft: {
        days,
        overallTips: validated.overallTips,
        budgetSummary: validated.budgetSummary,
      },
      assistantMessage: `已为你生成 ${dayCount} 天的行程：\n\n${summary}\n\n${validated.overallTips ?? ""}`,
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
        type: a.type === "restaurant" ? "food" : a.type,
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
      { temperature: 0.1, maxTokens: 4096 }
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

    return {
      itineraryDraft: { ...draft, days },
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
      { temperature: 0.3, maxTokens: 1024 }
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
  if (/朋友|简洁|分享给别人/.test(msg)) format = "friend_summary";
  if (/清单|checklist|准备|行李/.test(msg)) format = "checklist";
  if (/markdown|md|notion/.test(msg)) format = "markdown";

  const title =
    state.trip?.title || state.trip?.destination || "旅行行程";

  let content = "";
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
      content = `## ${title} 行前清单\n\n### 预约/购票\n`;
      for (const day of draft.days) {
        for (const a of day.activities) {
          if (a.notes?.includes("预约") || a.notes?.includes("票")) {
            content += `- [ ] ${a.customName} — ${a.notes}\n`;
          }
        }
      }
      content += `\n### 每日准备\n`;
      for (const day of draft.days) {
        content += `- [ ] Day ${day.dayIndex}: ${day.activities.length}个活动\n`;
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
    responsePayload: { format, content, title },
    assistantMessage: `已导出为 ${format === "friend_summary" ? "简洁版" : format === "checklist" ? "行前清单" : "详细行程"}`,
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
    return { missingInfo: ["destination", "dates"], assistantMessage: "请告诉我你正在路上哪里旅行，计划几天？" };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Build an explicit prompt that separates "already known" from "new message"
    const existingStr = existing?.destination
      ? `\n\n【已提取的信息（来自之前的对话）】\n- 目的地：${existing.destination ?? "未知"}\n- 日期：${existing.startDate ?? "?"} 至 ${existing.endDate ?? "?"}\n- 天数：${existing.dayCount ?? "?"}\n- 人数：${existing.travelers?.adults ?? "?"}成人${existing.travelers?.children ? ` +${existing.travelers.children}儿童` : ""}\n- 预算：${existing.budget ? `¥${existing.budget.min}-${existing.budget.max}` : "?"}\n- 偏好：${existing.preferences?.join("、") ?? "?"}\n\n请根据用户最新消息更新/补完以上信息，不要丢失已有字段。`
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

    // Merge with existing requirements (latest values win)
    const merged = {
      destination: v.destination || existing?.destination,
      startDate: v.startDate || existing?.startDate,
      endDate: v.endDate || existing?.endDate,
      dayCount: v.dayCount ?? existing?.dayCount,
      travelers: v.travelers || existing?.travelers,
      budget: v.budget || existing?.budget,
      preferences: v.preferences || existing?.preferences,
    };

    const missing = v.missingInfo ?? [];
    if (!merged.destination) missing.push("destination");
    if (!merged.startDate && !merged.dayCount) {
      if (!missing.includes("dates")) missing.push("dates");
    }
    // Remove dates from missing if dayCount is known
    if (merged.dayCount && missing.includes("dates")) {
      missing.splice(missing.indexOf("dates"), 1);
    }

    return {
      parsedTripRequirements: merged,
      missingInfo: [...new Set(missing)],
      assistantMessage: "",
      actionLog: [logAction(state, "parse_trip", `dest=${merged.destination}, missing=${missing.join(",")}`, Date.now() - t0)],
    };
  } catch (err) {
    return {
      errors: [...(state.errors ?? []), `parse_trip: ${(err as Error).message}`],
      missingInfo: ["destination", "dates"],
      assistantMessage: "抱歉，没能提取到信息。请直接告诉我目的地、日期、天数。",
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
    if ((m === "dates" || m === "startDate") && parsed?.dayCount) return false;
    if ((m === "travelers" || m === "adults") && parsed?.travelers?.adults) return false;
    if (m === "budget" && parsed?.budget) return false;
    if (m === "preferences" && parsed?.preferences?.length) return false;
    if (m === "destination" && parsed?.destination) return false;
    if (m === "dayCount" && parsed?.dayCount) return false;
    return true;
  });

  // Required fields: destination, dayCount/dates, preferences
  // Optional fields: travelers, budget (don't block flow)
  const essentialMissing = reallyMissing.filter((m) =>
    m === "destination" || m === "dates" || m === "startDate" || m === "dayCount" || m === "preferences"
  );

  // If dayCount is known but dates/startDate is missing, it's not essential
  const hasEssential = parsed?.destination
    && (parsed?.dayCount || (parsed?.startDate && parsed?.endDate))
    && parsed?.preferences?.length
    && essentialMissing.filter(m => m !== "dates" || !parsed?.dayCount).length === 0;

  // User clicked "继续修改" — force re-show the form
  const isEditRequest = /^修改信息$|^继续修改$/.test(state.currentMessage ?? "");
  const isFormSubmit = /^(补充信息|确认信息)[:：]/.test(state.currentMessage ?? "");
  const questionLabels: Record<string, string> = {
    destination: "正在路上哪个城市或国家？",
    dayCount: "计划玩几天？",
    travelers: "几个人一起去？",
    preferences: "有什么旅行偏好？",
    budget: "预算大概多少？",
  };
  const optionSets: Record<string, string[]> = {
    destination: ["北京", "上海", "成都"],
    dayCount: ["3天", "5天", "7天"],
    travelers: ["1人", "2人", "一家人"],
    preferences: ["美食探索", "自然风光", "历史文化"],
    budget: ["¥3000以下", "¥3000-8000", "¥8000以上"],
  };
  const currentValue = (field: string) => {
    if (field === "destination") return parsed?.destination ?? "";
    if (field === "dayCount") return parsed?.dayCount ? `${parsed.dayCount}天` : "";
    if (field === "travelers") {
      const adults = parsed?.travelers?.adults;
      const children = parsed?.travelers?.children ?? 0;
      if (!adults) return "";
      return children ? `${adults}成人 + ${children}儿童` : `${adults}人`;
    }
    if (field === "preferences") return parsed?.preferences?.join("、") ?? "";
    if (field === "budget") {
      if (parsed?.budget?.min && parsed?.budget?.max) return `¥${parsed.budget.min}-${parsed.budget.max}`;
      if (parsed?.budget?.min) return `¥${parsed.budget.min}以上`;
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

  if (hasEssential && !isEditRequest && isFormSubmit) {
    // All required info gathered — show detailed confirmation card
    const dest = parsed?.destination || "";
    const dayCount = parsed?.dayCount ?? 0;
    const startDate = parsed?.startDate || new Date().toISOString().slice(0, 10);
    const endDate = parsed?.endDate ||
      new Date(new Date(startDate).getTime() + (dayCount - 1) * 86400000)
        .toISOString().slice(0, 10);
    const adults = parsed?.travelers?.adults ?? 1;
    const children = parsed?.travelers?.children ?? 0;
    const travelersStr = `${adults}成人${children ? ` +${children}儿童` : ""}`;
    const prefsStr = parsed?.preferences?.length ? parsed.preferences.join("、") : "无";
    const budgetStr = parsed?.budget?.min && parsed?.budget?.max
      ? `¥${parsed.budget.min}-${parsed.budget.max}`
      : parsed?.budget?.min
        ? `¥${parsed.budget.min}起`
        : "不限";

    return {
      missingInfo: [...reallyMissing],
      responsePayload: {
        type: "question_card",
        confirmMode: true,
        summary: `${dest} · ${dayCount}天`,
        tripInfo: {
          destination: dest,
          startDate,
          endDate,
          dayCount,
          travelers: travelersStr,
          budget: budgetStr,
          preferences: prefsStr,
        },
      },
      assistantMessage: "",
      actionLog: [logAction(state, "collect_missing_info", "showing confirm card", Date.now() - t0)],
    };
  }

  // Priority order: destination → dayCount → travelers → preferences → budget
  const priorityOrder = ["destination", "dayCount", "travelers", "preferences", "budget"];
  const normalized = new Set<string>();
  for (const m of reallyMissing) {
    if (m === "startDate" || m === "endDate" || m === "dayCount" || m === "dates") {
      if (!parsed?.startDate && !parsed?.dayCount) normalized.add("dayCount");
    } else if (m === "adults" || m === "children" || m === "travelers") {
      if (!parsed?.travelers?.adults) normalized.add("travelers");
    } else if (m === "budgetMin" || m === "budgetMax" || m === "budget") {
      if (!parsed?.budget) normalized.add("budget");
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

  if (sorted.length === 0 && !isEditRequest) {
    return { missingInfo: [...reallyMissing], assistantMessage: "" };
  }

  // If user clicked "修改信息", show ALL fields for editing (not just missing)
  const fieldsToShow = isEditRequest
    ? ["destination", "dayCount", "travelers", "preferences", "budget"]
    : sorted;

  const formItems = buildFormItems(fieldsToShow, isEditRequest);

  const summary = isEditRequest
    ? "请修改以下信息"
    : parsed?.destination
      ? `已识别：${parsed.destination}${parsed.dayCount ? ` · ${parsed.dayCount}天` : ""}${parsed.travelers?.adults ? ` · ${parsed.travelers.adults}人` : ""}${parsed.preferences?.length ? ` · ${parsed.preferences.join("、")}` : ""}。请补充缺失信息。`
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

  try {
    const supabase = getSupabase();
    const tripId = crypto.randomUUID();
    const userId = state.userId || "local-user";

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
      for (const day of draft.days) {
        const dayId = crypto.randomUUID();
        const dayDate = day.date || new Date(new Date(startDate).getTime() + (day.dayIndex - 1) * 86400000).toISOString().slice(0, 10);

        const { error: dayError } = await supabase.from("days").insert({
          id: dayId,
          trip_id: tripId,
          day_index: day.dayIndex,
          date: dayDate,
          notes: day.notes || "",
        });

        if (dayError) {
          console.error(`[create_trip] Day insert error:`, dayError);
          continue;
        }
        savedDayCount++;

        // Insert activities for this day
        if (day.activities?.length) {
          const activityRows = day.activities.map((a) => ({
            id: crypto.randomUUID(),
            day_id: dayId,
            order: a.order ?? (day.activities.indexOf(a) + 1),
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
          }));

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
              is_generated: row.is_generated,
            }));
            const { error: fallbackError } = await supabase.from("activities").insert(fallbackRows);
            if (fallbackError) {
              console.error(`[create_trip] Activity insert error:`, fallbackError);
            } else {
              savedActivityCount += fallbackRows.length;
            }
          } else {
            savedActivityCount += activityRows.length;
          }
        }
      }
    }

    // Step 3: Build response card
    const travelersStr = `${reqs.travelers?.adults ?? 1}成人${reqs.travelers?.children ? ` +${reqs.travelers.children}儿童` : ""}`;
    const budgetStr = reqs.budget?.min && reqs.budget?.max
      ? `¥${reqs.budget.min}-${reqs.budget.max}`
      : "不限";

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

    return {
      tripId,
      responsePayload: card,
      assistantMessage: msg,
      actionLog: [logAction(state, "create_trip", `tripId=${tripId}, days=${savedDayCount}, activities=${savedActivityCount}`, Date.now() - t0)],
    };
  } catch (err) {
    return {
      errors: [...(state.errors ?? []), `create_trip: ${(err as Error).message}`],
      assistantMessage: `创建行程失败：${(err as Error).message.slice(0, 200)}`,
    };
  }
}
