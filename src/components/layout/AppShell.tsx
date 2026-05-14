"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { TopNavBar } from "./TopNavBar";
import { BottomNavBar } from "./BottomNavBar";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AuthClickGuard } from "@/components/auth/AuthClickGuard";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";
import { useAgentStore } from "@/stores/agentStore";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isTripPage = pathname.startsWith("/trip/");
  const isExplorePage = pathname === "/explore";
  const isLoginPage = pathname === "/login";
  const [showAgent, setShowAgent] = useState(false);
  const agentMessages = useAgentStore((s) => s.messages);
  const resetAgent = useAgentStore((s) => s.reset);

  const handleToggleAgent = () => {
    if (!showAgent && agentMessages.length === 0) {
      resetAgent();
    }
    setShowAgent(!showAgent);
  };

  return (
    <AuthClickGuard>
      {!isTripPage && !isLoginPage && <TopNavBar />}
      <div className="relative mx-auto flex w-full max-w-[1920px] flex-1">
        <main
          className={cn(
            "relative flex-1",
            isExplorePage
              ? "h-[calc(100dvh-92px)] overflow-hidden pb-0 lg:h-[calc(100dvh-76px)]"
              : "min-h-screen pb-24 lg:pb-0"
          )}
        >
          {children}
        </main>
      </div>

      {/* AI Agent FAB + Drawer — non-trip pages only */}
      {!isTripPage && !isExplorePage && !isLoginPage && (
        <>
          {/* FAB button */}
          <button
            onClick={handleToggleAgent}
            className={cn(
              "fixed bottom-24 lg:bottom-8 right-4 lg:right-8 z-40",
              "flex items-center gap-2.5 rounded-full border border-white/10 px-4 py-3",
              "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              showAgent
                ? "opacity-0 scale-90 pointer-events-none"
                : "opacity-100 scale-100",
              "border-white/70 bg-white/78 text-primary backdrop-blur-xl",
              "shadow-[0_18px_44px_rgba(8,35,69,0.18)]",
              "hover:bg-white/90 hover:shadow-[0_24px_52px_rgba(8,35,69,0.24)] hover:-translate-y-1",
              "active:scale-95"
            )}
            title="AI 行程助手"
          >
            <Icon name="auto_awesome" className="text-[21px]" filled />
            <span className="text-sm font-medium hidden sm:block">AI 助手</span>
          </button>

          {/* Slide-out drawer */}
          {showAgent && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity duration-500"
                onClick={() => setShowAgent(false)}
              />
              {/* Panel */}
              <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.1)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:max-w-[480px]">
                {/* Panel background */}
                <div className="absolute inset-0 bg-surface-bright/94 backdrop-blur-2xl" />

                {/* Header */}
                <div className="relative flex items-center justify-between gap-4 overflow-hidden border-b border-outline-variant/45 bg-[linear-gradient(135deg,rgba(15,55,100,0.96),rgba(7,27,51,0.98))] px-4 py-3 text-white">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8">
                      <Icon name="auto_awesome" className="text-primary-fixed text-[18px]" filled />
                      <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary-fixed-dim ring-2 ring-primary" />
                    </div>
                    <div className="relative z-10 min-w-0">
                      <p className="text-[11px] tracking-[0.22em] text-white/54">NomTrail 助手</p>
                      <h2 className="font-headline-sm text-headline-sm text-white">AI 行程助手</h2>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAgent(false)}
                    className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/72 transition-all duration-200 hover:bg-white/10 hover:text-white"
                    aria-label="关闭 AI 助手"
                  >
                    <Icon name="close" className="text-[20px]" />
                  </button>
                </div>

                {/* Body */}
                <div className="relative flex-1 overflow-hidden">
                  <AgentPanel alwaysExpanded className="h-full border-0 rounded-none" />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!isLoginPage && <BottomNavBar />}
    </AuthClickGuard>
  );
}
