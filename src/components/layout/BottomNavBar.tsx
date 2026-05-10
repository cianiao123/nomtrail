"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/shared/Icon";

const navItems = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/explore", label: "探索", icon: "explore" },
  { href: "/create", label: "规划", icon: "add_circle" },
  { href: "/profile", label: "我的", icon: "person" },
];

export function BottomNavBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-[28px] border-t border-outline-variant/60 px-4 pb-6 pt-3 shadow-[0_-12px_34px_rgba(8,35,69,0.10)] lg:hidden"
      style={{
        background: "rgba(247,251,255,0.94)",
        backdropFilter: "blur(24px) saturate(1.06)",
        WebkitBackdropFilter: "blur(24px) saturate(1.06)",
      }}
    >
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href.split("?")[0]!);
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "relative flex min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 transition-all",
              isActive ? "bg-secondary-container/65 text-primary" : "text-on-surface-variant"
            )}
          >
            {isActive && (
              <span className="absolute -top-0.5 h-1 w-1 rounded-full bg-primary-fixed-dim" />
            )}
            <Icon name={item.icon} className="text-[22px]" />
            <span className="text-[10px] uppercase tracking-wider font-semibold">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
