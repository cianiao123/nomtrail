"use client";

import type { AgentActionLogEntry } from "@/types/agent";

interface Props {
  logs: AgentActionLogEntry[];
  maxEntries?: number;
}

const NODE_LABELS: Record<string, string> = {
  load_context: "加载上下文",
  classify_intent: "意图分类",
  parse_places: "地点解析",
  confirm_places: "地点确认",
  generate_itinerary: "行程生成",
  critique_itinerary: "行程体检",
  revise_itinerary: "行程修改",
  save_version: "版本保存",
  export_itinerary: "行程导出",
  parse_trip: "需求解析",
  research_inspiration: "种草搜索",
  xhs_search: "小红书搜索",
  web_search: "网页搜索",
  extract_places: "提炼地点",
  dedupe_candidates: "候选聚合",
  poi_enrich: "POI补全",
  collect_missing_info: "智能追问",
  ask_follow_up: "追问",
};

export function AgentActionLog({
  logs,
  maxEntries = 20,
}: Props) {
  const entries = logs.slice(-maxEntries).reverse();

  if (entries.length === 0) {
    return (
      <div className="text-center py-4 text-xs text-slate-400">
        暂无操作记录
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div
          key={entry.id || i}
          className="flex items-start gap-2 px-2 py-1 rounded text-xs hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
        >
          <span className="shrink-0 text-slate-400 w-12 font-mono">
            {entry.timestamp?.slice(11, 19) ?? "--:--:--"}
          </span>
          <span className="shrink-0 w-16 text-slate-500">
            {NODE_LABELS[entry.nodeName] ?? entry.nodeName}
          </span>
          <span className="flex-1 text-slate-600 dark:text-slate-400 truncate">
            {entry.output || entry.error || "—"}
          </span>
          {entry.durationMs !== undefined && (
            <span className="shrink-0 text-slate-400 font-mono">
              {entry.durationMs < 1000
                ? `${entry.durationMs}ms`
                : `${(entry.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {entry.error && (
            <span className="shrink-0 text-red-500">✕</span>
          )}
        </div>
      ))}
    </div>
  );
}
