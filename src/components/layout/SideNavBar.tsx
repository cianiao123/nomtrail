"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/shared/Icon";

export function SideNavBar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "首页", icon: "home" },
    { href: "/explore", label: "探索", icon: "explore" },
    { href: "/create?mode=manual", label: "规划行程", icon: "add_circle" },
    { href: "/profile", label: "我的行程", icon: "map" },
  ];

  return (
    <aside className="fixed left-0 top-[76px] z-40 hidden h-[calc(100vh-76px)] w-72 flex-col border-r border-outline-variant/60 bg-[rgba(247,251,255,0.9)] px-5 pb-6 pt-8 text-on-surface backdrop-blur-xl lg:flex">
      <div className="mb-8 px-1">
        <p className="text-[11px] tracking-[0.18em] text-on-surface-variant">旅行工作台</p>
      </div>
      <Link
        href="/create"
        className="mb-8 flex w-full items-center justify-center gap-2 border border-outline-variant/70 bg-transparent px-4 py-3 text-sm font-medium text-primary transition-colors duration-200 hover:bg-surface-container"
      >
        <Icon name="add" className="text-[18px]" />
        新建行程
      </Link>
      <nav className="flex flex-1 flex-col gap-2">
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
                "flex items-center gap-3 rounded-full px-4 py-3 text-sm transition-all duration-200",
                isActive
                  ? "bg-secondary-container/70 text-primary shadow-[0_10px_28px_rgba(8,35,69,0.08)]"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
              )}
            >
              <Icon name={item.icon} className={cn(isActive ? "text-primary" : "text-on-surface-variant")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
