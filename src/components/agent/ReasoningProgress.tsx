"use client";

import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";

type PhaseKey =
  | "idle"
  | "parse"
  | "recommend_destinations"
  | "confirm"
  | "plan_transport"
  | "research_inspiration"
  | "extract_places"
  | "budget_check"
  | "critique_itinerary"
  | "generate_itinerary"
  | "save_version"
  | "complete";

interface Props {
  active: boolean;
  phase: PhaseKey;
  status: string;
  insightLines?: string[];
  className?: string;
}

const STAGE_LABELS: { key: PhaseKey; label: string; icon: string }[] = [
  { key: "parse", label: "分析需求", icon: "manage_search" },
  { key: "plan_transport", label: "规划交通", icon: "sync_alt" },
  { key: "research_inspiration", label: "搜索灵感", icon: "travel_explore" },
  { key: "extract_places", label: "提炼地点", icon: "location_on" },
  { key: "budget_check", label: "校验预算", icon: "payments" },
  { key: "critique_itinerary", label: "检查行程", icon: "fact_check" },
  { key: "generate_itinerary", label: "生成行程", icon: "route" },
  { key: "save_version", label: "保存结果", icon: "bookmark_added" },
];

const PHASE_META: Record<PhaseKey, { label: string; icon: string }> = {
  idle: { label: "准备开始规划", icon: "auto_awesome" },
  parse: { label: "正在理解旅行需求", icon: "manage_search" },
  recommend_destinations: { label: "正在整理推荐", icon: "travel_explore" },
  confirm: { label: "正在等待确认信息", icon: "rule" },
  plan_transport: { label: "正在规划往返交通", icon: "sync_alt" },
  research_inspiration: { label: "正在搜索旅行灵感", icon: "travel_explore" },
  extract_places: { label: "正在提炼候选地点", icon: "location_on" },
  budget_check: { label: "正在校验预算", icon: "payments" },
  critique_itinerary: { label: "正在检查行程可行性", icon: "fact_check" },
  generate_itinerary: { label: "正在生成个性化行程", icon: "route" },
  save_version: { label: "正在保存行程结果", icon: "bookmark_added" },
  complete: { label: "规划已完成", icon: "check_circle" },
};

function stageIcon(stage: { key: PhaseKey; icon: string }, isDone: boolean, isActive: boolean) {
  if (isDone) return "check";
  if (isActive) return PHASE_META[stage.key]?.icon ?? stage.icon;
  return stage.icon;
}

export function ReasoningProgress({
  active,
  phase,
  status,
  insightLines = [],
  className,
}: Props) {
  const currentMeta = PHASE_META[phase] ?? PHASE_META.parse;
  const activeIndex = STAGE_LABELS.findIndex((item) => item.key === phase);
  const readableStatus = status || currentMeta.label;
  const isRecommendation = phase === "recommend_destinations";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[22px] border border-black/10 bg-white px-4 py-3 shadow-[0_18px_44px_rgba(16,24,32,0.08)]",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#eef6ff)] shadow-[inset_0_0_0_1px_rgba(23,33,43,0.08),0_10px_26px_rgba(30,96,180,0.12)]">
          <span className="absolute inset-1.5 rounded-full border border-blue-100" />
          <span className="absolute -right-0.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-[14px] bg-white text-blue-600 shadow-sm",
              active && "animate-pulse"
            )}
          >
            <Icon name={currentMeta.icon} className="text-[19px]" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full border border-blue-500" />
              {isRecommendation ? "AI RECOMMEND" : "AI PLANNING"}
            </span>
            <Icon name="play_arrow" className="shrink-0 text-[14px] text-cyan-600" filled />
            <p className="truncate text-sm font-semibold text-on-surface">
              {readableStatus}
              {active ? "..." : ""}
            </p>
          </div>

          {!isRecommendation && (
            <div className="mt-2 flex items-center gap-2 overflow-hidden">
              {STAGE_LABELS.map((stage, index) => {
              const isDone = phase === "complete" || (activeIndex >= 0 && activeIndex > index);
              const isActive = phase === stage.key;
              const iconName = stageIcon(stage, isDone, isActive);

              return (
                <span
                  key={stage.key}
                  className={cn(
                    "relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-all duration-300",
                    isActive
                      ? "scale-110 border-blue-200 bg-blue-50 text-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.08)] motion-safe:animate-pulse"
                      : isDone
                        ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                        : "border-transparent bg-transparent text-on-surface-variant/30"
                  )}
                  title={stage.label}
                >
                  {isActive && (
                    <span className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-white/80 to-transparent motion-safe:animate-[progress-scan_1.25s_ease-in-out_infinite]" />
                  )}
                  <Icon
                    name={iconName}
                    className={cn("relative text-[12px]", isActive && "motion-safe:animate-[progress-pop_1.25s_ease-in-out_infinite]")}
                  />
                </span>
              );
              })}
            </div>
          )}
        </div>
      </div>

      {insightLines.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-outline-variant/45 pt-2">
          {insightLines.slice(0, 3).map((line, index) => (
            <span
              key={`${line}-${index}`}
              className="rounded-full bg-surface-container-low px-2 py-1 text-[11px] text-on-surface-variant"
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
