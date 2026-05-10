"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/shared/Icon";
import { useUserStore } from "@/stores/userStore";

export function TopNavBar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  const navItems = [
    { href: "/", label: "首页" },
    { href: "/explore", label: "探索" },
    { href: "/create", label: "规划" },
    { href: "/profile", label: "我的行程" },
  ];

  return (
    <header
      className={cn(
        "z-50 hidden lg:block",
        isHome
          ? "fixed inset-x-0 top-0 text-white"
          : "sticky top-0 border-b border-outline-variant/55 bg-[rgba(247,251,255,0.9)] text-primary backdrop-blur-xl"
      )}
    >
      <nav className="grid h-[76px] grid-cols-[auto_1fr_auto] items-center">
        <div className="flex h-full min-w-[18rem] items-center px-8">
          <Link
            href="/"
            className={cn(
              "font-display text-[2rem] font-normal leading-none tracking-[0.1em]",
              isHome ? "text-white drop-shadow-[0_2px_12px_rgba(0,30,60,0.35)]" : "text-primary"
            )}
          >
            NomTrail
          </Link>
        </div>

        <div className="flex h-full items-center justify-center">
          <div className="flex h-full items-center gap-10">
            {navItems.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "relative flex h-full items-center font-medium tracking-[0.16em] transition-colors duration-200",
                    isHome ? "text-[1.1rem]" : "text-[0.92rem]",
                    isHome
                      ? isActive
                        ? "text-white"
                        : "text-white/72 hover:text-white"
                      : isActive
                        ? "text-primary"
                        : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "absolute bottom-0 left-0 h-px transition-all duration-200",
                      isHome ? "bg-white" : "bg-primary",
                      isActive ? "w-full opacity-100" : "w-0 opacity-0"
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex h-full items-center justify-end gap-5 px-8">
          {isHome ? (
            <Link
              href="/create?mode=ai"
              className="rounded-full border border-white/28 bg-white/16 px-5 py-2.5 text-sm font-medium tracking-[0.12em] text-white shadow-[0_12px_28px_rgba(0,20,44,0.18)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/24"
            >
              开始规划
            </Link>
          ) : (
            <>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center text-primary transition-colors duration-200 hover:text-on-surface-variant"
                aria-label="通知"
              >
                <Icon name="notifications" className="text-[25px]" />
              </button>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center text-primary transition-colors duration-200 hover:text-on-surface-variant"
                aria-label="设置"
              >
                <Icon name="settings" className="text-[25px]" />
              </button>
            </>
          )}
          <Link
            href={isAuthenticated ? "/profile" : "/login"}
            className={cn(
              "flex h-11 items-center justify-center overflow-hidden rounded-full transition-opacity duration-200 hover:opacity-85",
              isHome
                ? "border border-white/35 bg-white/16 text-white backdrop-blur-md"
                : "border border-outline-variant/70 bg-[linear-gradient(180deg,#d7eafd,#9fc4e8)] text-primary",
              isAuthenticated ? "w-11" : "px-4 text-sm font-medium"
            )}
            aria-label={isAuthenticated ? "我的行程" : "登录"}
          >
            {isAuthenticated ? (
              <Icon name="person" className="text-[26px]" filled />
            ) : (
              "登录"
            )}
          </Link>
        </div>
      </nav>
    </header>
  );
}
