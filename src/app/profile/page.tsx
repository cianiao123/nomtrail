"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/userStore";
import { useTripStore } from "@/stores/tripStore";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";

const TABS = ["我的行程", "收藏目的地", "偏好设置", "历史记录"];

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("我的行程");
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const userProfile = useUserStore((s) => s.userProfile);
  const logout = useUserStore((s) => s.logout);
  const updatePreferences = useUserStore((s) => s.updatePreferences);
  const userPreferences = useUserStore((s) => s.userPreferences);
  const trips = useTripStore((s) => s.trips);
  const tripIds = useTripStore((s) => s.tripIds);
  const saveTrip = useTripStore((s) => s.saveTrip);
  const removeTrip = useTripStore((s) => s.removeTrip);
  const [deletingTripIds, setDeletingTripIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userProfile?.id) return;
    fetch(`/api/trips?userId=${encodeURIComponent(userProfile.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          data.data.forEach(saveTrip);
        }
      })
      .catch(() => {});
  }, [saveTrip, userProfile?.id]);

  const myTrips = tripIds
    .map((id) => trips[id]!)
    .filter((trip) => trip && (!userProfile?.id || trip.userId === userProfile.id));

  async function handleLogout() {
    await createClient().auth.signOut();
    logout();
    router.push("/");
  }

  async function handleDeleteTrip(tripId: string) {
    setDeletingTripIds((prev) => new Set(prev).add(tripId));
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "删除失败");
      }
      removeTrip(tripId);
    } catch (err) {
      console.error("[profile] delete trip failed:", err);
    } finally {
      setDeletingTripIds((prev) => {
        const next = new Set(prev);
        next.delete(tripId);
        return next;
      });
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-76px)] max-w-[980px] items-center justify-center px-5 py-12">
        <div className="rounded-[32px] border border-outline-variant/60 bg-[rgba(255,255,255,0.82)] px-8 py-14 text-center shadow-[0_22px_60px_rgba(8,35,69,0.08)]">
          <Icon name="account_circle" className="mx-auto mb-5 text-[72px] text-primary/35" />
          <h1 className="font-display text-[2.4rem] text-primary">登录后查看你的行程</h1>
          <p className="mt-3 text-sm text-on-surface-variant">你的旅行档案、心愿地点和历史行程会保存在账户里。</p>
          <button
            onClick={() => router.push("/login?next=/profile")}
            className="mt-7 rounded-full bg-primary px-7 py-3 text-sm font-medium text-white transition-all hover:shadow-lg"
          >
            去登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-8 md:px-6">
      <div className="mb-8 overflow-hidden rounded-[32px] border border-outline-variant/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(237,244,251,0.94))] p-6 shadow-[0_22px_60px_rgba(8,35,69,0.07)] md:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-fixed">
            <Icon name="account_circle" className="text-[64px]" />
          </div>
          <div className="flex min-w-0 flex-1 items-end justify-between gap-4">
            <div className="min-w-0">
            <p className="mb-2 text-[11px] tracking-[0.2em] text-on-surface-variant">旅行档案</p>
            <h1 className="font-display text-[2.2rem] leading-tight text-primary">{userProfile?.name || "旅行家"}</h1>
            <p className="text-sm text-on-surface-variant">{userProfile?.email || "你的灵感、行程与偏好，都在这里被安静整理。"}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-5 text-right">
              <button
                onClick={handleLogout}
                className="rounded-full border border-outline-variant/70 px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-white hover:text-primary"
              >
                退出
              </button>
              <div>
              <p className="text-[12px] uppercase tracking-[0.18em] text-on-surface-variant">已保存行程</p>
              <p className="mt-1 font-display text-[1.9rem] leading-none text-primary">{myTrips.length}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-2 overflow-x-auto rounded-full border border-outline-variant/60 bg-[rgba(255,255,255,0.52)] p-1.5">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2.5 text-sm transition-all",
                activeTab === tab
                  ? "bg-primary text-white shadow-[0_10px_24px_rgba(8,35,69,0.18)]"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-primary"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "我的行程" && (
          (myTrips?.length ?? 0) === 0 ? (
            <div className="rounded-[32px] border border-outline-variant/60 bg-[rgba(255,255,255,0.76)] py-16 text-center">
              <Icon name="map" className="mb-4 text-[64px] text-outline" weight={200} />
              <h3 className="mb-2 font-display text-[1.9rem] text-primary">尚无行程</h3>
              <p className="mb-6 text-sm text-on-surface-variant">
                创建你的第一个旅行计划，开启探索之旅
              </p>
              <button
                onClick={() => router.push("/create")}
                className="rounded-full bg-primary px-6 py-3 text-sm text-white transition-all hover:shadow-lg"
              >
                创建行程
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {myTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="cursor-pointer overflow-hidden rounded-[28px] border border-outline-variant/60 bg-[rgba(255,255,255,0.84)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(8,35,69,0.10)]"
                  onClick={() => router.push(`/trip/${trip.id}`)}
                >
                  <div className="flex h-36 items-center justify-center bg-[linear-gradient(135deg,#0f3764,#071b33)]">
                    <Icon name="map" className="text-[48px] text-white/24" weight={100} />
                  </div>
                  <div className="p-5">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{trip.destination}</p>
                    <h3 className="mb-1 font-display text-[1.55rem] text-primary">
                      {trip.title}
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      {trip.destination} · {trip.startDate} ~ {trip.endDate}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-caption text-on-surface-variant">
                        {(trip.days?.length ?? 0)}天 · {(trip.preferences ?? []).slice(0, 3).join(" · ")}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTrip(trip.id);
                        }}
                        disabled={deletingTripIds.has(trip.id)}
                        className="text-error/50 transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "收藏目的地" && (
          <div className="rounded-[32px] border border-outline-variant/60 bg-[rgba(255,255,255,0.76)] py-16 text-center">
            <Icon name="bookmark" className="mb-4 text-[64px] text-outline" weight={200} />
            <h3 className="mb-2 font-display text-[1.9rem] text-primary">暂无收藏</h3>
            <p className="text-sm text-on-surface-variant">
              浏览热门目的地，收藏你感兴趣的地方
            </p>
          </div>
        )}

        {activeTab === "偏好设置" && (
          <div className="max-w-2xl rounded-[32px] border border-outline-variant/60 bg-[rgba(255,255,255,0.76)] p-6">
            <div className="mb-8">
              <p className="mb-2 text-[11px] tracking-[0.18em] text-on-surface-variant">节奏</p>
              <h3 className="mb-4 font-display text-[1.8rem] text-primary">出行节奏</h3>
              <div className="flex gap-3">
                {(["relaxed", "moderate", "intensive"] as const).map((pace) => (
                  <button
                    key={pace}
                    onClick={() => updatePreferences({ preferredPace: pace })}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      userPreferences.preferredPace === pace
                        ? "border-primary bg-primary-container text-on-primary-container"
                        : "border-outline-variant/60 text-on-surface-variant hover:bg-surface-container"
                    )}
                  >
                    {pace === "relaxed" ? "悠闲" : pace === "moderate" ? "适中" : "紧凑"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2">
              <p className="mb-2 text-[11px] tracking-[0.18em] text-on-surface-variant">住宿</p>
              <h3 className="mb-4 font-display text-[1.8rem] text-primary">住宿偏好</h3>
              <div className="flex gap-3">
                {(["budget", "comfort", "luxury"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => updatePreferences({ accommodationType: type })}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      userPreferences.accommodationType === type
                        ? "border-primary bg-primary-container text-on-primary-container"
                        : "border-outline-variant/60 text-on-surface-variant hover:bg-surface-container"
                    )}
                  >
                    {type === "budget" ? "经济" : type === "comfort" ? "舒适" : "奢华"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "历史记录" && (
          <div className="rounded-[32px] border border-outline-variant/60 bg-[rgba(255,255,255,0.76)] py-16 text-center">
            <Icon name="history" className="mb-4 text-[64px] text-outline" weight={200} />
            <h3 className="mb-2 font-display text-[1.9rem] text-primary">暂无记录</h3>
            <p className="text-sm text-on-surface-variant">
              你最近查看和编辑过的行程将显示在这里
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
