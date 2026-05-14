"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAgentStore } from "@/stores/agentStore";
import { PlaceConfirmation } from "./PlaceConfirmation";
import { MessageContent } from "./MessageContent";
import { ReasoningProgress } from "./ReasoningProgress";
import type { ConfirmedPlace } from "@/types/agent";
import { cn } from "@/lib/utils/cn";
import { createId } from "@/lib/utils/createId";
import { useTripStore } from "@/stores/tripStore";
import { useUserStore } from "@/stores/userStore";
import { resolveClientUserId } from "@/lib/auth/guestUser";

interface Props {
  tripId?: string;
  className?: string;
  /** Always expanded — for embedded usage (trip page drawer) */
  alwaysExpanded?: boolean;
}

const STEP_LABELS: Record<string, string> = {
  START: "准备中",
  parse_trip: "正在分析旅行需求",
  research_inspiration: "正在搜索种草攻略",
  extract_places: "正在提炼地点",
  budget_check: "正在校验预算",
  generate_itinerary: "正在生成行程",
  critique_itinerary: "正在校验真实信息",
  save_version: "正在保存行程",
  confirm_places: "正在确认并继续生成",
};

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

function ExportPreview({ payload }: { payload: { title: string; content: string; format: string } }) {
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
            onClick={() => onPick(`我正在路上${item.city}，继续帮我规划行程`)}
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

export function AgentPanel({ tripId, className, alwaysExpanded }: Props) {
  const [input, setInput] = useState("");
  const [isOpen] = useState(alwaysExpanded ?? false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threadId = useAgentStore((s) => s.threadId);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const messages = useAgentStore((s) => s.messages);
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
  const tripCard = useAgentStore((s) => s.tripCard);
  const questionCard = useAgentStore((s) => s.questionCard);
  const exportPayload = useAgentStore((s) => s.exportPayload);
  const destinationRecommendationCard = useAgentStore((s) => s.destinationRecommendationCard);
  const itineraryDraft = useAgentStore((s) => s.itineraryDraft);
  const inspirationItems = useAgentStore((s) => s.inspirationItems);
  const savedPlaceCandidates = useAgentStore((s) => s.savedPlaceCandidates);
  const currentTrip = useTripStore((s) => s.currentTrip);
  const saveTrip = useTripStore((s) => s.saveTrip);
  const setCurrentTrip = useTripStore((s) => s.setCurrentTrip);
  const userProfile = useUserStore((s) => s.userProfile);
  const currentUserId = resolveClientUserId(userProfile?.id || currentTrip?.userId);
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({});
  const appliedDraftRef = useRef<string>("");

  useEffect(() => {
    if (!tripId) return;
    appliedDraftRef.current = "";
    resetAgent();
  }, [tripId, resetAgent]);

  const progressPhase = (() => {
    if (!isStreaming) return "complete" as const;
    if (currentStep === "research_inspiration") return "research_inspiration" as const;
    if (currentStep === "extract_places") return "extract_places" as const;
    if (currentStep === "budget_check") return "budget_check" as const;
    if (currentStep === "critique_itinerary") return "critique_itinerary" as const;
    if (currentStep === "generate_itinerary") return "generate_itinerary" as const;
    if (currentStep === "save_version") return "save_version" as const;
    if (currentStep === "confirm_places") return "confirm" as const;
    return "parse" as const;
  })();

  const insightLines = [
    inspirationItems.length > 0 ? `已汇总 ${inspirationItems.length} 条攻略摘要` : "",
    savedPlaceCandidates.length > 0 ? `已提炼 ${savedPlaceCandidates.length} 个候选地点` : "",
    currentStep === "budget_check" ? "正在确保活动预估费用落在预算区间内" : "",
    currentStep === "critique_itinerary" ? "正在检查时间、路线、预算和天气适配" : "",
    currentStep === "generate_itinerary" ? "正在根据候选地点池生成每日安排" : "",
    currentStep === "save_version" ? "正在把结果写入行程并生成可查看卡片" : "",
  ].filter(Boolean);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!questionCard?.formItems?.length) return;
    const initialAnswers = Object.fromEntries(
      questionCard.formItems.map((item) => [item.field, item.value ?? ""])
    );
    setFormAnswers(initialAnswers);
  }, [questionCard?.formItems]);

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

  const handleReject = () => {
    rejectPlaces();
    addMessage({
      id: createId("message"),
      role: "agent",
      content: "已清除识别的地点，你可以重新粘贴。",
      timestamp: new Date().toISOString(),
    });
  };

  // Suggested quick actions
  const suggestions = needsConfirmation
    ? []
    : ["帮我检查行程", "太赶了，放松一点", "生成雨天备份方案", "导出详细行程"];

  return (
      <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-outline-variant/50 bg-transparent transition-all",
        isOpen ? "h-[600px]" : "h-auto",
        className
      )}
    >
      {/* Messages area */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {(messages ?? []).map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] rounded-[20px] px-4 py-3 text-sm shadow-[0_8px_24px_rgba(8,35,69,0.04)]",
                  msg.role === "user"
                    ? "ml-auto text-white"
                    : "text-[var(--color-on-surface-variant)]"
                )}
                style={msg.role === "user" ? { background: "var(--color-primary)" } : { background: "rgba(255,255,255,0.82)", border: "1px solid rgba(191,208,223,0.64)" }}
              >
                {msg.role === "user" ? msg.content : <MessageContent text={msg.content} />}
              </div>
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="max-w-[85%] space-y-2">
                <div className="rounded-[20px] border border-outline-variant/60 bg-white/82 px-3 py-2 text-sm text-on-surface-variant">
                  {currentStep && (
                    <span className="mb-1 block text-xs text-on-surface-variant/70">
                      {(STEP_LABELS[currentStep] || currentStep)}...
                    </span>
                  )}
                  {streamingContent || "思考中..."}
                </div>
                <ReasoningProgress
                  active={isStreaming}
                  phase={progressPhase}
                  status={STEP_LABELS[currentStep || "START"] || streamingContent || "处理中"}
                  insightLines={insightLines}
                />
              </div>
            )}

            {/* Trip Card */}
            {tripCard && (
              <TripCardDisplay card={tripCard} />
            )}

            {exportPayload && (
              <ExportPreview payload={exportPayload} />
            )}

            {destinationRecommendationCard && !isStreaming && (
              <DestinationRecommendationCard
                card={destinationRecommendationCard}
                onPick={handleSend}
              />
            )}

            {/* Question Card — exam form with submit */}
            {questionCard && !isStreaming && questionCard.formItems && (
              <div className="space-y-4 rounded-[24px] border border-outline-variant/60 bg-surface-container-high/72 p-4">
                {questionCard.summary && (
                  <p className="text-xs text-on-surface-variant">{questionCard.summary}</p>
                )}
                {questionCard.formItems.map((item) => {
                  const selected = formAnswers[item.field] ?? item.value ?? "";
                  const isCustomSelected = !!selected && !item.options.includes(selected);
                  return (
                    <div key={item.field}>
                      <p className="mb-2 text-sm font-medium text-on-surface">
                        {item.index}. {item.question}
                      </p>
                      <div className="mb-2 flex flex-col gap-2">
                        {item.options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFormAnswers(prev => ({ ...prev, [item.field]: prev[item.field] === opt ? "" : opt }))}
                            className="w-full rounded-[14px] px-3 py-2 text-left text-xs font-medium transition-all active:scale-95"
                            style={{
                              background: selected === opt ? "var(--color-primary-container)" : "var(--color-surface-container-low)",
                              color: selected === opt ? "var(--color-on-primary-container)" : "var(--color-on-surface)",
                              border: selected === opt ? "2px solid var(--color-primary)" : "1px solid var(--color-outline-variant)",
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        autoComplete="off"
                        className="relative z-10 w-full rounded-[16px] px-3 py-1.5 text-sm"
                        style={{
                          background: "var(--color-surface)",
                          border: selected ? "1px solid var(--color-primary)" : "1px solid var(--color-outline-variant)",
                          color: "var(--color-on-surface)",
                        }}
                        placeholder="请输入..."
                        value={isCustomSelected ? selected : ""}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) => setFormAnswers(prev => ({ ...prev, [item.field]: e.target.value }))}
                      />
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    const fieldLabels: Record<string, string> = {
                      destination: "目的地",
                      dayCount: "天数",
                      travelers: "人数",
                      preferences: "偏好",
                      budget: "预算",
                    };
                    const answers = questionCard.formItems!
                      .map(item => {
                        const answer = formAnswers[item.field] || item.value || "";
                        return answer ? `${fieldLabels[item.field] || item.field}：${answer}` : "";
                      })
                      .filter(Boolean)
                      .join("；");
                    if (answers) {
                      handleSend(`补充信息：${answers}`);
                      setFormAnswers({});
                    }
                  }}
                  disabled={!questionCard.formItems!.some(item => formAnswers[item.field] || item.value)}
                  className="w-full rounded-full py-2.5 text-sm font-medium transition-colors disabled:opacity-40"
                  style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                >
                  提交
                </button>
              </div>
            )}

            {/* Question Card — confirm mode */}
            {questionCard && !isStreaming && questionCard.confirmMode && questionCard.tripInfo && (
              <div className="overflow-hidden rounded-[24px] border border-outline-variant/60 bg-surface-container-high/72">
                {/* Title */}
                <div className="px-4 pt-4 pb-2">
                  <p className="text-base font-semibold text-on-surface">
                    {questionCard.tripInfo.destination}之旅
                  </p>
                </div>
                {/* Info table */}
                <div className="px-4 pb-2">
                  <table className="w-full text-sm" style={{ color: "var(--color-on-surface-variant)" }}>
                    <tbody>
                      <tr className="border-b" style={{ borderColor: "var(--color-outline-variant)" }}>
                        <td className="py-2 pr-3 whitespace-nowrap">📍 目的地</td>
                        <td className="py-2 font-medium" style={{ color: "var(--color-on-surface)" }}>{questionCard.tripInfo.destination}</td>
                      </tr>
                      <tr className="border-b" style={{ borderColor: "var(--color-outline-variant)" }}>
                        <td className="py-2 pr-3 whitespace-nowrap">📅 日期</td>
                        <td className="py-2 font-medium" style={{ color: "var(--color-on-surface)" }}>{questionCard.tripInfo.startDate} ~ {questionCard.tripInfo.endDate}（{questionCard.tripInfo.dayCount}天）</td>
                      </tr>
                      <tr className="border-b" style={{ borderColor: "var(--color-outline-variant)" }}>
                        <td className="py-2 pr-3 whitespace-nowrap">👥 人数</td>
                        <td className="py-2 font-medium" style={{ color: "var(--color-on-surface)" }}>{questionCard.tripInfo.travelers}</td>
                      </tr>
                      <tr className="border-b" style={{ borderColor: "var(--color-outline-variant)" }}>
                        <td className="py-2 pr-3 whitespace-nowrap">💰 预算</td>
                        <td className="py-2 font-medium" style={{ color: "var(--color-on-surface)" }}>{questionCard.tripInfo.budget}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-3 whitespace-nowrap">🏷️ 偏好</td>
                        <td className="py-2 font-medium" style={{ color: "var(--color-on-surface)" }}>{questionCard.tripInfo.preferences}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Buttons */}
                <div className="flex gap-2 px-4 pb-4 pt-1">
                  <button
                    onClick={() => handleSend("修改信息")}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
                    style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface)", border: "1px solid var(--color-outline-variant)" }}
                  >
                    继续修改
                  </button>
                  <button
                    onClick={() => handleSend("开始规划")}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
                    style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
                  >
                    开始规划
                  </button>
                </div>
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

          {/* Suggestions */}
          {!isStreaming && !questionCard && !destinationRecommendationCard && (suggestions?.length ?? 0) > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-outline-variant/50 px-4 py-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="shrink-0 rounded-full border border-outline-variant/70 px-2.5 py-1 text-xs text-on-surface-variant transition-colors hover:bg-surface-container-low"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-outline-variant/50 px-4 py-3">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-full bg-transparent px-4 py-2.5 text-sm focus:outline-none focus:ring-1"
                style={{
                  border: "1px solid var(--color-outline-variant)",
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
                className="rounded-full px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-40"
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-on-primary)",
                }}
              >
                发送
              </button>
            </div>
          </div>
    </div>
  );
}
