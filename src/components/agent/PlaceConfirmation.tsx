"use client";

import { useState } from "react";
import type { ParsedPlace, ConfirmedPlace } from "@/types/agent";
import { cn } from "@/lib/utils/cn";

interface Props {
  places: ParsedPlace[];
  onConfirm: (confirmed: ConfirmedPlace[], removedIds: string[]) => void;
  onReject: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  attraction: "景点",
  food: "美食",
  hotel: "酒店",
  transport: "交通",
  other: "其他",
};

const PRIORITY_COLORS: Record<string, string> = {
  must_go: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  want_to_go:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  optional:
    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  must_go: "必去",
  want_to_go: "正在路上",
  optional: "备选",
};

export function PlaceConfirmation({ places, onConfirm, onReject }: Props) {
  const [editedPlaces, setEditedPlaces] = useState<ParsedPlace[]>(
    places.map((p) => ({ ...p }))
  );
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const visiblePlaces = editedPlaces.filter(
    (p) => !removedIds.has(p.id)
  );

  const toggleRemove = (id: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updatePlace = (
    id: string,
    field: keyof ParsedPlace,
    value: string | number
  ) => {
    setEditedPlaces((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      )
    );
  };

  const handleConfirm = () => {
    const confirmed: ConfirmedPlace[] = visiblePlaces.map((p) => ({
      ...p,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
    }));
    onConfirm(confirmed, Array.from(removedIds));
  };

  if (places.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        没有识别到地点。请粘贴包含地点名称的文本。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
        确认以下地点信息，可以编辑或删除不需要的地点。
      </div>

      {visiblePlaces.map((place) => {
        const isRemoved = removedIds.has(place.id);
        return (
          <div
            key={place.id}
            className={cn(
              "relative border rounded-lg p-3 transition-all",
              isRemoved
                ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20 opacity-60"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            )}
          >
            <div className="flex items-start gap-3">
              {/* Priority badge */}
              <span
                className={cn(
                  "shrink-0 text-xs px-1.5 py-0.5 rounded font-medium",
                  PRIORITY_COLORS[place.priority]
                )}
              >
                {PRIORITY_LABELS[place.priority]}
              </span>

              <div className="flex-1 min-w-0">
                {/* Name */}
                <input
                  className="w-full font-medium text-sm bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-slate-900 dark:text-slate-100"
                  value={place.name}
                  onChange={(e) =>
                    updatePlace(place.id, "name", e.target.value)
                  }
                  disabled={isRemoved}
                />

                {/* Category + Duration */}
                <div className="flex items-center gap-2 mt-1.5">
                  <select
                    className="text-xs border rounded px-1.5 py-0.5 bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    value={place.category}
                    onChange={(e) =>
                      updatePlace(place.id, "category", e.target.value)
                    }
                    disabled={isRemoved}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>

                  <input
                    className="text-xs w-16 text-center border rounded px-1 py-0.5 bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    type="number"
                    min={0}
                    placeholder="时长"
                    value={place.estimatedDuration ?? ""}
                    onChange={(e) =>
                      updatePlace(
                        place.id,
                        "estimatedDuration",
                        Number(e.target.value)
                      )
                    }
                    disabled={isRemoved}
                  />
                  <span className="text-xs text-slate-400">分钟</span>
                </div>

                {/* Source text */}
                {place.sourceText && (
                  <div className="mt-1 text-xs text-slate-400 truncate">
                    &ldquo;{place.sourceText}&rdquo;
                  </div>
                )}
              </div>

              {/* Remove button */}
              <button
                onClick={() => toggleRemove(place.id)}
                className={cn(
                  "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm transition-colors",
                  isRemoved
                    ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:bg-slate-800 dark:hover:bg-red-900/30"
                )}
                title={isRemoved ? "恢复" : "删除"}
              >
                {isRemoved ? "↩" : "×"}
              </button>
            </div>
          </div>
        );
      })}

      {visiblePlaces.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">
          所有地点已标记删除
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={handleConfirm}
          className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors"
        >
          确认 {visiblePlaces.length} 个地点 · 开始生成行程
        </button>
        <button
          onClick={onReject}
          className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
        >
          全部清除
        </button>
      </div>
    </div>
  );
}
