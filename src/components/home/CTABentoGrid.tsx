"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";

interface CTACardProps {
  icon: string;
  title: string;
  description: string;
  href: string;
  colorClass: string;
  accentClass: string;
  isDark?: boolean;
}

function CTACard({ icon, title, description, href, colorClass, accentClass, isDark }: CTACardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group reveal relative flex h-56 cursor-pointer flex-col justify-between overflow-hidden rounded-[28px] border p-8 text-left transition-all duration-300 hover:-translate-y-1",
        isDark
          ? "border-primary bg-[linear-gradient(135deg,#0f3764,#071b33)] hover:shadow-[0_24px_56px_rgba(8,35,69,0.24)]"
          : "border-outline-variant/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(237,244,251,0.9))] hover:shadow-[0_20px_48px_rgba(8,35,69,0.09)]"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full transition-transform group-hover:scale-110",
          isDark ? "bg-white opacity-[0.05]" : accentClass
        )}
      />
      <div>
        <Icon
          name={icon}
          className={cn("mb-5 block text-[32px]", isDark ? "text-primary-fixed" : colorClass)}
          weight={200}
        />
        <p className={cn("mb-3 text-[11px] tracking-[0.18em]", isDark ? "text-white/54" : "text-on-surface-variant")}>
          {isDark ? "AI 定制" : "手动规划"}
        </p>
        <h2 className={cn("mb-2 font-display text-[1.75rem] leading-tight", isDark ? "text-white" : "text-primary")}>
          {title}
        </h2>
      </div>
      <p className={cn("max-w-[22rem] text-sm leading-7", isDark ? "text-white/68" : "text-on-surface-variant")}>
        {description}
      </p>
      <Icon
        name="arrow_forward"
        className={cn(
          "absolute bottom-8 right-8 translate-x-4 transform opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100",
          isDark ? "text-primary-fixed-dim" : colorClass
        )}
      />
    </Link>
  );
}

export function CTABentoGrid() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    container.querySelectorAll(".reveal").forEach((el, i) => {
      (el as HTMLElement).style.transitionDelay = `${i * 0.08}s`;
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative z-30 mx-auto -mt-10 max-w-[1240px] px-4 md:px-6" ref={containerRef}>
      <div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-2">
        <CTACard
          icon="magic_button"
          title="AI 一键智能生成"
          description="输入目的地、天数与偏好，让系统自动搜索攻略、筛选地点并生成可执行行程。"
          href="/create?mode=ai"
          colorClass="text-primary"
          accentClass="bg-primary/10"
          isDark
        />
        <CTACard
          icon="edit_calendar"
          title="手动开启新旅程"
          description="保留全部掌控感，从城市、活动到每日节奏，按你的方式细致编排。"
          href="/create?mode=manual"
          colorClass="text-primary"
          accentClass="bg-primary-fixed/40"
        />
      </div>
    </div>
  );
}
