"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils/cn";

type AuthMode = "login" | "signup";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/profile";
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");

    if (!email.trim() || !password) {
      setStatus("请输入邮箱和密码。");
      return;
    }
    if (password.length < 6) {
      setStatus("密码至少 6 位。");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const result = mode === "login"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { name: name.trim() || email.trim().split("@")[0] } },
          });

      if (result.error) throw result.error;

      if (mode === "signup" && !result.data.session) {
        setStatus("注册成功，请查看邮箱完成确认后再登录。");
        setMode("login");
        return;
      }

      router.replace(redirectTo);
    } catch (err) {
      setStatus((err as Error).message || "登录失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#071b33] text-white">
      <div
        className="absolute inset-0 scale-[1.03] bg-cover bg-center motion-safe:animate-[heroDrift_18s_ease-in-out_infinite]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?auto=format&fit=crop&w=2400&q=88')",
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(3,17,36,0.74)_0%,rgba(5,24,50,0.45)_46%,rgba(3,18,39,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_42%,rgba(255,255,255,0.13)_0%,rgba(255,255,255,0.04)_28%,rgba(2,13,30,0.44)_78%)]" />

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-7 md:px-12">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="font-display text-[2rem] leading-none tracking-[0.1em] text-white drop-shadow-[0_2px_12px_rgba(0,30,60,0.35)]"
          >
            NomTrail
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex h-11 items-center gap-2 rounded-full border border-white/24 bg-white/10 px-4 text-sm font-medium tracking-[0.08em] text-white backdrop-blur-md transition-colors hover:bg-white/16"
            aria-label="返回首页"
          >
            <Icon name="arrow_back" className="text-[20px]" />
            返回
          </button>
        </div>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1fr_minmax(360px,440px)] lg:gap-20">
          <div className="max-w-[760px]">
            <p className="mb-7 text-[11px] font-medium tracking-[0.36em] text-white/62">
              NOMTRAIL ACCOUNT
            </p>
            <h1 className="font-display text-[3.1rem] font-normal leading-[1.08] tracking-[0.02em] text-white drop-shadow-[0_4px_24px_rgba(0,21,48,0.36)] md:text-[5rem]">
              让每一次出发
              <br />
              都有迹可循
            </h1>
          </div>

          <div className="w-full backdrop-blur-[2px]">
            <div className="mb-9">
              <p className="text-[11px] tracking-[0.28em] text-white/58">欢迎回来</p>
              <h2 className="mt-3 font-display text-[2.7rem] leading-tight text-white">
                {mode === "login" ? "登录" : "创建账户"}
              </h2>
            </div>

            <div className="mb-7 grid grid-cols-2 border-b border-white/22">
            {(["login", "signup"] as AuthMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setStatus("");
                }}
                className={cn(
                  "relative px-1 py-3 text-left text-sm font-medium tracking-[0.16em] transition-colors",
                  mode === item ? "text-white" : "text-white/48 hover:text-white/78"
                )}
              >
                {item === "login" ? "登录" : "注册"}
                <span
                  className={cn(
                    "absolute bottom-[-1px] left-0 h-px bg-white transition-all duration-200",
                    mode === item ? "w-16 opacity-100" : "w-0 opacity-0"
                  )}
                />
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white/74">昵称</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-[18px] border border-white/24 bg-white/12 px-4 py-3 text-sm text-white outline-none backdrop-blur-md transition-colors placeholder:text-white/38 focus:border-white/70"
                  placeholder="旅行家"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white/74">邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[18px] border border-white/24 bg-white/12 px-4 py-3 text-sm text-white outline-none backdrop-blur-md transition-colors placeholder:text-white/38 focus:border-white/70"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white/74">密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[18px] border border-white/24 bg-white/12 px-4 py-3 text-sm text-white outline-none backdrop-blur-md transition-colors placeholder:text-white/38 focus:border-white/70"
                placeholder="至少 6 位"
              />
            </label>

            {status && (
              <div className="rounded-[18px] border border-white/20 bg-white/12 px-4 py-3 text-sm text-white/78 backdrop-blur-md">
                {status}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-white px-5 py-4 text-sm font-semibold tracking-[0.12em] text-[#082345] shadow-[0_18px_42px_rgba(1,12,30,0.2)] transition-all hover:-translate-y-0.5 hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <Icon name="progress_activity" className="animate-spin text-[18px]" />}
              {mode === "login" ? "登录" : "注册"}
            </button>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#071b33]">
          <div className="h-screen w-full animate-pulse bg-white/5" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
