"use client";

import { useState, useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useAgentStore } from "@/stores/agentStore";
import { PlaceConfirmation } from "./PlaceConfirmation";
import { MessageContent } from "./MessageContent";
import { ReasoningProgress } from "./ReasoningProgress";
import { Icon } from "@/components/shared/Icon";
import type { AgentPlaceGuideCardData, AgentTimelineCard, ConfirmedPlace, SavedPlaceCandidate } from "@/types/agent";
import type { TransportOption, TransportPlan } from "@/types/agent";
import { cn } from "@/lib/utils/cn";
import { createId } from "@/lib/utils/createId";
import { useTripStore } from "@/stores/tripStore";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useTripChecklistStore } from "@/stores/tripChecklistStore";
import { resolveClientUserId } from "@/lib/auth/guestUser";
import type { AgentExportPayload } from "@/types/agent";

interface Props {
  tripId?: string;
  className?: string;
  /** Always expanded — for embedded usage (trip page drawer) */
  alwaysExpanded?: boolean;
  openingPrompts?: string[];
  workspaceComposer?: boolean;
  onTripInfoChange?: (info: TripInfoSnapshot) => void;
}

export interface TripInfoSnapshot {
  destination?: string;
  date?: string;
  travelers?: string;
  budget?: string;
}

const STEP_LABELS: Record<string, string> = {
  START: "准备中",
  parse_trip: "正在分析旅行需求",
  recommend_destinations: "正在整理好玩的地方",
  "research_agent.recommend_destinations": "正在整理好玩的地方",
  research_inspiration: "正在搜索种草攻略",
  extract_places: "正在提炼地点",
  budget_check: "正在校验预算",
  generate_itinerary: "正在生成行程",
  critique_itinerary: "正在校验真实信息",
  save_version: "正在保存行程",
  confirm_places: "正在确认并继续生成",
  plan_transport: "正在规划往返交通",
};

function normalizeAgentStep(step?: string | null) {
  if (!step) return "";
  return step.includes(".") ? step.split(".").pop() || step : step;
}

function TripCardDisplay({ card }: { card: { tripId: string; title: string; destination: string; dates: string; dayCount: number; travelers: string; budget: string } }) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`/trip/${card.tripId}`)}
      className="mb-3 block cursor-pointer overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest/80 transition-shadow hover:shadow-[0_18px_40px_rgba(8,35,69,0.08)] active:scale-[0.98]"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-base font-semibold text-on-surface">{card.title}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-on-surface-variant">
          <div>{card.destination}</div>
          <div>{card.dates}</div>
          <div>{card.travelers}</div>
          <div>{card.budget}</div>
        </div>
        <div className="mt-2 text-xs text-primary">共 {card.dayCount} 天</div>
      </div>
    </div>
  );
}

function ExportPreview({ payload }: { payload: AgentExportPayload }) {
  if (payload.format === "checklist" && payload.checklistItems?.length) {
    return (
      <div className="mb-3 overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest/80">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-primary-fixed/55 text-primary">
            <Icon name="checklist" className="text-[20px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">旅行必备清单已写入行程详情页</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              共 {payload.checklistItems.length} 项，打开详情页的“旅行清单”查看。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest/80">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-on-surface">
            {payload.title}
          </p>
          <p className="text-xs text-on-surface-variant">
            {payload.format}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(payload.content)}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-on-primary"
        >
          复制
        </button>
      </div>
      <pre
        className="max-h-64 overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed"
        style={{ color: "var(--color-on-surface-variant)" }}
      >
        {payload.content}
      </pre>
    </div>
  );
}

function DestinationRecommendationCard({
  card,
  onPick,
}: {
  card: { title: string; intro: string; recommendations: { city: string; highlight: string; reason: string }[] };
  onPick: (city: string) => void;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-[20px] border border-outline-variant/60 bg-surface-container-lowest/86">
      <div className="border-b border-outline-variant/50 px-4 py-3">
        <p className="text-base font-semibold text-on-surface">{card.title}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{card.intro}</p>
      </div>
      <div className="space-y-2 p-3">
        {card.recommendations.map((item) => (
          <button
            key={item.city}
            type="button"
            onClick={() => onPick(`我想去${item.city}，继续帮我规划行程`)}
            className="w-full rounded-[14px] border border-outline-variant/50 bg-surface px-3 py-3 text-left transition-colors hover:bg-surface-container-low"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-on-surface">{item.city}</span>
              <span className="text-[11px] text-primary">{item.highlight}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{item.reason}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlaceGuideCard({ card }: { card: AgentPlaceGuideCardData }) {
  return (
    <div className="mb-3 overflow-hidden rounded-[24px] border border-outline-variant/60 bg-white shadow-[0_18px_44px_rgba(8,35,69,0.07)]">
      <div className="border-b border-outline-variant/50 px-4 py-4">
        <p className="text-xs font-medium tracking-[0.16em] text-primary">景点游玩攻略</p>
        <h3 className="mt-1 text-lg font-semibold text-on-surface">{card.title}</h3>
        <p className="mt-1 text-sm leading-6 text-on-surface-variant">{card.intro}</p>
        {card.bestTime && (
          <p className="mt-2 inline-flex rounded-full bg-primary-fixed/40 px-3 py-1 text-xs font-medium text-primary">
            推荐时间：{card.bestTime}
          </p>
        )}
      </div>

      <div className="grid gap-3 p-3">
        {card.spots.map((spot) => (
          <article
            key={`${card.placeName}-${spot.name}`}
            className="grid gap-3 overflow-hidden rounded-[18px] border border-outline-variant/45 bg-surface-container-lowest p-2 sm:grid-cols-[128px_1fr]"
          >
            {spot.imageUrl ? (
              <div
                className="h-[118px] rounded-[14px] bg-cover bg-center sm:h-full"
                style={{ backgroundImage: `url(${spot.imageUrl})` }}
                aria-hidden="true"
              />
            ) : (
              <div className="grid h-[118px] place-items-center rounded-[14px] bg-surface-container text-on-surface-variant sm:h-full">
                <Icon name="image_not_supported" className="text-[22px]" />
              </div>
            )}
            <div className="min-w-0 px-1 py-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-on-surface">{spot.name}</p>
                  <p className="mt-1 text-xs font-medium text-primary">{spot.highlight}</p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant">
                  {spot.duration}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-on-surface-variant">{spot.description}</p>
              <p className="mt-2 text-[11px] text-on-surface-variant">适合：{spot.suitableFor}</p>
            </div>
          </article>
        ))}
      </div>

      {card.tips.length > 0 && (
        <div className="border-t border-outline-variant/50 px-4 py-3">
          <p className="text-sm font-semibold text-on-surface">实用提醒</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {card.tips.map((tip) => (
              <span key={tip} className="rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-medium text-on-surface-variant">
                {tip}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}分钟`;
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

function getTransportVisual(option: TransportOption) {
  if (option.mode === "flight") {
    return {
      label: "飞机",
      icon: "flight",
      badgeClass: "bg-sky-50 text-sky-700",
      iconClass: "bg-sky-50 text-sky-600",
      selectedClass: "border-sky-300 bg-sky-50/70",
    };
  }
  if (option.mode === "bus") {
    return {
      label: "大巴",
      icon: "directions_bus",
      badgeClass: "bg-amber-50 text-amber-700",
      iconClass: "bg-amber-50 text-amber-600",
      selectedClass: "border-amber-300 bg-amber-50/70",
    };
  }
  if (option.mode === "car") {
    return {
      label: "自驾",
      icon: "directions_car",
      badgeClass: "bg-emerald-50 text-emerald-700",
      iconClass: "bg-emerald-50 text-emerald-600",
      selectedClass: "border-emerald-300 bg-emerald-50/70",
    };
  }

  const isHighSpeed = option.durationMinutes <= 420 || option.price >= 350;
  return isHighSpeed
    ? {
        label: "高铁/动车",
        icon: "train",
        badgeClass: "bg-indigo-50 text-indigo-700",
        iconClass: "bg-indigo-50 text-indigo-600",
        selectedClass: "border-indigo-300 bg-indigo-50/70",
      }
    : {
        label: "普速火车",
        icon: "train",
        badgeClass: "bg-violet-50 text-violet-700",
        iconClass: "bg-violet-50 text-violet-600",
        selectedClass: "border-violet-300 bg-violet-50/70",
      };
}

function TransportOptionRow({
  option,
  selected,
  onSelect,
}: {
  option: TransportOption;
  selected: boolean;
  onSelect?: () => void;
}) {
  const visual = getTransportVisual(option);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      className={cn(
        "grid min-h-[136px] w-full grid-cols-[36px_minmax(0,1fr)_70px] items-center gap-2 rounded-[18px] border bg-white px-3 py-3 text-left shadow-[0_8px_22px_rgba(16,24,32,0.04)] transition-all",
        onSelect && "hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_14px_32px_rgba(16,24,32,0.08)]",
        selected ? visual.selectedClass : "border-black/6"
      )}
    >
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-[12px]", visual.iconClass)}>
        <Icon name={visual.icon} className="text-[18px]" />
      </div>
      <div className="flex h-full min-w-0 flex-col justify-center">
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", visual.badgeClass)}>
            {visual.label}
          </span>
        </div>
        <div className="grid grid-cols-[44px_minmax(48px,1fr)_44px] items-center gap-2">
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-none text-on-surface">{option.departTime}</p>
            <p className="mt-1 truncate text-[11px] text-on-surface-variant">{option.fromName}</p>
          </div>
          <div className="min-w-0 text-center">
            <div className="flex items-center gap-1.5">
              <span className="h-px flex-1 bg-outline-variant/60" />
              <span className="shrink-0 text-[10px] font-medium text-on-surface-variant">
                {formatDuration(option.durationMinutes)}
              </span>
              <span className="h-px flex-1 bg-outline-variant/60" />
            </div>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-[16px] font-semibold leading-none text-on-surface">{option.arriveTime}</p>
            <p className="mt-1 truncate text-[11px] text-on-surface-variant">{option.toName}</p>
          </div>
        </div>
        <p className="mt-2 min-h-[32px] line-clamp-2 text-[11px] leading-4 text-on-surface-variant">
          {option.notes}
        </p>
      </div>
      <div className="flex h-[72px] min-w-0 flex-col justify-center border-l border-outline-variant/60 pl-2 text-right">
        <span className="block whitespace-nowrap text-[14px] font-semibold text-on-surface">
          ¥{option.price}
        </span>
        <span className="mt-1 block text-[10px] text-on-surface-variant">参考价</span>
      </div>
    </button>
  );
}

function TransportLegColumn({
  title,
  route,
  tag,
  options,
  selectedId,
  onSelect,
}: {
  title: string;
  route: string;
  tag: string;
  options: TransportOption[];
  selectedId?: string;
  onSelect?: (optionId: string) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{title}</p>
          <p className="mt-1 truncate text-xs text-on-surface-variant">{route}</p>
        </div>
        <span className="rounded-[6px] bg-surface-container px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-on-surface-variant">
          {tag}
        </span>
      </div>
      <div className="space-y-3">
        {options.map((option) => (
          <TransportOptionRow
            key={option.id}
            option={option}
            selected={selectedId === option.id}
            onSelect={onSelect ? () => onSelect(option.id) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

type QuestionFormItem = {
  field: string;
  index: number;
  question: string;
  options: string[];
  placeholder?: string;
  value?: string;
};

type QuestionCardData = {
  formItems?: QuestionFormItem[];
  summary?: string;
  confirmMode?: boolean;
  tripInfo?: {
    origin?: string;
    destination: string;
    startDate: string;
    endDate: string;
    dayCount: number;
    travelers: string;
    budget: string;
    preferences: string;
  };
};

const travelerOptions = [
  { label: "独行", value: "1人", icon: "person" },
  { label: "情侣", value: "情侣2人", icon: "favorite" },
  { label: "朋友", value: "3人", icon: "account_circle" },
  { label: "亲子", value: "一家人", icon: "weekend" },
  { label: "长辈", value: "带长辈2人", icon: "home" },
];

const defaultPreferenceOptions = ["美食探索", "自然风光", "历史文化", "城市漫步", "文艺探店", "购物休闲"];
const defaultBudgetOptions = ["¥3000以下", "¥3000-8000", "¥8000以上"];

function daysBetween(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return Number.isFinite(diff) && diff > 0 ? `${diff}天` : "";
}

function fieldValue(
  field: string,
  formItems: QuestionFormItem[] | undefined,
  answers: Record<string, string>
) {
  return answers[field] ?? formItems?.find((item) => item.field === field)?.value ?? "";
}

function formatTripInfoDate(startDate?: string, endDate?: string, dayCount?: string) {
  if (startDate && endDate) return `${startDate} ~ ${endDate}`;
  if (startDate) return startDate;
  return dayCount || "";
}

function TripInfoPanel({
  card,
  answers,
  setAnswers,
  onSubmit,
  onEdit,
  onStart,
}: {
  card: QuestionCardData;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  onSubmit?: (message: string) => void;
  onEdit?: () => void;
  onStart?: () => void;
}) {
  const formItems = card.formItems ?? [];
  const isConfirm = !!card.confirmMode && !!card.tripInfo;
  const isInteractive = !!onSubmit || !!onEdit || !!onStart;
  const origin = isConfirm
    ? card.tripInfo?.origin ?? ""
    : fieldValue("origin", formItems, answers);
  const destination = isConfirm
    ? card.tripInfo?.destination ?? ""
    : fieldValue("destination", formItems, answers);
  const startDate = isConfirm
    ? card.tripInfo?.startDate ?? ""
    : fieldValue("startDate", formItems, answers);
  const endDate = isConfirm
    ? card.tripInfo?.endDate ?? ""
    : fieldValue("endDate", formItems, answers);
  const dayCount = isConfirm
    ? `${card.tripInfo?.dayCount ?? ""}天`
    : daysBetween(startDate, endDate) || fieldValue("dayCount", formItems, answers);
  const travelers = isConfirm
    ? card.tripInfo?.travelers ?? ""
    : fieldValue("travelers", formItems, answers);
  const preferences = isConfirm
    ? card.tripInfo?.preferences ?? ""
    : fieldValue("preferences", formItems, answers);
  const budget = isConfirm
    ? card.tripInfo?.budget ?? ""
    : fieldValue("budget", formItems, answers);
  const preferenceOptions =
    formItems.find((item) => item.field === "preferences")?.options?.length
      ? formItems.find((item) => item.field === "preferences")!.options
      : defaultPreferenceOptions;
  const budgetOptions =
    formItems.find((item) => item.field === "budget")?.options?.length
      ? formItems.find((item) => item.field === "budget")!.options
      : defaultBudgetOptions;
  const isReady = !!destination && !!origin && (!!dayCount || (!!startDate && !!endDate)) && !!preferences;

  const updateAnswer = (field: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [field]: prev[field] === value ? "" : value }));
  };

  const submit = () => {
    const parts = [
      origin ? `出发地：${origin}` : "",
      destination ? `目的地：${destination}` : "",
      startDate ? `出发日期：${startDate}` : "",
      endDate ? `返回日期：${endDate}` : "",
      dayCount ? `天数：${dayCount}` : "",
      travelers ? `人数：${travelers}` : "",
      preferences ? `偏好：${preferences}` : "",
      budget ? `预算：${budget}` : "",
      answers.specialNeeds ? `特殊需求：${answers.specialNeeds}` : "",
    ].filter(Boolean);
    if (parts.length && onSubmit) onSubmit(`补充信息：${parts.join("；")}`);
  };

  return (
    <div className="overflow-hidden rounded-[26px] border border-outline-variant/60 bg-surface-container-lowest/90 shadow-[0_18px_48px_rgba(8,35,69,0.08)]">
      <div className="flex items-center justify-between border-b border-outline-variant/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-on-surface">旅行规划</p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            {!isInteractive ? "已提交的信息快照" : isConfirm ? "请确认信息后开始规划" : "先补全关键信息"}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{
            background: isReady ? "rgba(31,130,104,0.12)" : "var(--color-surface-container-low)",
            color: isReady ? "rgb(31,130,104)" : "var(--color-on-surface-variant)",
          }}
        >
          <Icon name={isReady ? "check_circle" : "info"} className="text-sm" />
          {isReady ? "已确认" : "待补充"}
        </span>
      </div>

      <div className="space-y-5 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(232,244,255,0.72)_55%,rgba(244,240,255,0.72))] p-4">
        <div className="grid gap-2 rounded-[22px] border border-white/80 bg-white/88 p-3 shadow-[0_10px_28px_rgba(8,35,69,0.06)] md:grid-cols-[1fr_auto_1fr_1fr_1fr]">
          <InfoInput label="出发地" icon="place" value={origin} readOnly={isConfirm || !isInteractive} placeholder="北京" onChange={(value) => setAnswers((prev) => ({ ...prev, origin: value }))} />
          <div className="hidden items-end justify-center pb-2 text-on-surface-variant md:flex">
            <Icon name="arrow_forward" className="text-base" />
          </div>
          <InfoInput label="目的地" icon="travel_explore" value={destination} readOnly={isConfirm || !isInteractive} placeholder="上海" onChange={(value) => setAnswers((prev) => ({ ...prev, destination: value }))} />
          <InfoInput label="出发日期" icon="edit_calendar" type="date" value={startDate} readOnly={isConfirm || !isInteractive} onChange={(value) => setAnswers((prev) => ({ ...prev, startDate: value }))} />
          <InfoInput label="返回日期" icon="weekend" type="date" value={endDate} readOnly={isConfirm || !isInteractive} onChange={(value) => setAnswers((prev) => ({ ...prev, endDate: value }))} />
        </div>

        {!isConfirm && isInteractive && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <section>
              <p className="mb-2 text-xs font-semibold text-on-surface">谁一起去？</p>
              <div className="grid grid-cols-5 gap-2">
                {travelerOptions.map((option) => {
                  const selected = travelers === option.value;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => updateAnswer("travelers", option.value)}
                      className="min-h-[72px] rounded-[18px] border px-2 py-2 text-center transition-all active:scale-95"
                      style={{
                        background: selected ? "var(--color-primary)" : "rgba(255,255,255,0.86)",
                        borderColor: selected ? "var(--color-primary)" : "var(--color-outline-variant)",
                        color: selected ? "var(--color-on-primary)" : "var(--color-on-surface)",
                      }}
                    >
                      <Icon name={option.icon} className="mx-auto mb-1 text-lg" filled={selected && option.icon === "favorite"} />
                      <span className="block text-[11px] font-medium">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs font-semibold text-on-surface">玩点什么？</p>
              <div className="flex flex-wrap gap-2">
                {preferenceOptions.map((option) => {
                  const selected = preferences === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => updateAnswer("preferences", option)}
                      className="rounded-full border px-3 py-2 text-xs font-medium transition-all active:scale-95"
                      style={{
                        background: selected ? "var(--color-primary)" : "rgba(255,255,255,0.86)",
                        borderColor: selected ? "var(--color-primary)" : "var(--color-outline-variant)",
                        color: selected ? "var(--color-on-primary)" : "var(--color-on-surface)",
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {isConfirm || !isInteractive ? (
          <div className="grid gap-2 text-xs text-on-surface-variant sm:grid-cols-3">
            <InfoSummary label="同行人" value={travelers || "未填写"} />
            <InfoSummary label="预算" value={budget || "未填写"} />
            <InfoSummary label="偏好" value={preferences || "未填写"} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-semibold text-on-surface">预算</p>
              <div className="flex flex-wrap gap-2">
                {budgetOptions.map((option) => {
                  const selected = budget === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => updateAnswer("budget", option)}
                      className="rounded-full border px-3 py-1.5 text-xs font-medium"
                      style={{
                        background: selected ? "var(--color-primary-container)" : "rgba(255,255,255,0.86)",
                        borderColor: selected ? "var(--color-primary)" : "var(--color-outline-variant)",
                        color: selected ? "var(--color-on-primary-container)" : "var(--color-on-surface)",
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              className="w-full rounded-[18px] border border-outline-variant bg-white/86 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
              value={answers.specialNeeds ?? ""}
              onChange={(event) => setAnswers((prev) => ({ ...prev, specialNeeds: event.target.value }))}
              placeholder="有什么特殊要求吗？比如不要太赶、老人小孩友好..."
            />
          </div>
        )}

        {isInteractive && (
          <div className="flex gap-2">
            {isConfirm ? (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex-1 rounded-full border border-outline-variant bg-white/76 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-white"
                >
                  继续修改
                </button>
                <button
                  type="button"
                  onClick={onStart}
                  className="flex-1 rounded-full bg-primary py-2.5 text-sm font-medium text-on-primary transition-opacity hover:opacity-90"
                >
                  开始规划
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!isReady}
                className="w-full rounded-full bg-primary py-2.5 text-sm font-medium text-on-primary transition-opacity disabled:opacity-40"
              >
                提交旅行信息
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoInput({
  label,
  icon,
  value,
  placeholder,
  type = "text",
  readOnly,
  onChange,
}: {
  label: string;
  icon: string;
  value: string;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openDatePicker = () => {
    if (type !== "date" || readOnly) return;
    inputRef.current?.showPicker?.();
    inputRef.current?.focus();
  };

  return (
    <label
      className={cn("block rounded-[14px]", type === "date" && !readOnly && "cursor-pointer")}
      onClick={openDatePicker}
    >
      <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-on-surface-variant">
        <Icon name={icon} className="text-xs" />
        {label}
      </span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-[14px] border border-transparent bg-transparent px-1 py-1.5 text-sm font-semibold text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/45 focus:border-primary/40 focus:bg-white/72",
          type === "date" && !readOnly && "cursor-pointer"
        )}
      />
    </label>
  );
}

function InfoSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/80 bg-white/70 px-3 py-2">
      <p className="text-[10px] text-on-surface-variant">{label}</p>
      <p className="mt-1 text-xs font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function TransportPlanCard({
  plan,
  onSelect,
  onContinue,
  canContinue,
}: {
  plan: TransportPlan;
  onSelect?: (direction: "outbound" | "return", optionId: string) => void;
  onContinue?: () => void;
  canContinue?: boolean;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_18px_48px_rgba(16,24,32,0.08)]">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Icon name="sync_alt" className="text-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">交通方案</p>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">
              {plan.origin} → {plan.destination}
              {plan.returnDate ? ` · ${plan.destination} → ${plan.origin}` : ""}
            </p>
          </div>
        </div>
        <Icon name="keyboard_arrow_up" className="shrink-0 text-[20px] text-on-surface-variant" />
      </div>

      <div className="grid gap-4 p-4 min-[1040px]:grid-cols-2">
        <TransportLegColumn
          title={`去程 · ${plan.departDate}`}
          route={`${plan.origin} → ${plan.destination}`}
          tag="DEPARTURE"
          options={plan.outboundOptions}
          selectedId={plan.selectedOutboundId}
          onSelect={onSelect ? (optionId) => onSelect("outbound", optionId) : undefined}
        />
        {plan.returnOptions.length > 0 && (
          <TransportLegColumn
            title={`回程 · ${plan.returnDate}`}
            route={`${plan.destination} → ${plan.origin}`}
            tag="RETURN"
            options={plan.returnOptions}
            selectedId={plan.selectedReturnId}
            onSelect={onSelect ? (optionId) => onSelect("return", optionId) : undefined}
          />
        )}
      </div>

      <div className="border-t border-outline-variant/50 px-4 py-3">
        <p className="rounded-[12px] bg-surface-container-low px-3 py-2 text-xs leading-5 text-on-surface-variant">
          {plan.fallbackPrompt}
        </p>
        {onContinue && (
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="mt-3 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            确认交通方案并继续规划
          </button>
        )}
        <p className="mt-2 text-[11px] leading-5 text-on-surface-variant">
          {plan.disclaimer}
        </p>
      </div>
    </div>
  );
}

function CandidatePlaceCard({
  candidate,
  selected,
  onToggle,
}: {
  candidate: SavedPlaceCandidate;
  selected: boolean;
  onToggle?: () => void;
}) {
  const tagLabel: Record<SavedPlaceCandidate["priorityTag"], string> = {
    must_go: "高优先",
    nearby_optional: "顺路",
    rainy_backup: "雨天",
    night_option: "夜间",
    food_candidate: "美食",
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      className={`w-full rounded-[16px] border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-primary bg-primary-fixed/45"
          : onToggle
            ? "border-outline-variant/50 bg-surface hover:bg-surface-container"
            : "border-outline-variant/50 bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-on-surface">{candidate.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">
            {candidate.reason}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary-fixed/55 px-2 py-1 text-[11px] font-medium text-primary">
          {tagLabel[candidate.priorityTag]}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
        <span className="truncate">{candidate.address || candidate.city}</span>
        <span className={selected ? "font-semibold text-primary" : ""}>
          {selected ? "已选" : onToggle ? "点选加入" : "未选择"}
        </span>
      </div>
    </button>
  );
}

function CandidateSelectionCard({
  candidates,
  selectedNames,
  onToggle,
  onContinue,
}: {
  candidates: SavedPlaceCandidate[];
  selectedNames: string[];
  onToggle?: (name: string) => void;
  onContinue?: () => void;
}) {
  const visibleCandidates = candidates.slice(0, 10);
  return (
    <div className="space-y-3 rounded-[24px] border border-outline-variant/60 bg-surface-container-high/72 p-4">
      <div>
        <p className="text-sm font-semibold text-on-surface">候选地点池</p>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">
          先选想加入行程的地点；也可以不选，我会从候选池里自动取舍。
        </p>
      </div>
      <div className="space-y-2">
        {visibleCandidates.map((candidate) => (
          <CandidatePlaceCard
            key={`${candidate.city}-${candidate.name}`}
            candidate={candidate}
            selected={selectedNames.includes(candidate.name)}
            onToggle={onToggle ? () => onToggle(candidate.name) : undefined}
          />
        ))}
      </div>
      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-all hover:opacity-90"
        >
          {selectedNames.length > 0 ? `确认 ${selectedNames.length} 个地点并继续规划` : "不选择地点，继续自动规划"}
        </button>
      )}
    </div>
  );
}

export function AgentPanel({ tripId, className, alwaysExpanded, workspaceComposer, onTripInfoChange }: Props) {
  const [input, setInput] = useState("");
  const [isOpen] = useState(alwaysExpanded ?? false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threadId = useAgentStore((s) => s.threadId);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const messages = useAgentStore((s) => s.messages);
  const timelineCards = useAgentStore((s) => s.timelineCards);
  const currentStep = useAgentStore((s) => s.currentStep);
  const streamingContent = useAgentStore((s) => s.streamingContent);
  const parsedPlaces = useAgentStore((s) => s.parsedPlaces);
  const needsConfirmation = useAgentStore((s) => s.needsConfirmation);
  const confirmationType = useAgentStore((s) => s.confirmationType);

  const addMessage = useAgentStore((s) => s.addMessage);
  const setStreaming = useAgentStore((s) => s.setStreaming);
  const handleSSEEvent = useAgentStore((s) => s.handleSSEEvent);
  const confirmPlacesAction = useAgentStore((s) => s.confirmPlaces);
  const rejectPlaces = useAgentStore((s) => s.rejectPlaces);
  const resetAgent = useAgentStore((s) => s.reset);
  const questionCard = useAgentStore((s) => s.questionCard);
  const tripCard = useAgentStore((s) => s.tripCard);
  const itineraryDraft = useAgentStore((s) => s.itineraryDraft);
  const inspirationItems = useAgentStore((s) => s.inspirationItems);
  const savedPlaceCandidates = useAgentStore((s) => s.savedPlaceCandidates);
  const selectedCandidateNames = useAgentStore((s) => s.selectedCandidateNames);
  const toggleCandidateSelection = useAgentStore((s) => s.toggleCandidateSelection);
  const transportPlan = useAgentStore((s) => s.transportPlan);
  const exportPayload = useAgentStore((s) => s.exportPayload);
  const selectTransportOption = useAgentStore((s) => s.selectTransportOption);
  const setCandidatePreviewPlaces = useMapStore((s) => s.setCandidatePreviewPlaces);
  const clearCandidatePreviewPlaces = useMapStore((s) => s.clearCandidatePreviewPlaces);
  const currentTrip = useTripStore((s) => s.currentTrip);
  const saveTrip = useTripStore((s) => s.saveTrip);
  const setCurrentTrip = useTripStore((s) => s.setCurrentTrip);
  const applyGeneratedChecklist = useTripChecklistStore((s) => s.applyGeneratedChecklist);
  const userProfile = useUserStore((s) => s.userProfile);
  const currentUserId = resolveClientUserId(userProfile?.id || currentTrip?.userId);
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({});
  const appliedDraftRef = useRef<string>("");
  const appliedChecklistRef = useRef<string>("");

  useEffect(() => {
    if (!onTripInfoChange) return;

    if (questionCard?.tripInfo) {
      onTripInfoChange({
        destination: questionCard.tripInfo.destination,
        date: formatTripInfoDate(questionCard.tripInfo.startDate, questionCard.tripInfo.endDate, `${questionCard.tripInfo.dayCount}天`),
        travelers: questionCard.tripInfo.travelers,
        budget: questionCard.tripInfo.budget,
      });
      return;
    }

    if (questionCard?.formItems?.length) {
      const startDate = fieldValue("startDate", questionCard.formItems, formAnswers);
      const endDate = fieldValue("endDate", questionCard.formItems, formAnswers);
      onTripInfoChange({
        destination: fieldValue("destination", questionCard.formItems, formAnswers),
        date: formatTripInfoDate(startDate, endDate, fieldValue("dayCount", questionCard.formItems, formAnswers)),
        travelers: fieldValue("travelers", questionCard.formItems, formAnswers),
        budget: fieldValue("budget", questionCard.formItems, formAnswers),
      });
      return;
    }

    if (tripCard) {
      onTripInfoChange({
        destination: tripCard.destination,
        date: tripCard.dates,
        travelers: tripCard.travelers,
        budget: tripCard.budget,
      });
      return;
    }

    if (currentTrip) {
      onTripInfoChange({
        destination: currentTrip.destination,
        date: formatTripInfoDate(currentTrip.startDate, currentTrip.endDate, `${currentTrip.days.length}天`),
        travelers: `${currentTrip.travelers.adults + currentTrip.travelers.children}人`,
        budget: `¥${currentTrip.budget.min}-${currentTrip.budget.max}`,
      });
      return;
    }

    onTripInfoChange({});
  }, [currentTrip, formAnswers, onTripInfoChange, questionCard, tripCard]);

  useEffect(() => {
    if (!tripId) return;
    appliedDraftRef.current = "";
    resetAgent();
  }, [tripId, resetAgent]);

  useEffect(() => {
    if (confirmationType === "candidates" && savedPlaceCandidates.length > 0) {
      setCandidatePreviewPlaces(savedPlaceCandidates.slice(0, 10));
      return;
    }
    if (itineraryDraft?.days?.length) return;
    clearCandidatePreviewPlaces();
  }, [confirmationType, itineraryDraft, savedPlaceCandidates, setCandidatePreviewPlaces, clearCandidatePreviewPlaces]);

  useEffect(() => {
    if (exportPayload?.format !== "checklist" || !exportPayload.checklistItems?.length) return;
    const targetTripId = exportPayload.tripId || tripId || currentTrip?.id;
    if (!targetTripId) return;

    const signature = `${targetTripId}:${exportPayload.title}:${exportPayload.checklistItems.map((item) => `${item.categoryId}:${item.label}`).join("|")}`;
    if (appliedChecklistRef.current === signature) return;
    applyGeneratedChecklist(targetTripId, exportPayload.checklistItems);
    appliedChecklistRef.current = signature;
  }, [applyGeneratedChecklist, currentTrip?.id, exportPayload, tripId]);

  const currentStepName = normalizeAgentStep(currentStep);
  const progressPhase = (() => {
    if (!isStreaming) return "complete" as const;
    if (currentStepName === "recommend_destinations") return "recommend_destinations" as const;
    if (currentStepName === "plan_transport") return "plan_transport" as const;
    if (currentStepName === "research_inspiration") return "research_inspiration" as const;
    if (currentStepName === "extract_places") return "extract_places" as const;
    if (currentStepName === "budget_check") return "budget_check" as const;
    if (currentStepName === "critique_itinerary") return "critique_itinerary" as const;
    if (currentStepName === "generate_itinerary") return "generate_itinerary" as const;
    if (currentStepName === "save_version") return "save_version" as const;
    if (currentStepName === "confirm_places") return "confirm" as const;
    return "parse" as const;
  })();

  const insightLines = [
    inspirationItems.length > 0 ? `已汇总 ${inspirationItems.length} 条攻略摘要` : "",
    savedPlaceCandidates.length > 0 ? `已提炼 ${savedPlaceCandidates.length} 个候选地点` : "",
    currentStepName === "budget_check" ? "正在确保活动预估费用落在预算区间内" : "",
    currentStepName === "plan_transport" ? "正在先确认大交通时间，避免第一天和最后一天排得不合理" : "",
    currentStepName === "critique_itinerary" ? "正在检查时间、路线、预算和天气适配" : "",
    currentStepName === "generate_itinerary" ? "正在根据候选地点池生成每日安排" : "",
    currentStepName === "save_version" ? "正在把结果写入行程并生成可查看卡片" : "",
  ].filter(Boolean);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, timelineCards]);

  useEffect(() => {
    if (!tripId || !currentTrip || currentTrip.id !== tripId || !itineraryDraft?.days?.length) return;
    const signature = JSON.stringify(
      itineraryDraft.days.map((day) => ({
        dayIndex: day.dayIndex,
        date: day.date,
        activities: day.activities.map((activity) => ({
          order: activity.order,
          name: activity.customName || activity.poi?.name || "",
          startTime: activity.startTime,
          endTime: activity.endTime,
        })),
      }))
    );
    if (appliedDraftRef.current === signature) return;
    appliedDraftRef.current = signature;

    const updatedTrip = {
      ...currentTrip,
      days: itineraryDraft.days,
      status: "generated" as const,
      updatedAt: new Date().toISOString(),
    };
    saveTrip(updatedTrip);
    setCurrentTrip(updatedTrip);
  }, [tripId, currentTrip, itineraryDraft, saveTrip, setCurrentTrip]);

  const processSSEStream = async (
    response: Response
  ) => {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        try {
          const event = JSON.parse(jsonStr);
          handleSSEEvent(event);
        } catch {
          // Skip unparseable events
        }
      }
    }
  };

  const handleSend = async (overrideMessage?: string) => {
    const msg = overrideMessage ?? input.trim();
    if (!msg || isStreaming) return;

    if (!overrideMessage) setInput("");
    addMessage({
      id: createId("message"),
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    });
    setStreaming(true);

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          message: msg,
          tripId: tripId,
          userId: currentUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Agent API error: ${response.status}`
        );
      }

      await processSSEStream(response);
    } catch (err) {
      handleSSEEvent({
        type: "error",
        message: `请求失败: ${(err as Error).message}`,
      });
    }

    setStreaming(false);
  };

  const handleConfirmPlaces = async (
    confirmed: ConfirmedPlace[],
    removedIds: string[]
  ) => {
    confirmPlacesAction(confirmed, removedIds);
    setStreaming(true);

    try {
      const response = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          tripId,
          userId: currentUserId,
          decision: {
            confirmedPlaces: confirmed,
            removedPlaceIds: removedIds,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Confirm API error: ${response.status}`
        );
      }

      await processSSEStream(response);
    } catch (err) {
      handleSSEEvent({
        type: "error",
        message: `确认失败: ${(err as Error).message}`,
      });
    }

    setStreaming(false);
  };

  const handleConfirmTransport = async () => {
    if (!transportPlan || isStreaming) return;
    setStreaming(true);

    try {
      const response = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          tripId,
          userId: currentUserId,
          decision: {
            transportSelection: {
              selectedOutboundId: transportPlan.selectedOutboundId,
              selectedReturnId: transportPlan.selectedReturnId,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Confirm API error: ${response.status}`);
      }

      await processSSEStream(response);
    } catch (err) {
      handleSSEEvent({
        type: "error",
        message: `确认交通失败: ${(err as Error).message}`,
      });
    }

    setStreaming(false);
  };

  const handleConfirmCandidates = async () => {
    if (isStreaming) return;
    setStreaming(true);

    try {
      const response = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          tripId,
          userId: currentUserId,
          decision: {
            selectedCandidateNames,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Confirm API error: ${response.status}`);
      }

      clearCandidatePreviewPlaces();
      await processSSEStream(response);
    } catch (err) {
      handleSSEEvent({
        type: "error",
        message: `确认候选地点失败: ${(err as Error).message}`,
      });
    }

    setStreaming(false);
  };

  const handleReject = () => {
    rejectPlaces();
    addMessage({
      id: createId("message"),
      role: "agent",
      content: "已清除识别的地点，你可以重新粘贴。",
      timestamp: new Date().toISOString(),
    });
  };

  const timelineItems = [
    ...(messages ?? []).map((message) => ({
      id: message.id,
      createdAt: message.timestamp,
      kind: "message" as const,
      message,
    })),
    ...timelineCards.map((card) => ({
      id: card.id,
      createdAt: card.createdAt,
      kind: "card" as const,
      card,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const isConversationEmpty = timelineItems.length === 0 && !isStreaming && !needsConfirmation;

  const hasLaterInteraction = (card: AgentTimelineCard) => {
    const cardTime = new Date(card.createdAt).getTime();
    return timelineItems.some((item) => item.id !== card.id && new Date(item.createdAt).getTime() > cardTime);
  };

  const renderTimelineCard = (card: AgentTimelineCard) => {
    if (card.kind === "trip") return <TripCardDisplay card={card.data} />;
    if (card.kind === "question") {
      const isCurrentCard = questionCard === card.data;
      const active = isCurrentCard && !isStreaming && !hasLaterInteraction(card);
      return (
        <TripInfoPanel
          card={card.data}
          answers={isCurrentCard ? formAnswers : {}}
          setAnswers={active ? setFormAnswers : (() => {}) as Dispatch<SetStateAction<Record<string, string>>>}
          onSubmit={active ? (message) => { handleSend(message); } : undefined}
          onEdit={active ? () => handleSend("修改信息") : undefined}
          onStart={active ? () => handleSend("开始规划") : undefined}
        />
      );
    }
    if (card.kind === "transport") {
      const active = !isStreaming && !hasLaterInteraction(card) && confirmationType === "transport" && transportPlan?.origin === card.data.origin && transportPlan.destination === card.data.destination;
      const plan = active && transportPlan ? transportPlan : card.data;
      return (
        <TransportPlanCard
          plan={plan}
          onSelect={active ? selectTransportOption : undefined}
          onContinue={active ? handleConfirmTransport : undefined}
          canContinue={!!plan.selectedOutboundId && (plan.returnOptions.length === 0 || !!plan.selectedReturnId)}
        />
      );
    }
    if (card.kind === "candidates") {
      const active = !isStreaming && !hasLaterInteraction(card) && confirmationType === "candidates";
      return (
        <CandidateSelectionCard
          candidates={card.data}
          selectedNames={selectedCandidateNames}
          onToggle={active ? toggleCandidateSelection : undefined}
          onContinue={active ? handleConfirmCandidates : undefined}
        />
      );
    }
    if (card.kind === "destination_recommendation") {
      return <DestinationRecommendationCard card={card.data} onPick={handleSend} />;
    }
    if (card.kind === "place_guide") {
      return <PlaceGuideCard card={card.data} />;
    }
    return <ExportPreview payload={card.data} />;
  };

  return (
      <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-xl border border-outline-variant/50 bg-transparent transition-all",
        workspaceComposer ? "h-full min-h-0" : isOpen ? "h-[600px]" : "h-auto",
        className
      )}
    >
      {/* Messages area */}
          <div className={cn(
            "flex-1 space-y-3 overflow-y-auto",
            workspaceComposer ? "px-4 pb-40 pt-6 lg:px-6" : "px-4 py-3"
          )}>
            {isConversationEmpty && (
              <div className="flex min-h-full items-start px-3 pt-[12vh] md:px-10 md:pt-[16vh]">
                <div className="max-w-[520px]">
                  <p className="text-2xl font-semibold tracking-tight text-[#101820] md:text-3xl">
                    嘿！准备好出发了吗？
                  </p>
                  <p className="mt-2 text-base font-medium leading-7 text-[#71808c] md:text-lg">
                    我是 NomTrail，你的旅行好搭档！想去哪里？
                  </p>
                </div>
              </div>
            )}

            {timelineItems.map((item) =>
              item.kind === "message" ? (
                <div
                  key={item.id}
                  className={cn(
                    workspaceComposer ? "max-w-[96%]" : "max-w-[85%]",
                    "rounded-[20px] px-4 py-3 text-sm shadow-[0_8px_24px_rgba(8,35,69,0.04)]",
                    item.message.role === "user"
                      ? "ml-auto text-white"
                      : "text-[var(--color-on-surface-variant)]"
                  )}
                  style={item.message.role === "user" ? { background: "var(--color-primary)" } : { background: "rgba(255,255,255,0.82)", border: "1px solid rgba(191,208,223,0.64)" }}
                >
                  {item.message.role === "user" ? item.message.content : <MessageContent text={item.message.content} />}
                </div>
              ) : (
                <div key={item.id}>
                  {renderTimelineCard(item.card)}
                </div>
              )
            )}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className={cn(workspaceComposer ? "max-w-[96%]" : "max-w-[85%]")}>
                <ReasoningProgress
                  active={isStreaming}
                  phase={progressPhase}
                  status={STEP_LABELS[currentStep || "START"] || streamingContent || "处理中"}
                  insightLines={insightLines}
                />
              </div>
            )}

            {/* Place Confirmation */}
            {needsConfirmation &&
              confirmationType === "places" &&
              (parsedPlaces?.length ?? 0) > 0 && (
                <div className="rounded-[24px] border border-outline-variant/60 bg-surface-container-high/72 p-4">
                  <PlaceConfirmation
                    places={parsedPlaces}
                    onConfirm={handleConfirmPlaces}
                    onReject={handleReject}
                  />
                </div>
              )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className={cn(
            workspaceComposer
              ? "absolute bottom-5 left-6 right-6 z-30 border-0 p-0 lg:left-10 lg:right-10"
              : "border-t border-outline-variant/50 px-4 py-3"
          )}>
            <div className={cn(
              "flex gap-2",
              workspaceComposer && "items-center rounded-[22px] border border-outline-variant/70 bg-white px-2.5 py-2 shadow-[0_18px_50px_rgba(16,31,51,0.14)]"
            )}>
              {workspaceComposer && (
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
                  aria-label="添加内容"
                >
                  <Icon name="add" className="text-[18px]" />
                </button>
              )}
              <input
                className={cn(
                  "flex-1 rounded-full bg-transparent px-3 py-1.5 text-sm focus:outline-none",
                  workspaceComposer ? "focus:ring-0" : "focus:ring-1"
                )}
                style={{
                  border: workspaceComposer ? "0" : "1px solid var(--color-outline-variant)",
                  color: "var(--color-on-surface)",
                }}
                placeholder={
                  needsConfirmation
                    ? "请先确认或清除地点..."
                    : "输入消息..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={needsConfirmation}
              />
              <button
                onClick={() => handleSend()}
                disabled={
                  isStreaming || !input.trim() || needsConfirmation
                }
                className={cn(
                  "rounded-full text-sm font-medium transition-all disabled:opacity-40",
                  workspaceComposer ? "flex h-9 w-9 items-center justify-center px-0 py-0" : "px-5 py-2.5"
                )}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                }}
              >
                {workspaceComposer ? <Icon name="send" className="text-[16px]" /> : "发送"}
              </button>
            </div>
          </div>
    </div>
  );
}
