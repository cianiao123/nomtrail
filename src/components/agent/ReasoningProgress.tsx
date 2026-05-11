"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";

type PhaseKey =
  | "idle"
  | "parse"
  | "confirm"
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

const STAGE_LABELS = [
  { key: "parse", label: "分析需求" },
  { key: "research_inspiration", label: "搜索攻略" },
  { key: "extract_places", label: "提炼地点" },
  { key: "budget_check", label: "预算校验" },
  { key: "generate_itinerary", label: "生成行程" },
  { key: "save_version", label: "保存结果" },
] as const;

function getDisplayedPhase(phase: PhaseKey, elapsedMs: number) {
  if (phase === "complete") {
    return { phase: "complete" as const, progress: 100 };
  }

  if (phase === "confirm") {
    const seconds = elapsedMs / 1000;
    if (seconds < 10) return { phase: "research_inspiration" as const, progress: 28 };
    if (seconds < 22) return { phase: "extract_places" as const, progress: 52 };
    if (seconds < 34) return { phase: "budget_check" as const, progress: 68 };
    if (seconds < 44) return { phase: "generate_itinerary" as const, progress: 84 };
    return { phase: "save_version" as const, progress: 94 };
  }

  switch (phase) {
    case "parse":
      return { phase, progress: 12 };
    case "research_inspiration":
      return elapsedMs > 12000
        ? { phase: "extract_places" as const, progress: 48 }
        : { phase, progress: 30 };
    case "extract_places":
      return { phase, progress: 56 };
    case "budget_check":
      return { phase, progress: 68 };
    case "critique_itinerary":
      return { phase, progress: 76 };
    case "generate_itinerary":
      return { phase, progress: 90 };
    case "save_version":
      return { phase, progress: 96 };
    default:
      return { phase: "parse" as const, progress: 10 };
  }
}

export function ReasoningProgress({
  active,
  phase,
  status,
  insightLines = [],
  className,
}: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active, phase]);

  const model = useMemo(
    () => getDisplayedPhase(phase, elapsedMs),
    [phase, elapsedMs]
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-3",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-on-surface">执行进度</p>
          <p className="text-xs text-on-surface-variant mt-1">{status}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-primary">
          {model.progress}%
        </span>
      </div>

      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${model.progress}%` }}
        />
      </div>

      <div className="grid grid-cols-6 gap-2">
        {STAGE_LABELS.map((stage, index) => {
          const activeIndex = STAGE_LABELS.findIndex(
            (item) => item.key === model.phase
          );
          const isDone = model.phase === "complete" || activeIndex > index;
          const isActive = model.phase === stage.key;

          return (
            <div key={stage.key} className="space-y-1">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  isDone || isActive ? "bg-primary" : "bg-outline-variant"
                )}
              />
              <p
                className={cn(
                  "text-[11px] leading-tight",
                  isDone || isActive ? "text-on-surface" : "text-on-surface-variant"
                )}
              >
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>

      {insightLines.length > 0 && (
        <div className="rounded-lg bg-surface px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium text-on-surface-variant">
            思考摘要
          </p>
          {insightLines.slice(0, 4).map((line, index) => (
            <p key={`${line}-${index}`} className="text-xs text-on-surface-variant">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
