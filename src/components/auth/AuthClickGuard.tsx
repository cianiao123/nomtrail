"use client";

import { MouseEvent, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUserStore } from "@/stores/userStore";
import { isGuestModeEnabled } from "@/lib/auth/guestUser";

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button,a,[role='button'],input[type='button'],input[type='submit'],input[type='reset']"
    )
  );
}

export function AuthClickGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const isLoginPage = pathname === "/login";

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (isLoginPage || isAuthenticated || isGuestModeEnabled()) return;
    if (!isInteractiveElement(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    const query = typeof window === "undefined" ? "" : window.location.search.slice(1);
    const next = `${pathname}${query ? `?${query}` : ""}`;
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="contents" onClickCapture={handleClickCapture}>
      {children}
    </div>
  );
}
