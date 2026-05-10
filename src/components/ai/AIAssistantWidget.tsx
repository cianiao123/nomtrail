"use client";

import { useState, useEffect, useRef } from "react";
import { useAIChatStore } from "@/stores/aiChatStore";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";

const SUGGESTIONS = [
  { icon: "weekend", text: "推荐一个适合周末的短途旅行" },
  { icon: "hiking", text: "帮我规划去成都的3天行程" },
  { icon: "rainy", text: "下雨天有哪些室内景点可以去" },
];

export function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useAIChatStore((s) => s.messages);
  const isStreaming = useAIChatStore((s) => s.isStreaming);
  const streamingContent = useAIChatStore((s) => s.streamingContent);
  const addMessage = useAIChatStore((s) => s.addMessage);
  const setStreaming = useAIChatStore((s) => s.setStreaming);
  const appendStreamContent = useAIChatStore((s) => s.appendStreamContent);
  const finalizeStreamMessage = useAIChatStore((s) => s.finalizeStreamMessage);
  const clearMessages = useAIChatStore((s) => s.clearMessages);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSend = async (text?: string) => {
    const userMsg = (text ?? input).trim();
    if (!userMsg || isStreaming) return;
    if (!text) setInput("");
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content: userMsg,
      timestamp: new Date().toISOString(),
    });
    setStreaming(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      if (!response.ok || !response.body) throw new Error("Failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              finalizeStreamMessage();
            } else {
              appendStreamContent(data);
            }
          }
        }
      }
    } catch {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-all duration-500",
          isOpen
            ? "bg-black/25 backdrop-blur-[2px] opacity-100"
            : "bg-transparent opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
      />

      {/* Side Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[400px] max-w-[90vw] z-50",
          "flex flex-col",
          "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Panel background with grain texture */}
        <div className="absolute inset-0 bg-surface-bright/95 backdrop-blur-2xl shadow-[-20px_0_60px_rgba(0,0,0,0.1)]" />
        <div className="absolute inset-0 grain-overlay opacity-[0.02]" />

        {/* Decorative top gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-48 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(15,55,100,0.08) 0%, transparent 70%)",
          }}
        />

        {/* === Header === */}
        <div className="relative px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            {/* Avatar */}
            <div className="relative">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm"
                style={{
                  background: "linear-gradient(135deg, #0f3764 0%, #1b4965 100%)",
                }}
              >
                <Icon name="auto_awesome" className="text-primary-fixed-dim text-[24px]" filled />
              </div>
              {/* Glow ring */}
              <div
                className="absolute -inset-1 rounded-2xl opacity-60 animate-[float_4s_ease-in-out_infinite]"
                style={{
                  background: "radial-gradient(circle, rgba(159,196,232,0.32) 0%, transparent 70%)",
                  filter: "blur(8px)",
                }}
              />
              {/* Online dot */}
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-olive-400 border-2 border-surface-bright shadow-sm" />
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={clearMessages}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container transition-all duration-200"
                title="清空对话"
              >
                <Icon name="delete_sweep" className="text-[18px]" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant/50 hover:text-on-surface-variant hover:bg-surface-container transition-all duration-200"
              >
                <Icon name="close" className="text-[20px]" />
              </button>
            </div>
          </div>

          {/* Title */}
          <h2
            className="mb-1"
            style={{
              fontFamily: "Cormorant Garamond, Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 500,
              color: "#0f1f33",
              lineHeight: 1.2,
            }}
          >
            AI 旅行助手
          </h2>

          {/* Status line */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--color-olive-400)" }}
            />
            <span className="font-caption text-on-surface-variant">
              DeepSeek · 在线 · 随时为你规划旅程
            </span>
          </div>
        </div>

        {/* === Messages Area === */}
        <div className="relative flex-1 overflow-y-auto px-6 py-2 space-y-4">
          {/* Empty State */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center pt-10">
              {/* Decorative illustration */}
              <div className="relative mb-8">
                <div
                  className="w-20 h-20 rounded-[1.75rem] flex items-center justify-center"
                  style={{
                  background: "linear-gradient(135deg, rgba(15,55,100,0.08) 0%, rgba(159,196,232,0.12) 100%)",
                  }}
                >
                  <Icon
                    name="auto_awesome"
                    className="text-[40px] animate-[float_3.5s_ease-in-out_infinite]"
                    style={{ color: "#0f3764" }}
                    weight={100}
                  />
                </div>
                {/* Decorative ring */}
                <div
                  className="absolute -inset-2 rounded-[2rem] opacity-40"
                  style={{
                    border: "1px dashed rgba(15,55,100,0.22)",
                    animation: "float 4s ease-in-out infinite",
                    animationDelay: "0.5s",
                  }}
                />
              </div>

              <h3
                className="text-center mb-2"
                style={{
                  fontFamily: "Cormorant Garamond, Georgia, serif",
                  fontSize: "1.3rem",
                  fontWeight: 500,
                  color: "#0f1f33",
                  lineHeight: 1.3,
                }}
              >
                你好，旅行家
              </h3>
              <p className="text-center font-body-md text-on-surface-variant max-w-[260px] leading-relaxed mb-8">
                告诉我你正在路上的目的地、玩几天、喜欢什么，我帮你规划完美的旅程
              </p>

              {/* Suggestion Cards */}
              <div className="w-full space-y-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.text}
                    onClick={() => handleSend(s.text)}
                    className={cn(
                      "w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl transition-all duration-200",
                      "border border-outline-variant/40",
                      "hover:border-primary/20 hover:shadow-sm hover:-translate-y-0.5",
                      "active:scale-[0.98]",
                      "animate-fade-up"
                    )}
                    style={{
                      background: "linear-gradient(135deg, rgba(247,251,255,0.82) 0%, rgba(237,244,251,0.58) 100%)",
                      animationDelay: `${i * 0.08}s`,
                    }}
                  >
                    <div className="w-8 h-8 rounded-xl bg-surface-container flex items-center justify-center flex-shrink-0">
                      <Icon name={s.icon} className="text-[18px] text-primary" />
                    </div>
                    <span className="font-body-md text-on-surface flex-1">{s.text}</span>
                    <Icon name="arrow_forward" className="text-[16px] text-on-surface-variant/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message List */}
          {messages.map((msg, i) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2.5",
                msg.role === "user" ? "justify-end" : "justify-start",
                "animate-fade-up"
              )}
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              {/* Assistant avatar */}
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary-container/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name="auto_awesome" className="text-[13px] text-primary/60" filled />
                </div>
              )}

              <div
                className={cn(
                  "max-w-[82%] px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "rounded-2xl rounded-br-md text-white"
                    : "rounded-2xl rounded-bl-md"
                )}
                style={
                  msg.role === "user"
                    ? { background: "linear-gradient(135deg, #0f3764 0%, #071b33 100%)" }
                    : {
                        background: "rgba(237,244,251,0.76)",
                        color: "#0f1f33",
                        borderLeft: "2px solid rgba(15,55,100,0.18)",
                      }
                }
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Streaming bubble */}
          {isStreaming && streamingContent && (
            <div className="flex gap-2.5 justify-start animate-fade-up">
              <div className="w-7 h-7 rounded-lg bg-primary-container/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon name="auto_awesome" className="text-[13px] text-primary/60" filled />
              </div>
              <div
                className="max-w-[82%] px-4 py-3 rounded-2xl rounded-bl-md text-sm leading-relaxed"
                style={{
                  background: "rgba(237,244,251,0.76)",
                  color: "#0f1f33",
                  borderLeft: "2px solid rgba(15,55,100,0.18)",
                }}
              >
                {streamingContent}
                <span className="inline-block w-1.5 h-4 bg-primary/60 rounded-sm animate-pulse ml-0.5 align-middle" />
              </div>
            </div>
          )}

          {/* Streaming indicator (no content yet) */}
          {isStreaming && !streamingContent && (
            <div className="flex gap-2.5 justify-start animate-fade-up">
              <div className="w-7 h-7 rounded-lg bg-primary-container/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon name="auto_awesome" className="text-[13px] text-primary/60" filled />
              </div>
              <div
                className="px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1.5 text-sm"
                style={{
                  background: "rgba(237,244,251,0.76)",
                  color: "#526579",
                  borderLeft: "2px solid rgba(15,55,100,0.18)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* === Input Area === */}
        <div className="relative px-4 pb-4 pt-2 flex-shrink-0">
          {/* Subtle gradient above input */}
          <div
            className="absolute top-0 left-4 right-4 h-8 pointer-events-none"
            style={{
              background: "linear-gradient(to bottom, transparent 0%, rgba(247,251,255,0.92) 100%)",
            }}
          />

          <div className="relative flex items-center gap-2 p-1.5 rounded-2xl border border-outline-variant/50 shadow-sm bg-surface-container/50 focus-within:border-primary/30 focus-within:shadow-md focus-within:bg-surface-container transition-all duration-300">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="输入你的旅行想法..."
              className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none font-body-md"
              disabled={isStreaming}
            />
            <button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200",
                input.trim() && !isStreaming
                  ? "bg-primary text-on-primary shadow-sm hover:shadow-md active:scale-95"
                  : "bg-surface-container text-on-surface-variant/30"
              )}
            >
              <Icon name="send" className="text-[18px]" />
            </button>
          </div>

          <p className="text-center font-caption text-on-surface-variant/30 mt-2">
            AI 助手可能会产生不准确信息，请核实关键信息
          </p>
        </div>
      </div>

      {/* === FAB Button === */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed z-40 rounded-2xl",
          "flex items-center gap-2.5 px-4 py-3",
          "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isOpen
            ? "bottom-24 lg:bottom-8 right-[416px] opacity-0 scale-90 pointer-events-none"
            : "bottom-24 lg:bottom-8 right-8 opacity-100 scale-100",
          "shadow-[0_8px_32px_rgba(8,35,69,0.25)]",
          "hover:shadow-[0_12px_40px_rgba(8,35,69,0.35)] hover:-translate-y-1",
          "active:scale-95"
        )}
        style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(18px)" }}
      >
        {/* Pulse ring */}
        <div
          className="absolute inset-0 rounded-2xl animate-[float_3s_ease-in-out_infinite]"
          style={{
            background: "radial-gradient(circle at 30% 50%, rgba(15,55,100,0.12) 0%, transparent 60%)",
          }}
        />

        <Icon name="auto_awesome" className="relative z-10 text-[21px] text-primary" filled />
        <span
          className="relative z-10 text-sm font-medium text-primary hidden sm:block"
          style={{ fontFamily: "DM Sans, -apple-system, sans-serif" }}
        >
          AI 助手
        </span>
      </button>
    </>
  );
}
