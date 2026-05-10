"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS } from "@/lib/constants";
import type { Activity } from "@/types/trip";

interface POISuggestion {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  type: string;
}

interface Props {
  dayId: string;
  cityName: string;
  onAdd: (activity: {
    type: string; customName: string; poi: POISuggestion | null;
    startTime: string; endTime: string; notes: string; estimatedCost: number;
  }) => void;
  onClose: () => void;
  initialActivity?: Activity | null;
}

const ACTIVITY_TYPES = ["attraction", "food", "hotel", "transport"] as const;
const QUICK_SEARCHES = [
  { label: "热门景点", keyword: "景点" },
  { label: "本地美食", keyword: "美食" },
  { label: "咖啡甜品", keyword: "咖啡" },
  { label: "住宿酒店", keyword: "酒店" },
  { label: "地铁车站", keyword: "地铁站" },
] as const;

export function AddActivityForm({ dayId, cityName, onAdd, onClose, initialActivity }: Props) {
  const [keyword, setKeyword] = useState("");
  const [suggestions, setSuggestions] = useState<POISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPOI, setSelectedPOI] = useState<POISuggestion | null>(null);
  const [actType, setActType] = useState<string>("attraction");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!initialActivity) return;
    const activityName = initialActivity.poi?.name || initialActivity.customName || "";
    setKeyword(activityName);
    setSelectedPOI(
      initialActivity.poi
        ? {
            id: initialActivity.poi.amapId,
            name: initialActivity.poi.name,
            address: initialActivity.poi.address,
            lng: initialActivity.poi.coordinate.lng,
            lat: initialActivity.poi.coordinate.lat,
            type: initialActivity.type,
          }
        : null
    );
    setActType(initialActivity.type);
    setStartTime(initialActivity.startTime || "09:00");
    setEndTime(initialActivity.endTime || "11:00");
    setCost(initialActivity.estimatedCost ? String(initialActivity.estimatedCost) : "");
    setNotes(initialActivity.notes || "");
  }, [initialActivity]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
    document.body.style.overflow = "hidden";
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", h);
    };
  }, [onClose]);

  const search = (kw: string) => {
    if (kw.length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    setLoading(true);
    fetch(`/api/poi/search?${new URLSearchParams({ keyword: kw, city: cityName, limit: "8" })}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.pois?.length) {
          setSuggestions(d.data.pois.map((p: any) => ({
            id: p.amapId,
            name: p.name,
            address: p.address || "",
            lng: p.coordinate?.lng || 0,
            lat: p.coordinate?.lat || 0,
            type: p.type || "attraction",
          })));
          setShowDropdown(true);
        } else { setSuggestions([]); setShowDropdown(false); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const onInput = (v: string) => {
    setKeyword(v); setSelectedPOI(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 300);
  };

  const triggerQuickSearch = (kw: string) => {
    if (timer.current) clearTimeout(timer.current);
    setKeyword(kw);
    setSelectedPOI(null);
    search(kw);
  };

  const select = (poi: POISuggestion) => {
    setSelectedPOI(poi); setKeyword(poi.name); setShowDropdown(false);
    if ((ACTIVITY_TYPES as readonly string[]).includes(poi.type)) setActType(poi.type);
  };

  const submit = () => {
    const name = selectedPOI?.name || keyword.trim();
    if (!name) return;
    onAdd({ type: actType, customName: name, poi: selectedPOI, startTime, endTime, notes, estimatedCost: parseInt(cost) || 0 });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center bg-black/40 p-4 pt-[10vh] sm:pt-0 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl" style={{ width: "min(640px, calc(100vw - 32px))", maxHeight: "calc(100vh - 4rem)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{initialActivity ? "编辑活动" : "添加活动"}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <Icon name="close" className="text-[20px] text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4" style={{ maxHeight: "calc(100vh - 12rem)" }}>
          {/* Search */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">搜索地点</label>
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 focus-within:border-emerald-500 transition-colors">
                <Icon name="search" className="text-gray-400 text-[18px]" />
                <input ref={inputRef} value={keyword} onChange={(e) => onInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  placeholder={`在${cityName}搜索...`}
                  className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400" />
                {loading && <LoadingSpinner size="sm" />}
              </div>
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                  {suggestions.map((poi) => (
                    <button key={poi.id} onClick={() => select(poi)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 border-b border-gray-100 last:border-0">
                      <Icon name={ACTIVITY_TYPE_ICONS[poi.type] || "place"} className="text-emerald-600 mt-0.5 text-[16px]" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{poi.name}</p>
                        <p className="text-xs text-gray-500 truncate">{poi.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_SEARCHES.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => triggerQuickSearch(item.keyword)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              也可以直接输入商圈、景点、餐厅或酒店名称来搜索。
            </p>
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">类型</label>
            <div className="flex gap-2">
              {ACTIVITY_TYPES.map((type) => (
                <button key={type} onClick={() => setActType(type)}
                  className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium",
                    actType === type ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
                  <Icon name={ACTIVITY_TYPE_ICONS[type]} className="text-[14px]" />
                  {ACTIVITY_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Time + Cost */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">开始时间</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">结束时间</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">预估花费</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">¥</span>
                <input type="number" value={cost} onChange={(e) => setCost(e.target.value)}
                  placeholder="0" min="0"
                  className="w-full pl-6 pr-2.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-emerald-500" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="选填..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 outline-none focus:border-emerald-500" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-3 border-t">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50">
            取消
          </button>
          <button onClick={submit} disabled={!keyword.trim() && !selectedPOI}
            className="flex-1 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center gap-2">
            <Icon name={initialActivity ? "edit" : "add"} className="text-[18px]" />{initialActivity ? "保存修改" : "添加活动"}
          </button>
        </div>
      </div>
    </div>
  );
}
