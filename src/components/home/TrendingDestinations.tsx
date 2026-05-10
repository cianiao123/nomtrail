"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/shared/Icon";

interface DestinationCardProps {
  name: string;
  subtitle: string;
  category: string;
  description: string;
  duration: string;
  costLevel: string;
  imageUrl: string;
}

const DESTINATIONS: DestinationCardProps[] = [
  {
    name: "京都，日本",
    subtitle: "日本 · Kyoto",
    category: "人文历史",
    description: "沉浸在千年古都的禅意之中，竹林、寺庙与茶道文化的完美交融。",
    duration: "5-7 天",
    costLevel: "¥¥¥",
    imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80",
  },
  {
    name: "巴塔哥尼亚，智利",
    subtitle: "智利 · Patagonia",
    category: "自然风光",
    description: "感受壮丽山峰、广袤冰川与原始荒野的震撼之美。",
    duration: "10-14 天",
    costLevel: "¥¥¥¥",
    imageUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&q=80",
  },
  {
    name: "巴黎，法国",
    subtitle: "法国 · Paris",
    category: "城市漫步",
    description: "探索隐秘庭院、安静咖啡馆，发现这座城市的精致与优雅。",
    duration: "4-6 天",
    costLevel: "¥¥¥",
    imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80",
  },
];

function DestinationCard({ name, subtitle, category, description, duration, costLevel, imageUrl }: DestinationCardProps) {
  return (
    <Link
      href={`/create?destination=${encodeURIComponent(name.split("，")[0]!)}`}
      className="group reveal cursor-pointer overflow-hidden rounded-[28px] border border-outline-variant/60 bg-[rgba(255,255,255,0.82)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_54px_rgba(8,35,69,0.10)]"
    >
      <div className="relative h-[240px] overflow-hidden">
        <Image
          src={imageUrl}
          alt={name}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(8,35,69,0.08),rgba(7,27,51,0.50))]" />
        <div className="absolute right-4 top-4 rounded-full border border-white/30 bg-white/78 px-3 py-1 backdrop-blur">
          <span className="font-caption text-caption font-medium tracking-wide text-primary">
            {category}
          </span>
        </div>
      </div>
      <div className="p-6">
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{subtitle}</p>
        <h3 className="mb-2 font-display text-[1.7rem] leading-tight text-primary">{name}</h3>
        <p className="mb-5 line-clamp-2 text-sm leading-7 text-on-surface-variant">
          {description}
        </p>
        <div className="flex items-center gap-5 text-[13px] text-on-surface-variant">
          <span className="flex items-center gap-1">
            <Icon name="schedule" className="text-[16px] text-primary" weight={200} />
            {duration}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="payments" className="text-[16px] text-primary" weight={200} />
            {costLevel}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function TrendingDestinations() {
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
    <section id="destinations" className="mx-auto mb-12 min-h-[calc(86vh-15px)] max-w-[1480px] scroll-mt-24 px-3 pt-14 md:px-4 lg:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[2.5rem] leading-tight text-primary">热门目的地</h2>
        </div>
        <Link
          href="/create"
          className="flex items-center gap-1 text-sm text-primary transition-all hover:gap-2"
        >
          查看全部 <Icon name="arrow_forward" className="text-[18px]" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" ref={containerRef}>
        {DESTINATIONS.map((dest) => (
          <DestinationCard key={dest.name} {...dest} />
        ))}
      </div>
    </section>
  );
}
