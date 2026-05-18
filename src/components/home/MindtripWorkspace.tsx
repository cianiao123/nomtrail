"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentPanel, type TripInfoSnapshot } from "@/components/agent/AgentPanel";
import { Icon } from "@/components/shared/Icon";
import { MapPanel } from "@/components/trip/MapPanel";
import { useAgentStore } from "@/stores/agentStore";
import { useMapStore } from "@/stores/mapStore";
import { useTripStore } from "@/stores/tripStore";
import { useUserStore } from "@/stores/userStore";
import { resolveClientUserId } from "@/lib/auth/guestUser";
import type { Activity, Day, Trip } from "@/types/trip";
import type { AgentDestinationRecommendationCardData, ParsedPlace, SavedPlaceCandidate } from "@/types/agent";
import type { WeatherForecast, WeatherResponse } from "@/types/weather";

const navItems = [
  { href: "/", label: "对话", icon: "auto_awesome" },
  { href: "/create?mode=manual", label: "创建", icon: "add_circle" },
  { href: "/explore", label: "探索", icon: "search" },
  { href: "/profile", label: "行程", icon: "map" },
];

const recommendationGroups = [
  {
    title: "自然风光",
    subtitle: "山海、湖泊和开阔景观",
    cities: [
      {
        name: "大理",
        image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=720&q=80",
        intro: "苍山洱海之间节奏舒展，适合慢游、骑行和看日落。",
      },
      {
        name: "桂林",
        image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=720&q=80",
        intro: "山水线条清秀，适合漓江、阳朔和轻户外路线。",
      },
      {
        name: "三亚",
        image: "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=720&q=80",
        intro: "海岸、椰林和度假酒店集中，适合放松型旅行。",
      },
    ],
  },
  {
    title: "历史文化",
    subtitle: "古城、建筑和博物馆",
    cities: [
      {
        name: "西安",
        image: "https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=720&q=80",
        intro: "城墙、碑林和唐风街区密集，适合第一次文化深度游。",
      },
      {
        name: "北京",
        image: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=720&q=80",
        intro: "皇家建筑、胡同和博物馆丰富，适合经典城市路线。",
      },
      {
        name: "京都",
        image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=720&q=80",
        intro: "寺社、庭院和老街保存完整，适合慢节奏文化旅行。",
      },
    ],
  },
  {
    title: "人文风情",
    subtitle: "街区、美食和生活方式",
    cities: [
      {
        name: "成都",
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=720&q=80",
        intro: "茶馆、火锅和街巷生活感强，适合边吃边逛。",
      },
      {
        name: "大阪",
        image: "https://images.unsplash.com/photo-1590559899731-a382839e5549?auto=format&fit=crop&w=720&q=80",
        intro: "商店街和夜间美食密集，适合轻松吃逛路线。",
      },
      {
        name: "上海",
        image: "https://images.unsplash.com/photo-1538428494232-9c0d8a3ab403?auto=format&fit=crop&w=720&q=80",
        intro: "梧桐街区、展览和咖啡馆集中，适合城市漫步。",
      },
    ],
  },
];

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function HeaderInfoChip({ label, value, separated }: { label: string; value?: string; separated?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 px-3 py-1 ${separated ? "border-l border-black/10" : ""}`}>
      <span className="shrink-0 text-[#71808c]">{label}</span>
      {value ? <span className="max-w-[150px] truncate font-semibold text-[#101820]">{value}</span> : null}
    </span>
  );
}

function makeActivity(
  dayId: string,
  index: number,
  name: string,
  lng: number,
  lat: number,
  type: Activity["type"],
  startTime: string,
  notes = "候选地点"
): Activity {
  return {
    id: `home-activity-${dayId}-${index}`,
    dayId,
    order: (index + 1) * 1000,
    type,
    poi: {
      amapId: `home-poi-${index}`,
      name,
      address: "",
      coordinate: { lng, lat },
      category: type,
      photos: [],
    },
    startTime,
    endTime: "",
    durationMinutes: type === "food" ? 75 : 120,
    estimatedCost: type === "food" ? 120 : 0,
    sourceReason: notes,
    weatherFit: "any",
    isGenerated: true,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

function normalizeActivityType(category: SavedPlaceCandidate["category"] | ParsedPlace["category"]): Activity["type"] {
  if (category === "attraction" || category === "food" || category === "hotel" || category === "transport") {
    return category;
  }
  return "other";
}

function buildTripFromCandidates(
  userId: string,
  savedCandidates: SavedPlaceCandidate[],
  parsedPlaces: ParsedPlace[],
  fallbackDestination: string
): Trip {
  const dayId = "home-candidate-day-1";
  const savedActivities = savedCandidates.map((candidate, index) =>
    makeActivity(
      dayId,
      index,
      candidate.name,
      candidate.coordinate?.lng ?? 0,
      candidate.coordinate?.lat ?? 0,
      normalizeActivityType(candidate.category),
      `${String(10 + index * 2).padStart(2, "0")}:00`,
      candidate.reason
    )
  );
  const parsedActivities = parsedPlaces.map((place, index) =>
    makeActivity(
      dayId,
      savedActivities.length + index,
      place.name,
      place.coordinate?.lng ?? 0,
      place.coordinate?.lat ?? 0,
      normalizeActivityType(place.category),
      `${String(10 + (savedActivities.length + index) * 2).padStart(2, "0")}:00`,
      place.notes || place.sourceText
    )
  );
  const activities = [...savedActivities, ...parsedActivities].slice(0, 12);
  const destination = fallbackDestination || savedCandidates[0]?.city || parsedPlaces[0]?.address || "目的地";
  const day: Day = {
    id: dayId,
    tripId: "home-candidate-trip",
    dayIndex: 0,
    date: "2026-05-18",
    activities,
    notes: "候选地点预览",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };

  return {
    id: "home-candidate-trip",
    userId,
    title: `${destination}候选地点`,
    destination,
    destinationCoord: { lng: 0, lat: 0 },
    startDate: "2026-05-18",
    endDate: "2026-05-18",
    travelers: { adults: 2, children: 0 },
    budget: { currency: "CNY", min: 1500, max: 3500 },
    preferences: ["美食探索", "城市漫步", "休闲度假"],
    days: [day],
    status: "draft",
    isPublic: false,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

function buildTripFromDraft(userId: string, draft: NonNullable<ReturnType<typeof useAgentStore.getState>["itineraryDraft"]>, fallbackDestination: string): Trip {
  const firstDate = draft.days[0]?.date || "2026-05-18";
  const lastDate = draft.days[draft.days.length - 1]?.date || firstDate;
  const destination = fallbackDestination || "目的地";

  return {
    id: "home-agent-preview-trip",
    userId,
    title: `${destination}智能行程`,
    destination,
    destinationCoord: { lng: 0, lat: 0 },
    startDate: firstDate,
    endDate: lastDate,
    travelers: { adults: 2, children: 0 },
    budget: { currency: "CNY", min: 3000, max: 8000 },
    preferences: ["美食探索", "购物娱乐", "休闲度假"],
    days: draft.days,
    status: "generated",
    isPublic: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mergeWeatherIntoDays(days: Day[], forecasts: WeatherForecast[]) {
  return days.map((day, index) => {
    const forecast = forecasts.find((item) => item.date === day.date) ?? forecasts[index];
    if (!forecast) return day;

    return {
      ...day,
      weather: {
        date: forecast.date,
        condition: forecast.condition,
        tempHigh: forecast.tempHigh,
        tempLow: forecast.tempLow,
        humidity: forecast.humidity,
        windSpeed: forecast.windSpeed,
        icon: forecast.icon,
      },
    };
  });
}

function buildPreviewPlacesFromDraft(
  draft: NonNullable<ReturnType<typeof useAgentStore.getState>["itineraryDraft"]>,
  fallbackDestination: string
): SavedPlaceCandidate[] {
  const seen = new Set<string>();
  const previewPlaces: SavedPlaceCandidate[] = [];

  draft.days.forEach((day) => {
    day.activities.forEach((activity) => {
      const name = activity.customName || activity.poi?.name || "";
      const key = `${name}:${activity.poi?.address || ""}`;
      if (!name || seen.has(key)) return;
      seen.add(key);

      const category = normalizeActivityType(activity.type);
      const priorityTag: SavedPlaceCandidate["priorityTag"] =
        category === "food"
          ? "food_candidate"
          : activity.weatherFit === "rainy" || activity.weatherFit === "indoor"
            ? "rainy_backup"
            : activity.weatherFit === "night"
              ? "night_option"
              : "must_go";

      previewPlaces.push({
        name,
        city: fallbackDestination || activity.poi?.address || "",
        category,
        priorityTag,
        reason: activity.sourceReason || activity.notes || `来自第 ${day.dayIndex + 1} 天行程安排。`,
        sourceRefs: [`Day ${day.dayIndex + 1}`],
        coordinate: activity.poi?.coordinate,
        address: activity.poi?.address,
        openingHours: activity.openingHours || activity.poi?.openingHours,
        ticketReference: activity.ticketReference,
        recommendedDuration: activity.recommendedDuration || activity.durationMinutes,
        qualityScore: 0.72,
      });
    });
  });

  return previewPlaces;
}

function inferRecommendationDestination(
  card: AgentDestinationRecommendationCardData | null,
  messages: ReturnType<typeof useAgentStore.getState>["messages"]
) {
  const titleDestination = card?.title
    ?.replace(/(?:好去处|推荐|怎么玩|怎么逛|景点|目的地|旅行|玩法|攻略).*$/u, "")
    .trim();
  if (titleDestination) return titleDestination;

  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const messageDestination = latestUserMessage.match(/([\u4e00-\u9fa5A-Za-z]{2,20})(?:有什么|有啥|哪里|哪儿|好玩|好吃|推荐)/u)?.[1];
  return messageDestination || "";
}

function inferRecommendationCategory(
  item: AgentDestinationRecommendationCardData["recommendations"][number]
): SavedPlaceCandidate["category"] {
  const text = `${item.city}${item.highlight}${item.reason}`;
  if (/餐|吃|美食|市场|夜市|小吃|咖啡|甜品|饭|火锅|烧烤|海鲜/u.test(text)) return "food";
  if (/酒店|民宿|客栈|住宿|入住/u.test(text)) return "hotel";
  if (/机场|车站|码头|地铁|公交/u.test(text)) return "transport";
  if (/免税|购物|商场|店/u.test(text)) return "other";
  return "attraction";
}

function buildPreviewPlacesFromRecommendations(
  card: AgentDestinationRecommendationCardData | null,
  destination: string
): SavedPlaceCandidate[] {
  if (!card) return [];

  return card.recommendations
    .filter((item) => item.city.trim())
    .map((item) => {
      const category = inferRecommendationCategory(item);
      const text = `${item.city}${item.highlight}${item.reason}`;
      const priorityTag: SavedPlaceCandidate["priorityTag"] =
        category === "food" ? "food_candidate" : /夜|晚|酒吧/u.test(text) ? "night_option" : "nearby_optional";

      return {
        name: item.city.trim(),
        city: destination,
        category,
        priorityTag,
        reason: item.reason,
        sourceRefs: [card.title],
        qualityScore: 0.7,
      };
    });
}

export function MindtripWorkspace() {
  const [liveTripInfo, setLiveTripInfo] = useState<TripInfoSnapshot>({});
  const userProfile = useUserStore((s) => s.userProfile);
  const setCurrentTrip = useTripStore((s) => s.setCurrentTrip);
  const currentTrip = useTripStore((s) => s.currentTrip);
  const clearCurrentTrip = useTripStore((s) => s.clearCurrentTrip);
  const setCandidatePreviewPlaces = useMapStore((s) => s.setCandidatePreviewPlaces);
  const clearCandidatePreviewPlaces = useMapStore((s) => s.clearCandidatePreviewPlaces);
  const itineraryDraft = useAgentStore((s) => s.itineraryDraft);
  const tripCard = useAgentStore((s) => s.tripCard);
  const messages = useAgentStore((s) => s.messages);
  const destinationRecommendationCard = useAgentStore((s) => s.destinationRecommendationCard);
  const parsedPlaces = useAgentStore((s) => s.parsedPlaces);
  const savedPlaceCandidates = useAgentStore((s) => s.savedPlaceCandidates);
  const threadId = useAgentStore((s) => s.threadId);
  const chatHistory = useAgentStore((s) => s.chatHistory);
  const loadConversation = useAgentStore((s) => s.loadConversation);
  const resetAgent = useAgentStore((s) => s.reset);
  const userId = resolveClientUserId(userProfile?.id);
  const previewSignatureRef = useRef("");
  const weatherRequestRef = useRef("");

  const recommendationDestination = useMemo(
    () => inferRecommendationDestination(destinationRecommendationCard, messages),
    [destinationRecommendationCard, messages]
  );
  const recommendationPreviewPlaces = useMemo(
    () => buildPreviewPlacesFromRecommendations(destinationRecommendationCard, recommendationDestination),
    [destinationRecommendationCard, recommendationDestination]
  );
  const candidatePreviewPlaces = useMemo(
    () => [...savedPlaceCandidates, ...recommendationPreviewPlaces],
    [recommendationPreviewPlaces, savedPlaceCandidates]
  );
  const candidateTrip = useMemo(
    () =>
      buildTripFromCandidates(
        userId,
        candidatePreviewPlaces,
        parsedPlaces,
        tripCard?.destination || currentTrip?.destination || recommendationDestination || ""
      ),
    [candidatePreviewPlaces, currentTrip?.destination, parsedPlaces, recommendationDestination, tripCard?.destination, userId]
  );
  const hasCandidatePlaces = candidatePreviewPlaces.length > 0 || parsedPlaces.length > 0 || recommendationPreviewPlaces.length > 0;
  const hasDraftPlaces = !!itineraryDraft?.days?.some((day) => day.activities.length > 0);
  const shouldShowMap = hasCandidatePlaces || hasDraftPlaces;
  const isFreshConversation = messages.length === 0 && !hasCandidatePlaces && !hasDraftPlaces;
  const activeConversationTitle = chatHistory.find((conversation) => conversation.threadId === threadId)?.title;
  const headerSourceInfo: TripInfoSnapshot = isFreshConversation ? {} : {
    destination: liveTripInfo.destination || tripCard?.destination || currentTrip?.destination,
    date: liveTripInfo.date || tripCard?.dates || (currentTrip ? `${currentTrip.startDate} ~ ${currentTrip.endDate}` : ""),
    travelers: liveTripInfo.travelers || tripCard?.travelers || (currentTrip ? `${currentTrip.travelers.adults + currentTrip.travelers.children}人` : ""),
    budget: liveTripInfo.budget || tripCard?.budget || (currentTrip ? `¥${currentTrip.budget.min}-${currentTrip.budget.max}` : ""),
  };
  const headerTripInfo: TripInfoSnapshot = isFreshConversation ? {} : headerSourceInfo;
  const headerTitle = isFreshConversation ? "新对话" : headerTripInfo.destination ? `${headerTripInfo.destination}之旅` : activeConversationTitle || "新对话";
  const headerSubtitle = [
    liveTripInfo.destination || currentTrip?.destination ? liveTripInfo.destination ? "规划中" : currentTrip?.destination : "",
    headerTripInfo.date,
    headerTripInfo.travelers,
  ].filter(Boolean).join(" · ") || "今天去哪儿？";

  useEffect(() => {
    if (itineraryDraft?.days?.length) {
      const signature = JSON.stringify({
        type: "draft",
        destination: tripCard?.destination || currentTrip?.destination || "",
        days: itineraryDraft.days.map((day) => ({
          date: day.date,
          activities: day.activities.map((activity) => ({
            id: activity.id,
            name: activity.customName || activity.poi?.name || "",
            startTime: activity.startTime,
            endTime: activity.endTime,
          })),
        })),
      });
      if (previewSignatureRef.current !== signature) {
        previewSignatureRef.current = signature;
        const destination = tripCard?.destination || currentTrip?.destination || "";
        const draftTrip = buildTripFromDraft(userId, itineraryDraft, destination);
        setCurrentTrip(draftTrip);
        setCandidatePreviewPlaces(buildPreviewPlacesFromDraft(itineraryDraft, destination));
        const weatherSignature = `${signature}:${destination}`;
        weatherRequestRef.current = weatherSignature;
        fetch(`/api/weather?${new URLSearchParams({ destination, days: String(Math.min(4, draftTrip.days.length)) })}`)
          .then((res) => res.ok ? res.json() : null)
          .then((payload: { success?: boolean; data?: WeatherResponse } | null) => {
            if (weatherRequestRef.current !== weatherSignature || !payload?.success || !payload.data?.forecasts?.length) return;
            setCurrentTrip({
              ...draftTrip,
              days: mergeWeatherIntoDays(draftTrip.days, payload.data.forecasts),
              updatedAt: new Date().toISOString(),
            });
          })
          .catch(() => {
            // 天气是增强信息，失败时保留原行程预览。
          });
      }
      return;
    }
    if (hasCandidatePlaces) {
      const signature = JSON.stringify({
        type: "candidates",
        destination: candidateTrip.destination,
        names: candidateTrip.days.flatMap((day) =>
          day.activities.map((activity) => activity.customName || activity.poi?.name || "")
        ),
        previewNames: candidatePreviewPlaces.map((place) => place.name),
      });
      if (previewSignatureRef.current !== signature) {
        previewSignatureRef.current = signature;
        setCandidatePreviewPlaces(candidatePreviewPlaces);
        setCurrentTrip(candidateTrip);
      }
      return;
    }
    if (messages.length === 0 && currentTrip?.id?.startsWith("home-")) {
      previewSignatureRef.current = "";
      clearCandidatePreviewPlaces();
      clearCurrentTrip();
    }
  }, [candidatePreviewPlaces, candidateTrip, clearCandidatePreviewPlaces, clearCurrentTrip, currentTrip, hasCandidatePlaces, itineraryDraft, messages.length, setCandidatePreviewPlaces, setCurrentTrip, tripCard?.destination, userId]);

  return (
    <div className="h-dvh overflow-hidden bg-[#eef3f6] text-on-surface">
      <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[168px_minmax(560px,1.22fr)_minmax(320px,0.78fr)]">
        <aside className="hidden border-r border-black/10 bg-white px-3 py-5 lg:flex lg:flex-col">
          <Link href="/" className="mb-10 flex items-center gap-2 px-1 text-xl font-semibold tracking-tight text-[#101820]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#101820] text-white">
              <Icon name="auto_awesome" className="text-[16px]" filled />
            </span>
            NomTrail
          </Link>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-medium text-[#28323a] transition-colors hover:bg-[#eef3f6]"
              >
                <Icon name={item.icon} className="text-[19px] text-[#17212b]" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setLiveTripInfo({});
                clearCandidatePreviewPlaces();
                clearCurrentTrip();
                previewSignatureRef.current = "";
                resetAgent();
              }}
              className="mb-5 flex items-center justify-center gap-2 rounded-[8px] bg-[#101820] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#243240]"
            >
              <Icon name="add" className="text-[17px]" />
              新建对话
            </button>

          <section className="min-h-0 overflow-hidden">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-medium tracking-[0.16em] text-[#71808c]">历史对话</p>
            </div>
            <div className="max-h-[34dvh] space-y-1.5 overflow-y-auto pr-1">
              {chatHistory.length > 0 ? (
                chatHistory.slice(0, 3).map((conversation) => {
                  const isActive = conversation.threadId === threadId;
                  return (
                    <button
                      key={conversation.threadId}
                      type="button"
                      onClick={() => loadConversation(conversation.threadId)}
                      className={`w-full rounded-[8px] px-3 py-2 text-left transition-colors ${
                        isActive
                          ? "bg-[#eef3f6] text-[#101820]"
                          : "text-[#52606b] hover:bg-[#f7fafc] hover:text-[#101820]"
                      }`}
                    >
                      <span className="block truncate text-sm font-medium">{conversation.title}</span>
                      <span className="mt-0.5 block text-xs text-[#8a96a0]">
                        {formatHistoryTime(conversation.updatedAt)} · {conversation.messages.length} 条消息
                      </span>
                    </button>
                  );
                })
              ) : null}
            </div>
          </section>
          </div>

        </aside>

        <section className="flex min-h-0 flex-col bg-[#f7fafc]">
          <header className="flex min-h-14 items-center justify-between gap-3 border-b border-black/10 bg-white/92 px-4 backdrop-blur">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#101820]">{headerTitle}</p>
              <p className="truncate text-xs text-[#71808c]">{headerSubtitle}</p>
            </div>
            <div className="hidden max-w-[72%] items-center rounded-full border border-black/10 bg-[#f7fafc] p-1 text-xs text-[#4c5963] md:flex">
              <HeaderInfoChip label="目的地" value={headerTripInfo.destination} />
              <HeaderInfoChip label="日期" value={headerTripInfo.date} separated />
              <HeaderInfoChip label="同行人" value={headerTripInfo.travelers} separated />
              <HeaderInfoChip label="预算" value={headerTripInfo.budget} separated />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden bg-white">
            <AgentPanel
              alwaysExpanded
              workspaceComposer
              onTripInfoChange={setLiveTripInfo}
              className="h-full rounded-none border-0 bg-white"
            />
          </div>
        </section>

        <section className="min-h-0 overflow-hidden bg-white p-2">
          {shouldShowMap ? (
            <div className="relative h-full min-h-0 overflow-hidden rounded-[20px] border border-black/10 bg-white">
              <MapPanel />
              {currentTrip?.days?.some((day) => day.weather) && (
                <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[340px] rounded-[10px] border border-black/10 bg-white/92 p-3 shadow-[0_18px_44px_rgba(16,24,32,0.14)] backdrop-blur">
                  <p className="text-xs font-medium tracking-[0.14em] text-[#71808c]">目的地天气</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {currentTrip.days.filter((day) => day.weather).slice(0, 4).map((day) => (
                      <div key={`${day.id}-weather`} className="rounded-[8px] bg-[#f7fafc] px-2 py-2 text-center">
                        <p className="text-[10px] text-[#71808c]">D{day.dayIndex + 1}</p>
                        <Icon
                          name={day.weather!.condition.includes("雨") ? "rainy" : day.weather!.condition.includes("晴") ? "wb_sunny" : "partly_cloudy_day"}
                          className="mx-auto my-1 text-[18px] text-[#0b2a4f]"
                        />
                        <p className="text-[11px] font-semibold text-[#101820]">{day.weather!.tempLow}°/{day.weather!.tempHigh}°</p>
                        <p className="mt-0.5 truncate text-[10px] text-[#62717d]">{day.weather!.condition}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Link
                href="/explore"
                className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full border border-black/10 bg-white/92 px-3 py-2 text-xs font-medium text-[#28323a] shadow-[0_10px_28px_rgba(16,24,32,0.12)] backdrop-blur transition-colors hover:bg-[#f7fafc]"
              >
                <Icon name="open_in_full" className="text-[15px]" />
                去探索
              </Link>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col rounded-[20px] bg-white px-6 py-6 lg:px-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-[0.18em] text-[#71808c]">出发前灵感</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#101820]">热门景点推荐</h2>
                </div>
                <Link
                  href="/explore"
                  className="hidden shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-[#f7fafc] px-3 py-2 text-xs font-medium text-[#28323a] transition-colors hover:bg-[#eef3f6] md:flex"
                >
                  <Icon name="search" className="text-[15px]" />
                  更多地点
                </Link>
              </div>

              <div className="grid min-h-0 flex-1 auto-rows-min gap-4 overflow-y-auto pr-1">
                {recommendationGroups.map((group) => (
                  <section key={group.title} className="rounded-[14px] border border-black/10 bg-[#f7fafc] p-4">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-[#101820]">{group.title}</h3>
                        <p className="mt-1 text-xs text-[#71808c]">{group.subtitle}</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {group.cities.map((city) => (
                        <div
                          key={`${group.title}-${city.name}`}
                          className="grid grid-cols-[76px_1fr] gap-3 overflow-hidden rounded-[12px] bg-white p-2 shadow-[0_6px_18px_rgba(16,24,32,0.05)]"
                        >
                          <div
                            className="h-[76px] rounded-[10px] bg-cover bg-center"
                            style={{ backgroundImage: `url(${city.image})` }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 py-1 pr-1">
                            <p className="truncate text-sm font-semibold text-[#101820]">{city.name}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71808c]">{city.intro}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
