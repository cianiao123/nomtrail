"use client";

import type { ItineraryVersion, DaySnapshot, ActivitySnapshot } from "@/types/agent";
import { cn } from "@/lib/utils/cn";

interface Props {
  versions: ItineraryVersion[];
  currentVersionNumber: number;
  onSwitchVersion?: (versionId: string) => void;
}

/** Compare two day snapshots and highlight differences */
function diffDays(
  oldDays: DaySnapshot[] | undefined,
  newDays: DaySnapshot[]
): {
  dayIndex: number;
  date: string;
  added: ActivitySnapshot[];
  removed: ActivitySnapshot[];
  unchanged: number;
}[] {
  const result = [];
  const maxDays = Math.max(oldDays?.length ?? 0, newDays.length);

  for (let i = 0; i < maxDays; i++) {
    const oldDay = oldDays?.[i];
    const newDay = newDays[i];

    if (!oldDay) {
      result.push({
        dayIndex: newDay.dayIndex,
        date: newDay.date,
        added: newDay.activities,
        removed: [],
        unchanged: 0,
      });
    } else if (!newDay) {
      result.push({
        dayIndex: oldDay.dayIndex,
        date: oldDay.date,
        added: [],
        removed: oldDay.activities,
        unchanged: 0,
      });
    } else {
      const oldNames = new Set(oldDay.activities.map((a) => a.name));
      const newNames = new Set(newDay.activities.map((a) => a.name));
      const added = newDay.activities.filter((a) => !oldNames.has(a.name));
      const removed = oldDay.activities.filter((a) => !newNames.has(a.name));
      const unchanged =
        newDay.activities.length > added.length
          ? newDay.activities.length - added.length
          : oldDay.activities.length - removed.length;

      if (added.length > 0 || removed.length > 0) {
        result.push({
          dayIndex: newDay.dayIndex,
          date: newDay.date,
          added,
          removed,
          unchanged,
        });
      }
    }
  }

  return result;
}

export function VersionDiff({
  versions,
  currentVersionNumber,
  onSwitchVersion,
}: Props) {
  const sorted = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber
  );
  const current = versions.find(
    (v) => v.versionNumber === currentVersionNumber
  );
  const previous =
    current && current.parentVersionId
      ? versions.find((v) => v.versionId === current.parentVersionId)
      : sorted.length > 1
        ? sorted[1]
        : undefined;

  const diffs =
    current && previous
      ? diffDays(previous.days, current.days)
      : [];

  if (versions.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400 text-sm">
        暂无版本历史
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Version timeline */}
      <div className="space-y-1">
        {sorted.map((v, i) => (
          <button
            key={v.versionId}
            onClick={() => onSwitchVersion?.(v.versionId)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
              v.versionNumber === currentVersionNumber
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400"
            )}
          >
            <span className="font-mono text-xs w-8 shrink-0">v{v.versionNumber}</span>
            <span className="flex-1 truncate">{v.changeDescription}</span>
            <span className="text-xs opacity-50 shrink-0">{v.createdAt?.slice(0, 10)}</span>
            {v.isCurrent && (
              <span className="text-[10px] px-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                当前
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Diff view */}
      {diffs.length > 0 && previous && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500 mb-2">
            对比 v{previous.versionNumber} → v{current?.versionNumber ?? "?"}
          </div>
          <div className="space-y-2">
            {diffs.map((d) => (
              <div
                key={d.dayIndex}
                className="rounded-lg bg-slate-50 dark:bg-slate-900 p-2 text-xs"
              >
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Day {d.dayIndex}
                </div>
                {d.added.map((a, i) => (
                  <div
                    key={`add-${i}`}
                    className="flex items-center gap-1 text-green-600 dark:text-green-400 pl-2"
                  >
                    <span className="text-[10px]">+</span>
                    <span>{a.name}</span>
                  </div>
                ))}
                {d.removed.map((a, i) => (
                  <div
                    key={`rem-${i}`}
                    className="flex items-center gap-1 text-red-500 dark:text-red-400 pl-2 line-through"
                  >
                    <span className="text-[10px]">−</span>
                    <span>{a.name}</span>
                  </div>
                ))}
                {d.unchanged > 0 && (
                  <div className="text-slate-400 pl-2">
                    {d.unchanged} 个活动不变
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
