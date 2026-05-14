"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";

export function HeroSection() {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setHasScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section className="relative overflow-hidden bg-[#071b33]">
      <div className="relative">
        <div className="relative min-h-screen overflow-hidden bg-[#071b33]">
          <div
            className="absolute inset-0 scale-[1.03] bg-cover bg-center motion-safe:animate-[heroDrift_18s_ease-in-out_infinite]"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?auto=format&fit=crop&w=2400&q=88')",
            }}
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,20,42,0.22)_0%,rgba(5,23,48,0.08)_34%,rgba(3,18,39,0.34)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_0%,rgba(6,29,62,0.16)_48%,rgba(2,13,30,0.48)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(180deg,rgba(7,27,51,0)_0%,#071b33_100%)]" />

          <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 pb-24 pt-28 text-center">
            <p className="animate-fade-up mb-7 text-[11px] font-medium tracking-[0.36em] text-white/62">
              NOMTRAIL PRIVATE ROUTES
            </p>
            <h1 className="animate-fade-up stagger-1 max-w-[1080px] font-display font-normal leading-[0.98] tracking-[0.02em] text-white drop-shadow-[0_4px_24px_rgba(0,21,48,0.36)]">
              <span className="block whitespace-nowrap text-[2.9rem] md:text-[5rem]">
                让所有的<span className="ml-4 inline-block text-[4.1rem] leading-none md:ml-7 md:text-[7rem]">想去</span>
              </span>
              <span className="mt-2 block whitespace-nowrap text-[2.9rem] md:mt-5 md:text-[5rem]">
                都变成<span className="ml-4 inline-block text-[4.1rem] leading-none md:ml-7 md:text-[7rem]">正在路上</span>
              </span>
            </h1>
            <div className="animate-fade-up stagger-3 mt-14 grid w-full max-w-[570px] gap-4 sm:grid-cols-2">
              <Link
                href="/create?mode=ai"
                className="group flex min-h-[86px] items-center justify-between rounded-[18px] border border-white/24 bg-white/94 px-6 py-4 text-left text-[#082345] shadow-[0_18px_42px_rgba(1,12,30,0.2)] transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_24px_56px_rgba(1,12,30,0.28)]"
              >
                <span>
                  <span className="block font-display text-[1.72rem] font-normal tracking-[0.03em]">AI 行程</span>
                </span>
                <Icon name="arrow_forward" className="text-[27px] transition-transform duration-300 group-hover:translate-x-1" />
              </Link>

              <Link
                href="/create?mode=manual"
                className="group flex min-h-[86px] items-center justify-between rounded-[18px] border border-white/28 bg-white/10 px-6 py-4 text-left text-white shadow-[0_18px_42px_rgba(1,12,30,0.12)] backdrop-blur-[7px] transition-all duration-300 hover:-translate-y-1 hover:bg-white/17"
              >
                <span>
                  <span className="block font-display text-[1.72rem] font-normal tracking-[0.03em]">自由编排</span>
                </span>
                <Icon name="edit_note" className="text-[27px] transition-transform duration-300 group-hover:rotate-[-4deg]" />
              </Link>
            </div>
            <p className="animate-fade-up stagger-3 mt-5 inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-2 text-xs text-white/72 backdrop-blur-md">
              <Icon name="public" className="text-[15px]" />
              可以连接 VPN 提高访问速度（香港节点最佳）
            </p>

            <a
              href="#destinations"
              className={cn(
                "absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-[11px] tracking-[0.18em] text-white/62 transition-all duration-500",
                hasScrolled && "pointer-events-none translate-y-3 opacity-0"
              )}
              aria-label="滚动到热门目的地"
            >
              向下滚动
              <span className="h-8 w-px overflow-hidden bg-white/25">
                <span className="block h-3 w-px bg-white motion-safe:animate-[scrollLine_1.8s_ease-in-out_infinite]" />
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
