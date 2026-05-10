"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/shared/Icon";
import { ReasoningProgress } from "@/components/agent/ReasoningProgress";
import { cn } from "@/lib/utils/cn";
import type { AgentRunSSEEvent } from "@/types/agent";
import { Activity, Day, PreferenceTag, Trip } from "@/types/trip";
import { PREFERENCE_TAGS, BUDGET_OPTIONS } from "@/lib/constants";
import { useTripStore } from "@/stores/tripStore";
import { useUserStore } from "@/stores/userStore";

type PlannerMode = "ai" | "manual";
type CreatePhase =
  | "idle"
  | "parse"
  | "confirm"
  | "research_inspiration"
  | "extract_places"
  | "critique_itinerary"
  | "generate_itinerary"
  | "complete";

const STEP_TO_PHASE: Record<string, CreatePhase> = {
  START: "parse",
  research_inspiration: "research_inspiration",
  extract_places: "extract_places",
  critique_itinerary: "critique_itinerary",
  generate_itinerary: "generate_itinerary",
  confirm_places: "confirm",
};

function buildEmptyDays(tripId: string, startDate: string, endDate: string): Day[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const count = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  const now = new Date().toISOString();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);

    return {
      id: crypto.randomUUID(),
      tripId,
      dayIndex: index,
      date: date.toISOString().slice(0, 10),
      activities: [],
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
  });
}

function parseWishlistParam(value: string) {
  return value
    .split(/[、,，]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function CreatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const saveTrip = useTripStore((s) => s.saveTrip);
  const userProfile = useUserStore((s) => s.userProfile);

  const mode: PlannerMode = searchParams.get("mode") === "manual" ? "manual" : "ai";
  const initialWishlist = searchParams.get("wishlist") || "";
  const [destination, setDestination] = useState(searchParams.get("destination") || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [budgetIndex, setBudgetIndex] = useState(1);
  const [preferences, setPreferences] = useState<PreferenceTag[]>([]);
  const [naturalInput, setNaturalInput] = useState(
    initialWishlist ? `我想把这些心愿地点加入行程：${initialWishlist}` : ""
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [status, setStatus] = useState("");
  const [progressPhase, setProgressPhase] = useState<CreatePhase>("idle");
  const [progressNotes, setProgressNotes] = useState<string[]>([]);

  const readAgentStream = async (res: Response) => {
    if (!res.ok || !res.body) throw new Error("Agent API error");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completeEvent: AgentRunSSEEvent | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        let event: AgentRunSSEEvent;
        try {
          event = JSON.parse(line.slice(6)) as AgentRunSSEEvent;
        } catch {
          continue;
        }

        switch (event.type) {
          case "step":
            setStatus(event.message || "处理中...");
            if (event.node && STEP_TO_PHASE[event.node]) {
              setProgressPhase(STEP_TO_PHASE[event.node]);
            }
            break;
          case "awaiting_confirmation":
            setStatus(event.message || "等待确认...");
            setProgressPhase("confirm");
            break;
          case "complete":
            completeEvent = event;
            setStatus(event.message || "完成");
            setProgressPhase("complete");
            if (event.data) {
              const data = event.data as {
                inspirationItems?: unknown[];
                savedPlaceCandidates?: unknown[];
                critiqueResult?: { overallScore?: number };
              };
              const notes: string[] = [];
              if (data.inspirationItems?.length) {
                notes.push(`已汇总 ${data.inspirationItems.length} 条攻略摘要`);
              }
              if (data.savedPlaceCandidates?.length) {
                notes.push(`已提炼 ${data.savedPlaceCandidates.length} 个候选地点`);
              }
              if (typeof data.critiqueResult?.overallScore === "number") {
                notes.push(`行程健康度 ${data.critiqueResult.overallScore}/10`);
              }
              if (notes.length > 0) {
                setProgressNotes(notes);
              }
            }
            break;
          case "error":
            throw new Error(event.message || "生成失败");
        }
      }
    }

    return completeEvent;
  };

  const togglePreference = (tag: PreferenceTag) => {
    setPreferences((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const switchMode = (nextMode: PlannerMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", nextMode);
    router.replace(`/create?${params}`);
  };

  const buildTripDraft = (): Trip => {
    const budget = BUDGET_OPTIONS[budgetIndex];
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const days = buildEmptyDays(id, startDate, endDate);
    const wishlistNames = parseWishlistParam(initialWishlist);

    wishlistNames.forEach((name, index) => {
      const day = days[index % days.length];
      if (!day) return;

      const activityIndex = day.activities.length;
      const startHour = Math.min(18, 9 + activityIndex * 3);
      const endHour = Math.min(20, startHour + 2);
      const activity: Activity = {
        id: crypto.randomUUID(),
        dayId: day.id,
        order: (activityIndex + 1) * 1000,
        type: "attraction",
        poi: null,
        customName: name,
        startTime: `${String(startHour).padStart(2, "0")}:00`,
        endTime: `${String(endHour).padStart(2, "0")}:00`,
        durationMinutes: 120,
        estimatedCost: 0,
        notes: "心愿地：来自探索页心愿池，可在详情页继续调整时间、费用和备注。",
        sourceReason: "[心愿地] 来自探索页心愿池",
        weatherFit: "any",
        isGenerated: false,
        createdAt: now,
        updatedAt: now,
      };
      day.activities.push(activity);
      day.updatedAt = now;
    });

    return {
      id,
      userId: userProfile?.id || "local-user",
      title: destination ? `${destination}之旅` : "未命名行程",
      destination,
      destinationCoord: { lat: 0, lng: 0 },
      startDate,
      endDate,
      travelers: { adults, children },
      budget: {
        currency: "CNY",
        min: budget?.min ?? 0,
        max: budget?.max ?? 10000,
      },
      preferences,
      days,
      status: "draft",
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleManualCreate = async () => {
    if (!destination || isCreatingManual) return;
    setIsCreatingManual(true);
    setStatus("正在创建草稿行程...");

    const trip = buildTripDraft();

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trip),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "创建失败");
      }

      saveTrip(trip);
      setStatus("跳转到手动规划页...");
      router.push(`/trip/${trip.id}`);
    } catch (err) {
      setStatus(`创建失败: ${(err as Error).message}`);
    } finally {
      setIsCreatingManual(false);
    }
  };

  const handleGenerate = async () => {
    if (!destination || isGenerating) return;
    setIsGenerating(true);
    setStatus("正在分析需求...");
    setProgressPhase("parse");
    setProgressNotes([]);

    const parts: string[] = [];
    const effectivePreferences = preferences.length > 0 ? preferences : (["休闲度假"] as PreferenceTag[]);
    parts.push(`想去${destination}`);

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
      parts.push(`从${startDate}到${endDate}，共${days}天`);
    } else if (startDate) {
      parts.push(`计划从${startDate}出发，共3天`);
    } else {
      parts.push("计划玩3天");
    }

    parts.push(`${adults}个成人${children > 0 ? `，${children}个儿童` : ""}`);

    const budget = BUDGET_OPTIONS[budgetIndex];
    if (budget) {
      parts.push(`预算${budget.label}，约${budget.min}-${budget.max}元`);
    }

    parts.push(`偏好${effectivePreferences.join("、")}`);

    if (naturalInput.trim()) {
      parts.push(naturalInput.trim());
    }

    parts.push("直接帮我规划");

    const message = parts.join("，");
    const threadId = `create-${Date.now()}`;

    try {
      const runRes = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message, userId: userProfile?.id || "local-user" }),
      });

      const firstComplete = await readAgentStream(runRes);
      const firstData = (firstComplete?.data ?? {}) as {
        tripId?: string | null;
        tripCard?: { tripId?: string | null } | null;
        questionCard?: { confirmMode?: boolean } | null;
      };
      const firstTripId = firstData.tripId || firstData.tripCard?.tripId;

      if (firstTripId) {
        setStatus("跳转到行程页...");
        setProgressPhase("complete");
        router.push(`/trip/${firstTripId}`);
        return;
      }

      if (firstData.questionCard?.confirmMode) {
        setStatus("正在确认需求并生成行程...");
        setProgressPhase("confirm");
        const confirmRes = await fetch("/api/agent/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, decision: {} }),
        });

        const secondComplete = await readAgentStream(confirmRes);
        const secondData = (secondComplete?.data ?? {}) as {
          tripId?: string | null;
          tripCard?: { tripId?: string | null } | null;
        };
        const secondTripId = secondData.tripId || secondData.tripCard?.tripId;

        if (secondTripId) {
          setStatus("跳转到行程页...");
          setProgressPhase("complete");
          router.push(`/trip/${secondTripId}`);
          return;
        }
      }

      setStatus(firstComplete?.message || "暂未生成行程");
    } catch (err) {
      setStatus(`生成失败: ${(err as Error).message}`);
      setProgressPhase("idle");
    } finally {
      setIsGenerating(false);
    }
  };

  const isBusy = isGenerating || isCreatingManual;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
      <div className="mb-6 grid grid-cols-2 gap-3 rounded-[22px] border border-outline-variant/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(237,244,251,0.9))] p-2 shadow-[0_16px_40px_rgba(8,35,69,0.06)]">
        <button
          type="button"
          onClick={() => switchMode("ai")}
          className={cn(
            "flex min-h-[68px] items-center justify-center rounded-[18px] px-4 text-base font-medium transition-colors",
            mode === "ai"
              ? "bg-primary text-white shadow-[0_14px_30px_rgba(10,40,80,0.18)]"
              : "bg-transparent text-on-surface-variant hover:bg-white/70"
          )}
        >
          AI 智能规划
        </button>
        <button
          type="button"
          onClick={() => switchMode("manual")}
          className={cn(
            "flex min-h-[68px] items-center justify-center rounded-[18px] px-4 text-base font-medium transition-colors",
            mode === "manual"
              ? "bg-primary text-white shadow-[0_14px_30px_rgba(10,40,80,0.18)]"
              : "bg-transparent text-on-surface-variant hover:bg-white/70"
          )}
        >
          手动规划
        </button>
      </div>

      <div className="space-y-6 rounded-[28px] border border-outline-variant/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(237,244,251,0.96))] p-5 shadow-[0_22px_56px_rgba(8,35,69,0.06)] lg:p-8">
        {mode === "ai" && (
          <div>
            <label className="font-label-md text-label-md text-on-surface mb-2 block">
              自然语言描述
            </label>
            <textarea
              value={naturalInput}
              onChange={(e) => setNaturalInput(e.target.value)}
              placeholder="例如：正在路上浅草寺和东京塔，要提前预约的那种，最好每天都能吃到拉面..."
              className="h-32 w-full rounded-[24px] border border-outline-variant/60 bg-white/82 px-4 py-3 text-on-surface outline-none transition-colors resize-none focus:border-primary"
            />
          </div>
        )}

        <div>
          <label className="font-label-md text-label-md text-on-surface mb-2 block">目的地 *</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="输入城市或地区，如：京都、巴塔哥尼亚"
            className="w-full rounded-[24px] border border-outline-variant/60 bg-white/82 px-4 py-3 text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-label-md text-label-md text-on-surface mb-2 block">出发日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-[24px] border border-outline-variant/60 bg-white/82 px-4 py-3 text-on-surface outline-none transition-colors focus:border-primary"
            />
          </div>
          <div>
            <label className="font-label-md text-label-md text-on-surface mb-2 block">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-[24px] border border-outline-variant/60 bg-white/82 px-4 py-3 text-on-surface outline-none transition-colors focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="font-label-md text-label-md text-on-surface mb-2 block">出行人数</label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-[24px] border border-outline-variant/60 bg-white/76 px-4 py-3">
              <span className="font-body-md text-on-surface-variant">成人</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setAdults(Math.max(1, adults - 1))} className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container" aria-label="减少成人数量">
                  <Icon name="remove" className="text-[18px]" />
                </button>
                <span className="w-6 text-center font-body-md">{adults}</span>
                <button onClick={() => setAdults(adults + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container" aria-label="增加成人数量">
                  <Icon name="add" className="text-[18px]" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[24px] border border-outline-variant/60 bg-white/76 px-4 py-3">
              <span className="font-body-md text-on-surface-variant">儿童</span>
              <div className="flex items-center gap-3">
                <button onClick={() => setChildren(Math.max(0, children - 1))} className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container" aria-label="减少儿童数量">
                  <Icon name="remove" className="text-[18px]" />
                </button>
                <span className="w-6 text-center font-body-md">{children}</span>
                <button onClick={() => setChildren(children + 1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container" aria-label="增加儿童数量">
                  <Icon name="add" className="text-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="font-label-md text-label-md text-on-surface mb-2 block">预算档位</label>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setBudgetIndex(i)}
                className={cn(
                  "rounded-full border px-4 py-2 font-label-md text-label-md transition-colors",
                  budgetIndex === i
                    ? "border-primary bg-primary-container text-on-primary-container"
                    : "border-outline-variant/60 bg-white/68 text-on-surface-variant hover:bg-surface-container"
                )}
              >
                {opt.label} (¥{opt.min.toLocaleString()}-¥{opt.max.toLocaleString()})
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-label-md text-label-md text-on-surface mb-2 block">出行偏好</label>
          <div className="flex flex-wrap gap-2">
            {PREFERENCE_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => togglePreference(tag)}
                className={cn(
                  "rounded-full border px-4 py-2 font-label-md text-label-md transition-colors active:scale-95",
                  preferences.includes(tag)
                    ? "border-primary bg-primary-container text-on-primary-container"
                    : "border-outline-variant/60 bg-white/68 text-on-surface-variant hover:bg-surface-container"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {isBusy && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-[22px] border border-outline-variant bg-surface-container px-4 py-3">
              <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="font-body-md text-on-surface-variant">{status}</span>
            </div>
            {mode === "ai" && (
              <ReasoningProgress
                active={isGenerating}
                phase={progressPhase}
                status={status}
                insightLines={progressNotes}
              />
            )}
          </div>
        )}

        <button
          onClick={mode === "ai" ? handleGenerate : handleManualCreate}
          disabled={!destination || isBusy}
          className="sticky bottom-24 z-10 flex w-full items-center justify-center gap-3 rounded-full py-4 font-label-lg text-label-lg text-white shadow-[0_18px_40px_rgba(8,35,69,0.20)] transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 lg:static"
          style={{ background: "linear-gradient(180deg, rgba(15,55,100,0.96) 0%, rgba(7,27,51,0.98) 100%)" }}
        >
          {mode === "ai" ? (
            isGenerating ? (
              <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />生成中...</>
            ) : (
              <><Icon name="auto_awesome" className="text-[22px]" />AI 一键生成行程</>
            )
          ) : (
            isCreatingManual ? (
              <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />创建中...</>
            ) : (
              <><Icon name="edit_calendar" className="text-[22px]" />创建手动规划</>
            )
          )}
        </button>
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 lg:px-lg py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-surface-container-high rounded-xl w-64" />
          <div className="h-28 bg-surface-container-high rounded-xl w-full" />
          <div className="h-12 bg-surface-container-high rounded-xl w-full" />
        </div>
      </div>
    }>
      <CreatePageContent />
    </Suspense>
  );
}
