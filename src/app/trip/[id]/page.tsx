"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTripStore } from "@/stores/tripStore";
import { useMapStore } from "@/stores/mapStore";
import { Icon } from "@/components/shared/Icon";
import { formatDate, getDayOfWeek } from "@/lib/utils/dateFormat";
import { cn } from "@/lib/utils/cn";
import { createId } from "@/lib/utils/createId";
import { Day, Activity, Trip } from "@/types/trip";
import type { WeatherResponse } from "@/types/weather";
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import { AddActivityForm } from "@/components/trip/AddActivityForm";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { VersionDiff } from "@/components/agent/VersionDiff";
import { AgentActionLog } from "@/components/agent/AgentActionLog";
import { useAgentStore } from "@/stores/agentStore";
import {
  useTripChecklistStore,
  type ChecklistCategory,
  type ChecklistCategoryId,
} from "@/stores/tripChecklistStore";
import { Modal } from "@/components/shared/Modal";
import dynamic from "next/dynamic";

const MapPanel = dynamic(() => import("@/components/trip/MapPanel").then((m) => m.MapPanel), {
  ssr: false,
});

function MapPlaceholder() {
  return (
    <div className="hidden flex-1 items-center justify-center bg-surface-container lg:flex">
      <div className="text-center">
        <Icon name="map" className="text-[80px] mb-4 opacity-20" weight={100} />
        <p className="font-headline-sm text-headline-sm opacity-40">地图视图</p>
      </div>
    </div>
  );
}

function addDays(date: string, offset: number) {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function computeEndDate(startDate: string, dayCount: number) {
  return addDays(startDate, Math.max(0, dayCount - 1));
}

function normalizeDisplayDays(days: Day[] | undefined): Day[] {
  return (days ?? []).map((day, index) => ({
    ...day,
    dayIndex: typeof day.dayIndex === "number" ? day.dayIndex : index,
    activities: Array.isArray(day.activities) ? day.activities : [],
  }));
}

function syncTripDaysWithMeta(
  trip: Trip,
  startDate: string,
  dayCount: number
): { trip: Trip | null; error?: string } {
  const targetCount = Math.max(1, dayCount);
  const sortedDays = normalizeDisplayDays(trip.days).sort((a, b) => a.dayIndex - b.dayIndex);

  if (targetCount < sortedDays.length) {
    const removedDays = sortedDays.slice(targetCount);
    if (removedDays.some((day) => day.activities.length > 0)) {
      return { trip: null, error: "后面几天还有活动，暂时不能直接缩短天数。请先清理这些天的活动。" };
    }
  }

  const nextDays = sortedDays
    .slice(0, targetCount)
    .map((day, index) => ({
      ...day,
      dayIndex: index,
      date: addDays(startDate, index),
      updatedAt: new Date().toISOString(),
    }));

  while (nextDays.length < targetCount) {
    const index = nextDays.length;
    nextDays.push({
      id: createId("day"),
      tripId: trip.id,
      dayIndex: index,
      date: addDays(startDate, index),
      activities: [],
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    trip: {
      ...trip,
      startDate,
      endDate: computeEndDate(startDate, targetCount),
      days: nextDays,
      updatedAt: new Date().toISOString(),
    },
  };
}

import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface POISuggestion {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
}

interface AddActivityInput {
  type: string;
  customName: string;
  poi: POISuggestion | null;
  startTime: string;
  endTime: string;
  notes: string;
  estimatedCost: number;
}

function DayTabDropButton({
  day,
  index,
  isSelected,
  onClick,
}: {
  day: Day;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-drop-${day.id}` });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0 rounded-t-lg px-4 py-3 text-left text-[1.05rem] font-medium text-on-surface-variant transition-colors hover:text-on-surface",
        isSelected && "text-on-surface",
        isOver && "bg-primary-fixed/45 text-primary"
      )}
    >
      Day {index + 1}
      <span className="ml-2 text-sm text-on-surface-variant">
        {day.date ? `(${day.date.slice(5)})` : ""}
      </span>
      <span
        className={cn(
          "absolute bottom-[-1px] left-0 h-0.5 bg-on-surface transition-all",
          isSelected || isOver ? "w-full opacity-100" : "w-0 opacity-0"
        )}
      />
    </button>
  );
}

/* ====== Activity Card ====== */
function SortableActivityCard({
  activity,
  onRemove,
  onEdit,
}: {
  activity: Activity;
  onRemove: (id: string) => void;
  onEdit: (activity: Activity) => void;
}) {
  const setActivePOI = useMapStore((s) => s.setActivePOI);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex cursor-pointer items-center gap-4 border-b border-outline-variant/55 px-1 py-4 transition-colors last:border-b-0 hover:bg-surface-container-low/70"
      onClick={() => {
        setActivePOI(activity.id);
        onEdit(activity);
      }}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-on-surface-variant hover:text-primary touch-none"
      >
        <Icon name="drag_indicator" className="text-[18px]" />
      </button>
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary-fixed/70 bg-primary-fixed/45">
        <Icon
          name={ACTIVITY_TYPE_ICONS[activity.type] || "place"}
          className="text-[18px] text-primary"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-2 font-label-md text-on-surface">
          <span className="truncate">
            {activity.poi?.name || activity.customName || ACTIVITY_TYPE_LABELS[activity.type]}
          </span>
          {(activity.sourceReason?.includes("心愿地") || activity.notes?.includes("心愿地")) && (
            <span className="inline-flex flex-shrink-0 items-center rounded-md bg-[rgba(236,112,142,0.14)] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[#b84564]">
              心愿地
            </span>
          )}
          {activity.weatherFit === "indoor" && (
            <span className="inline-flex flex-shrink-0 items-center rounded-md bg-primary-fixed/55 px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-primary">
              室内优先
            </span>
          )}
        </p>
        <p className="font-caption text-on-surface-variant">
          {activity.startTime && `${activity.startTime} - ${activity.endTime}`}
          {activity.estimatedCost ? ` | ¥${activity.estimatedCost}` : ""}
        </p>
        {activity.notes && (
          <div className="relative mt-1 inline-block max-w-full group/details">
            <p className="line-clamp-2 text-[0.84rem] leading-6 text-on-surface-variant">
              {activity.notes}
            </p>
            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden max-w-[420px] rounded-lg border border-outline-variant/80 bg-white/96 px-3 py-2 text-[0.82rem] leading-6 text-on-surface shadow-[0_18px_40px_rgba(15,31,51,0.16)] group-hover/details:block">
              {activity.notes}
            </div>
          </div>
        )}
        {(activity.openingHours || activity.bookingRequired || activity.weatherFit && activity.weatherFit !== "any" && activity.weatherFit !== "indoor") && (
          <p className="font-caption text-on-surface-variant truncate">
            {activity.openingHours ? `开放时间 ${activity.openingHours}` : ""}
            {activity.bookingRequired ? `${activity.openingHours ? " | " : ""}需预约` : ""}
            {activity.weatherFit && activity.weatherFit !== "any"
              ? `${activity.openingHours || activity.bookingRequired ? " | " : ""}${activity.weatherFit === "rainy" ? "雨天友好" : activity.weatherFit === "night" ? "夜间适配" : "晴天更佳"}`
              : ""}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(activity.id);
        }}
        className="text-error/45 transition-colors hover:text-error"
      >
        <Icon name="delete" className="text-[18px]" />
      </button>
    </div>
  );
}

/* ====== Day Card ====== */
function DayCard({
  day,
  dayIndex,
  isSelected,
  onSelect,
  onRemoveActivity,
  onOpenForm,
  onEditActivity,
}: {
  day: Day;
  dayIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemoveActivity: (id: string) => void;
  onOpenForm: (dayId: string) => void;
  onEditActivity: (activity: Activity) => void;
}) {
  const activities = Array.isArray(day.activities) ? day.activities : [];
  const activityIds = activities.map((a) => a.id);

  return (
    <div className={cn("transition-all", !isSelected && "hidden")} onClick={onSelect}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">
            {day.date ? `${formatDate(day.date)} ${getDayOfWeek(day.date)}` : "日期待定"}
          </p>
          <h2 className="font-display text-[1.65rem] leading-tight text-on-surface">Day {dayIndex + 1} 概览</h2>
        </div>
        <div className="pb-1 text-right">
          <p className="font-label-md text-label-md tracking-[0.16em] text-on-surface">{activities.length} 个活动</p>
          {day.weather && (
            <p className="mt-1 font-caption text-on-surface-variant">
              {day.weather.tempLow}°~{day.weather.tempHigh}° {day.weather.condition}
            </p>
          )}
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-outline-variant/70 bg-white/62 px-6 py-8 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-surface-container text-primary">
            <Icon name="edit_calendar" className="text-[28px]" />
          </div>
          <h3 className="mb-2 text-[1.22rem] font-medium text-on-surface">今天还是空白</h3>
          <p className="max-w-[440px] text-[0.95rem] leading-7 text-on-surface-variant">
            为 Day {dayIndex + 1} 添加景点、餐厅、交通或休息时间，慢慢把这一天排成真正可出发的路线。
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenForm(day.id);
            }}
            className="mt-6 inline-flex items-center gap-3 rounded-xl bg-primary px-7 py-3 font-label-md text-label-md text-white shadow-[0_16px_34px_rgba(8,35,69,0.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(8,35,69,0.24)] active:scale-[0.98]"
          >
            <Icon name="add" className="text-[20px]" />
            添加活动
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-outline-variant/70 bg-white/62 px-5">
          <SortableContext
            items={activityIds}
            strategy={verticalListSortingStrategy}
          >
            {[...activities]
              .sort((a, b) => a.order - b.order)
              .map((activity) => (
                <SortableActivityCard
                  key={activity.id}
                  activity={activity}
                  onRemove={onRemoveActivity}
                  onEdit={onEditActivity}
                />
              ))}
          </SortableContext>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenForm(day.id);
            }}
            className="my-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant py-3 font-caption text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
          >
            <Icon name="add" className="text-[16px]" />
            添加活动
          </button>
        </div>
      )}
    </div>
  );
}

/* ====== Weather Panel ====== */
function WeatherPanel({ days, isLoading }: { days: Day[]; isLoading?: boolean }) {
  const displayWeatherDays = normalizeDisplayDays(days);
  const daysWithWeather = displayWeatherDays.filter((d) => d.weather);

  return (
    <div className="luxury-card rounded-[24px] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-headline-sm text-headline-sm text-on-surface">天气预报</h3>
        <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-[11px] font-medium text-on-surface-variant">
          {daysWithWeather.length > 0 ? `${daysWithWeather.length} 天` : isLoading ? "更新中" : "待更新"}
        </span>
      </div>

      {daysWithWeather.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {displayWeatherDays.map((day) => (
            <div key={day.id} className="flex min-w-[60px] flex-col items-center">
              <span className="font-caption text-on-surface-variant">Day {day.dayIndex + 1}</span>
              {day.weather ? (
                <>
                  <Icon
                    name={day.weather.condition.includes("雨") ? "rainy" : day.weather.condition.includes("晴") ? "wb_sunny" : "partly_cloudy_day"}
                    className="my-1 text-[22px] text-primary"
                  />
                  <span className="font-caption font-medium">{day.weather.tempHigh}°</span>
                  <span className="font-caption text-on-surface-variant">{day.weather.tempLow}°</span>
                  <span className="mt-1 max-w-[64px] truncate text-[11px] text-on-surface-variant">{day.weather.condition}</span>
                </>
              ) : (
                <>
                  <Icon name="cloud_queue" className="my-1 text-[22px] text-on-surface-variant/45" />
                  <span className="font-caption font-medium text-on-surface-variant">--°</span>
                  <span className="font-caption text-on-surface-variant/70">待更新</span>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-outline-variant/70 bg-white/54 px-3 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-primary-fixed/45 text-primary">
              <Icon name={isLoading ? "sync" : "partly_cloudy_day"} className={cn("text-[20px]", isLoading && "animate-spin")} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface">
                {isLoading ? "正在获取天气" : "暂无天气数据"}
              </p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                天气会用于判断雨天备选、室内活动和每天出行舒适度。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====== Budget Estimate ====== */
function BudgetEstimate({ days }: { days: Day[] }) {
  const safeDays = normalizeDisplayDays(days);
  const totalActivities = safeDays.reduce((sum, d) => sum + d.activities.length, 0);
  const totalCost = days.reduce(
    (sum, d) => sum + (Array.isArray(d.activities) ? d.activities : []).reduce((s, a) => s + (a.estimatedCost || 0), 0),
    0
  );
  const transportCost = safeDays.reduce(
    (sum, d) => sum + d.activities.reduce((s, a) => s + (a.type === "transport" ? a.estimatedCost || 0 : 0), 0),
    0
  );
  const lodgingCost = safeDays.reduce(
    (sum, d) => sum + d.activities.reduce((s, a) => s + (a.type === "hotel" ? a.estimatedCost || 0 : 0), 0),
    0
  );
  const diningCost = Math.max(0, totalCost - transportCost - lodgingCost);

  return (
    <div className="rounded-xl border border-outline-variant/70 bg-white/66 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-[1.35rem] font-medium leading-none text-on-surface">预算预估</p>
        <span className="font-caption text-on-surface-variant">{totalActivities} 个活动</span>
      </div>
      <div className="mb-4 flex items-end gap-2">
        <span className="font-display text-[2rem] leading-none text-on-surface">¥{totalCost.toLocaleString()}</span>
        <span className="pb-1 text-xs text-on-surface-variant">预计</span>
      </div>
      <div className="divide-y divide-outline-variant/55">
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="flex items-center gap-3 text-on-surface-variant">
            <Icon name="flight" className="text-[16px]" />
            交通
          </span>
          <span className="font-medium text-on-surface">¥{transportCost.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="flex items-center gap-3 text-on-surface-variant">
            <Icon name="hotel" className="text-[16px]" />
            住宿
          </span>
          <span className="font-medium text-on-surface">¥{lodgingCost.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between py-2.5 text-sm">
          <span className="flex items-center gap-3 text-on-surface-variant">
            <Icon name="restaurant" className="text-[16px]" />
            餐饮与活动
          </span>
          <span className="font-medium text-on-surface">¥{diningCost.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

/* ====== AI Action Bar ====== */
function AIActionBar({ onToggleAgent }: { onToggleAgent: () => void }) {
  const isStreaming = useAgentStore((s) => s.isStreaming);

  return (
    <button onClick={onToggleAgent} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-label-md text-label-md text-white shadow-[0_16px_36px_rgba(8,35,69,0.20)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(8,35,69,0.26)] active:scale-95">
      <Icon name="auto_awesome" className="text-[18px]" />
      AI 助手
      {isStreaming && (
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
    </button>
  );
}

function checklistToneClass(tone: ChecklistCategory["tone"]) {
  const tones = {
    blue: "from-blue-50 to-sky-50 text-blue-600",
    violet: "from-violet-50 to-indigo-50 text-violet-600",
    rose: "from-rose-50 to-pink-50 text-rose-600",
    amber: "from-amber-50 to-yellow-50 text-amber-600",
  };
  return tones[tone];
}

function TravelChecklistView({
  categories,
  onToggle,
  onAdd,
}: {
  categories: ChecklistCategory[];
  onToggle: (categoryId: ChecklistCategoryId, itemId: string) => void;
  onAdd: (categoryId: ChecklistCategoryId, label: string) => void;
}) {
  const [draftText, setDraftText] = useState("");
  const [activeAddCategory, setActiveAddCategory] = useState<ChecklistCategoryId | null>(null);

  const submitDraft = (categoryId: ChecklistCategoryId) => {
    if (!draftText.trim()) return;
    onAdd(categoryId, draftText);
    setDraftText("");
    setActiveAddCategory(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {categories.map((category) => {
          const done = category.items.filter((item) => item.checked).length;
          const isAdding = activeAddCategory === category.id;
          return (
            <section
              key={category.id}
              className="overflow-hidden rounded-[24px] border border-outline-variant/60 bg-white shadow-[0_18px_44px_rgba(8,35,69,0.06)]"
            >
              <div className={cn("flex items-center justify-between bg-gradient-to-br px-5 py-4", checklistToneClass(category.tone))}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-white/78 shadow-sm">
                    <Icon
                      name={category.id === "todo" ? "edit_note" : category.id === "documents" ? "payments" : category.id === "clothing" ? "weekend" : "notifications"}
                      className="text-[18px]"
                    />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-on-surface">{category.title}</h3>
                    <p className="mt-1 text-xs text-on-surface-variant">{category.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-white/86 px-2.5 py-1 text-xs font-semibold text-on-surface-variant">
                    {done}/{category.items.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAddCategory(isAdding ? null : category.id);
                      setDraftText("");
                    }}
                    className="grid h-9 w-9 place-items-center rounded-[12px] bg-white/86 text-on-surface shadow-sm transition-colors hover:bg-white"
                    aria-label={`添加${category.title}清单项`}
                  >
                    <Icon name={isAdding ? "close" : "add"} className="text-[19px]" />
                  </button>
                </div>
              </div>
              <div className="space-y-1 px-5 py-5">
                {isAdding && (
                  <div className="mb-3 flex items-center gap-2 rounded-[14px] border border-outline-variant/60 bg-surface-container-low p-2">
                    <input
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitDraft(category.id);
                        if (event.key === "Escape") {
                          setDraftText("");
                          setActiveAddCategory(null);
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-on-surface outline-none placeholder:text-on-surface-variant/55"
                      placeholder={`添加到${category.title}...`}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => submitDraft(category.id)}
                      disabled={!draftText.trim()}
                      className="grid h-9 w-9 place-items-center rounded-[10px] bg-on-surface text-white transition-opacity disabled:opacity-35"
                      aria-label="确认添加"
                    >
                      <Icon name="check" className="text-[18px]" />
                    </button>
                  </div>
                )}
                {category.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2.5 transition-colors hover:bg-surface-container-low"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => onToggle(category.id, item.id)}
                      className="h-5 w-5 rounded border-outline-variant accent-primary"
                    />
                    <span className={cn("text-sm font-medium", item.checked ? "text-on-surface-variant line-through" : "text-on-surface")}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Generate placeholder days from date range */
function generatePlaceholderDays(startDate?: string, endDate?: string): Day[] {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const count = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return {
      id: `placeholder-${i}`,
      tripId: "",
      dayIndex: i,
      date: d.toISOString().slice(0, 10),
      activities: [],
      createdAt: "",
      updatedAt: "",
    };
  });
}

/* ====== Trip Detail Page Wrapper ====== */

function TripDetailContent() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;

  const currentTrip = useTripStore((s) => s.currentTrip);
  const loadTrip = useTripStore((s) => s.loadTrip);
  const setCurrentTrip = useTripStore((s) => s.setCurrentTrip);
  const clearCurrentTrip = useTripStore((s) => s.clearCurrentTrip);
  const saveTrip = useTripStore((s) => s.saveTrip);
  const addActivity = useTripStore((s) => s.addActivity);
  const updateActivity = useTripStore((s) => s.updateActivity);
  const removeActivity = useTripStore((s) => s.removeActivity);
  const selectedDayIndex = useMapStore((s) => s.selectedDayIndex);
  const setSelectedDay = useMapStore((s) => s.setSelectedDay);

  // Agent panel — toggleable
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [activeTripTab, setActiveTripTab] = useState<"itinerary" | "checklist">("itinerary");
  const [showMetaEditor, setShowMetaEditor] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaStartDate, setMetaStartDate] = useState("");
  const [metaDayCount, setMetaDayCount] = useState(1);
  const [metaAdults, setMetaAdults] = useState(1);
  const [metaChildren, setMetaChildren] = useState(0);
  const [metaError, setMetaError] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);
  const agentVersions = useAgentStore((s) => s.versions);
  const agentCurrentVN = useAgentStore((s) => s.currentVersionNumber);
  const agentLogs = useAgentStore((s) => s.actionLog);
  const ensureChecklist = useTripChecklistStore((s) => s.ensureChecklist);
  const checklistCategories = useTripChecklistStore((s) => s.checklistsByTripId[tripId] ?? []);
  const toggleChecklistItem = useTripChecklistStore((s) => s.toggleItem);
  const addChecklistItem = useTripChecklistStore((s) => s.addItem);

  const [loadingTrip, setLoadingTrip] = useState(true);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Load cached trip quickly, then always refresh from API to avoid stale localStorage data.
  useEffect(() => {
    let cancelled = false;
    const stored = loadTrip(tripId);

    if (stored) {
      setCurrentTrip(stored);
    } else {
      queueMicrotask(() => {
        if (!cancelled) setLoadingTrip(true);
      });
      if (currentTrip?.id !== tripId) {
        clearCurrentTrip();
      }
    }

    fetch(`/api/trips/${tripId}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          saveTrip(res.data);
          setCurrentTrip(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTrip(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ensureChecklist(tripId);
  }, [ensureChecklist, tripId]);

  const trip = currentTrip?.id === tripId ? currentTrip : null;
  // Generate placeholder days from date range if no days exist yet
  const normalizedTripDays = normalizeDisplayDays(trip?.days);
  const displayDays = normalizedTripDays.length > 0
    ? normalizedTripDays
    : generatePlaceholderDays(trip?.startDate, trip?.endDate);
  const derivedDayCount = trip
    ? Math.max(
        normalizedTripDays.length || 0,
        Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000) + 1
      )
    : 1;
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  useEffect(() => {
    if (!trip?.destination || !trip.days?.length) return;
    const days = normalizeDisplayDays(trip.days);
    if (days.some((day) => day.weather)) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setIsWeatherLoading(true);
    });
    fetch(`/api/weather?${new URLSearchParams({ destination: trip.destination, days: String(Math.min(4, days.length)) })}`)
      .then((res) => res.ok ? res.json() : null)
      .then((payload: { success?: boolean; data?: WeatherResponse } | null) => {
        if (cancelled || !payload?.success || !payload.data?.forecasts?.length) return;
        const weatherByDate = new Map(payload.data.forecasts.map((forecast) => [forecast.date, forecast]));
        const updatedTrip: Trip = {
          ...trip,
          days: days.map((day) => {
            const forecast = weatherByDate.get(day.date);
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
              updatedAt: new Date().toISOString(),
            };
          }),
          updatedAt: new Date().toISOString(),
        };
        saveTrip(updatedTrip);
        setCurrentTrip(updatedTrip);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsWeatherLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [saveTrip, setCurrentTrip, trip]);

  useEffect(() => {
    if (!trip || !showMetaEditor) return;
    queueMicrotask(() => {
      setMetaTitle(trip.title);
      setMetaStartDate(trip.startDate);
      setMetaDayCount(derivedDayCount);
      setMetaAdults(trip.travelers.adults);
      setMetaChildren(trip.travelers.children);
      setMetaError("");
    });
  }, [trip, showMetaEditor, derivedDayCount]);

  const handleAddActivity = (formData: AddActivityInput) => {
    if (!trip) return;
    const dayId = addingToDay || editingActivity?.dayId;
    if (!dayId) return;

    if (editingActivity) {
      updateActivity(editingActivity.id, {
        type: formData.type as Activity["type"],
        poi: formData.poi
          ? {
              amapId: formData.poi.id,
              name: formData.poi.name,
              address: formData.poi.address,
              coordinate: { lat: formData.poi.lat, lng: formData.poi.lng },
              category: editingActivity.poi?.category || "",
              photos: editingActivity.poi?.photos || [],
            }
          : null,
        customName: formData.customName,
        startTime: formData.startTime,
        endTime: formData.endTime,
        notes: formData.notes,
        estimatedCost: formData.estimatedCost,
      });
      setEditingActivity(null);
      setAddingToDay(null);
      return;
    }

    const newAct: Activity = {
      id: createId("activity"),
      dayId,
      order: (displayDays.find((d) => d.id === dayId)?.activities.length ?? 0) * 1000 + 1000,
      type: formData.type as Activity["type"],
      poi: formData.poi ? {
        amapId: formData.poi.id,
        name: formData.poi.name,
        address: formData.poi.address,
        coordinate: { lat: formData.poi.lat, lng: formData.poi.lng },
        category: "",
        photos: [],
      } : null,
      customName: formData.customName,
      startTime: formData.startTime,
      endTime: formData.endTime,
      notes: formData.notes,
      estimatedCost: formData.estimatedCost,
      isGenerated: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!trip.days.some((day) => day.id === dayId)) {
      const materializedDays = displayDays.map((day, index) => ({
        ...day,
        tripId: trip.id,
        dayIndex: index,
        notes: day.notes ?? "",
        activities: day.id === dayId ? [{ ...newAct, order: 1000 }] : day.activities,
        createdAt: day.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      const updatedTrip = { ...trip, days: materializedDays, updatedAt: new Date().toISOString() };
      saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    } else {
      addActivity(dayId, newAct);
    }
    setAddingToDay(null);
  };

  if (!trip && loadingTrip) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center animate-pulse">
          <div className="h-16 w-16 bg-surface-container-high rounded-full mx-auto mb-4" />
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">加载中...</h2>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Icon name="map" className="text-[64px] text-outline-variant mb-4" weight={200} />
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2">未找到行程</h2>
          <p className="font-body-md text-on-surface-variant mb-6">该行程不存在或已被删除</p>
          <button
            onClick={() => router.push("/create")}
            className="bg-primary text-on-primary rounded-xl px-6 py-3 font-label-md hover:shadow-lg transition-all"
          >
            去创建新行程
          </button>
        </div>
      </div>
    );
  }

  const selectedDay = displayDays[selectedDayIndex] ?? displayDays[0];

  function handleActivityDragEnd(event: DragEndEvent) {
    if (!trip) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const sourceDay = normalizeDisplayDays(trip.days).find((day) =>
      day.activities.some((activity) => activity.id === activeId)
    );
    if (!sourceDay) return;

    const targetDayId = overId.startsWith("day-drop-")
      ? overId.replace("day-drop-", "")
      : normalizeDisplayDays(trip.days).find((day) => day.activities.some((activity) => activity.id === overId))?.id;
    if (!targetDayId) return;

    const targetDay = trip.days.find((day) => day.id === targetDayId);
    const movedActivity = sourceDay.activities.find((activity) => activity.id === activeId);
    if (!targetDay || !movedActivity) return;

    const now = new Date().toISOString();
    const normalizeOrder = (activities: Activity[]) =>
      activities.map((activity, index) => ({
        ...activity,
        order: (index + 1) * 1000,
        updatedAt: now,
      }));

    const sourceActivities = [...sourceDay.activities]
      .sort((a, b) => a.order - b.order)
      .filter((activity) => activity.id !== activeId);
    const targetActivities = sourceDay.id === targetDay.id
      ? sourceActivities
      : [...targetDay.activities].sort((a, b) => a.order - b.order);
    const rawInsertIndex = overId.startsWith("day-drop-")
      ? targetActivities.length
      : targetActivities.findIndex((activity) => activity.id === overId);
    const insertIndex = rawInsertIndex >= 0 ? rawInsertIndex : targetActivities.length;

    targetActivities.splice(
      insertIndex,
      0,
      { ...movedActivity, dayId: targetDay.id, updatedAt: now }
    );

    const updatedTrip = {
      ...trip,
      days: trip.days.map((day) => {
        if (day.id === sourceDay.id && day.id !== targetDay.id) {
          return { ...day, activities: normalizeOrder(sourceActivities), updatedAt: now };
        }
        if (day.id === targetDay.id) {
          return { ...day, activities: normalizeOrder(targetActivities), updatedAt: now };
        }
        return day;
      }),
      updatedAt: now,
    };

    saveTrip(updatedTrip);
    setCurrentTrip(updatedTrip);
    const nextIndex = updatedTrip.days.findIndex((day) => day.id === targetDay.id);
    if (nextIndex >= 0) setSelectedDay(nextIndex);
  }

  async function handleSaveMeta() {
    if (!trip) return;
    const title = metaTitle.trim();
    if (!title) {
      setMetaError("行程名称不能为空。");
      return;
    }
    if (!metaStartDate) {
      setMetaError("请选择出发日期。");
      return;
    }

    const synced = syncTripDaysWithMeta(
      {
        ...trip,
        title,
        travelers: { adults: Math.max(1, metaAdults), children: Math.max(0, metaChildren) },
      },
      metaStartDate,
      metaDayCount
    );

    if (!synced.trip) {
      setMetaError(synced.error ?? "基础信息更新失败。");
      return;
    }

    const updatedTrip: Trip = {
      ...synced.trip,
      title,
      travelers: {
        adults: Math.max(1, metaAdults),
        children: Math.max(0, metaChildren),
      },
      updatedAt: new Date().toISOString(),
    };

    setIsSavingMeta(true);
    setMetaError("");
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTrip),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "保存失败");
      }
      saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
      if (selectedDayIndex > updatedTrip.days.length - 1) {
        setSelectedDay(Math.max(0, updatedTrip.days.length - 1));
      }
      setShowMetaEditor(false);
    } catch (err) {
      setMetaError((err as Error).message || "保存失败，请稍后再试。");
    } finally {
      setIsSavingMeta(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fbfdff_0%,#f4f8fc_100%)] pb-24">
      <header className="border-b border-outline-variant/60 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-5 lg:px-8">
          <div className="flex items-center gap-5">
            <button
              onClick={() => router.back()}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-on-surface transition-colors hover:bg-surface-container"
              aria-label="返回"
            >
              <Icon name="arrow_back" className="text-[24px]" />
            </button>
            <div>
              <h1 className="font-display text-[2rem] leading-none text-on-surface">{trip.title}</h1>
              <p className="mt-2 text-sm font-medium text-on-surface">
                {trip.destination} · {trip.startDate} ~ {trip.endDate} · {trip.travelers.adults + trip.travelers.children}人
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <button
              onClick={() => setShowMetaEditor(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-outline-variant/70 bg-white/70 text-on-surface transition-colors hover:bg-surface-container"
              aria-label="编辑基础信息"
            >
              <Icon name="more_horiz" className="text-[24px]" />
            </button>
          </div>
        </div>
      </header>

      <Modal
        open={showMetaEditor}
        onClose={() => {
          if (!isSavingMeta) setShowMetaEditor(false);
        }}
        title="编辑基础信息"
        className="max-w-[560px]"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-on-surface">行程名称</span>
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/70 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                placeholder="例如：北京之旅"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-on-surface">出发日期</span>
              <input
                type="date"
                value={metaStartDate}
                onChange={(e) => setMetaStartDate(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/70 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-on-surface">天数</span>
              <input
                type="number"
                min={1}
                max={30}
                value={metaDayCount}
                onChange={(e) => setMetaDayCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-outline-variant/70 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-on-surface">成人</span>
              <input
                type="number"
                min={1}
                max={20}
                value={metaAdults}
                onChange={(e) => setMetaAdults(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-outline-variant/70 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-on-surface">儿童</span>
              <input
                type="number"
                min={0}
                max={20}
                value={metaChildren}
                onChange={(e) => setMetaChildren(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-outline-variant/70 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
              />
            </label>
          </div>

          <div className="rounded-xl border border-outline-variant/60 bg-surface-container/70 px-4 py-3 text-sm text-on-surface-variant">
            结束日期会根据出发日期和天数自动更新为 <span className="font-medium text-on-surface">{metaStartDate ? computeEndDate(metaStartDate, metaDayCount) : "-"}</span>。
          </div>

          {metaError && (
            <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
              {metaError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowMetaEditor(false)}
              className="rounded-xl border border-outline-variant/70 px-4 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
              disabled={isSavingMeta}
            >
              取消
            </button>
            <button
              onClick={handleSaveMeta}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSavingMeta}
            >
              {isSavingMeta ? "保存中..." : "保存修改"}
            </button>
          </div>
        </div>
      </Modal>

      <div className="mx-auto grid max-w-[1440px] gap-8 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-8">
        <main className="min-w-0">
          <div className="mb-5 flex min-h-[52px] gap-2 overflow-x-auto rounded-[18px] border border-outline-variant/60 bg-white/78 p-1 shadow-[0_12px_30px_rgba(8,35,69,0.04)]">
            {[
              { id: "itinerary" as const, label: "每日行程", icon: "map" },
              { id: "checklist" as const, label: "旅行清单", icon: "check_circle" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTripTab(tab.id)}
                className={cn(
                  "flex min-w-[120px] items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium transition-colors",
                  activeTripTab === tab.id
                    ? "bg-primary text-white shadow-[0_10px_24px_rgba(8,35,69,0.12)]"
                    : "text-on-surface-variant hover:bg-surface-container-low"
                )}
              >
                <Icon name={tab.icon} className="text-[16px]" />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTripTab === "itinerary" ? (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragEnd={handleActivityDragEnd}
              >
                <div className="mb-5 flex min-h-[58px] gap-6 overflow-x-auto border-b border-outline-variant/70">
                  {displayDays.map((day, i) => (
                    <DayTabDropButton
                      key={day.id}
                      day={day}
                      index={i}
                      isSelected={selectedDayIndex === i}
                      onClick={() => setSelectedDay(i)}
                    />
                  ))}
                </div>

                {selectedDay && (
                  <DayCard
                    key={selectedDay.id}
                    day={selectedDay}
                    dayIndex={selectedDayIndex}
                    isSelected
                    onSelect={() => setSelectedDay(selectedDayIndex)}
                    onRemoveActivity={removeActivity}
                    onOpenForm={(dayId) => {
                      setEditingActivity(null);
                      setAddingToDay(dayId);
                    }}
                    onEditActivity={(activity) => {
                      setAddingToDay(activity.dayId);
                      setEditingActivity(activity);
                    }}
                  />
                )}
              </DndContext>

              {addingToDay && (
                <AddActivityForm
                  dayId={addingToDay}
                  cityName={trip?.destination || ""}
                  onAdd={handleAddActivity}
                  onClose={() => {
                    setAddingToDay(null);
                    setEditingActivity(null);
                  }}
                  initialActivity={editingActivity}
                />
              )}
            </>
          ) : (
            <TravelChecklistView
              categories={checklistCategories}
              onToggle={(categoryId, itemId) => toggleChecklistItem(trip.id, categoryId, itemId)}
              onAdd={(categoryId, label) => addChecklistItem(trip.id, categoryId, label)}
            />
          )}
        </main>

        <aside className="space-y-5 lg:sticky lg:top-1.5 lg:-mt-5 lg:flex lg:h-[calc(100vh-96px)] lg:min-h-[600px] lg:flex-col lg:self-start lg:space-y-5">
          <div className="relative h-[260px] overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container shadow-[0_24px_54px_rgba(8,35,69,0.08)] lg:h-auto lg:flex-[3]">
            <Suspense fallback={<MapPlaceholder />}>
              <MapPanel />
            </Suspense>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,27,51,0.08),rgba(7,27,51,0.24))]" />
            <div className="absolute bottom-5 left-5 flex items-center gap-3 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)]">
              <Icon name="location_on" className="text-[25px]" />
              <span className="font-semibold tracking-[0.08em]">{trip.destination}</span>
            </div>
            <button className="absolute bottom-5 right-5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/92 text-on-surface shadow-[0_12px_26px_rgba(0,0,0,0.14)] transition-transform hover:scale-105" aria-label="放大地图">
              <Icon name="open_in_full" className="text-[22px]" />
            </button>
          </div>

          <div className="space-y-4 lg:flex-[2] lg:overflow-visible">
            <WeatherPanel days={displayDays} isLoading={isWeatherLoading} />
            <BudgetEstimate days={displayDays} />
            <AIActionBar onToggleAgent={() => setShowAgentDrawer(!showAgentDrawer)} />
          </div>
        </aside>
      </div>


      {/* Agent Panel — slide-out drawer */}
      <div className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-outline-variant bg-background shadow-2xl transition-transform duration-300 lg:max-w-[480px]",
        showAgentDrawer ? "translate-x-0" : "translate-x-full"
      )}>
          {/* Agent header */}
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant/45 bg-[linear-gradient(135deg,rgba(15,55,100,0.96),rgba(7,27,51,0.98))] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-headline-sm text-headline-sm">AI 行程助手</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              {(agentVersions?.length ?? 0) > 0 && (
                <button
                  onClick={() => setShowVersions(!showVersions)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    showVersions
                      ? "bg-white text-primary"
                      : "bg-white/10 text-white/80 hover:bg-white/16"
                  )}
                >
                  版本 {agentVersions?.length ?? 0}
                </button>
              )}
              {(agentLogs?.length ?? 0) > 0 && (
                <button
                  onClick={() => setShowLog(!showLog)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    showLog
                      ? "bg-white text-primary"
                      : "bg-white/10 text-white/80 hover:bg-white/16"
                  )}
                >
                  日志
                </button>
              )}
              <button
                onClick={() => setShowAgentDrawer(false)}
                className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-white/74 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="关闭 AI 助手"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
          </div>

          {/* Version diff panel */}
          {showVersions && (
            <div className="border-b border-outline-variant px-4 py-3 max-h-60 overflow-y-auto bg-surface-container">
              <VersionDiff
                versions={agentVersions}
                currentVersionNumber={agentCurrentVN}
              />
            </div>
          )}

          {/* Action log panel */}
          {showLog && (
            <div className="border-b border-outline-variant px-4 py-3 max-h-40 overflow-y-auto bg-surface-container">
              <AgentActionLog logs={agentLogs} maxEntries={15} />
            </div>
          )}

          {/* Agent panel body */}
          <div className="flex-1 overflow-hidden">
            <AgentPanel tripId={tripId} alwaysExpanded className="h-full border-0 rounded-none" />
          </div>
        </div>
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-center">
          <div className="h-16 w-16 bg-surface-container-high rounded-full mx-auto mb-4" />
          <div className="h-6 bg-surface-container-high rounded-xl w-48 mx-auto" />
        </div>
      </div>
    }>
      <TripDetailContent />
    </Suspense>
  );
}
