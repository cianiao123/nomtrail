"use client";

import { ReactNode, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/userStore";
import type { UserProfile } from "@/types/trip";

function profileFromSupabaseUser(user: {
  id: string;
  email?: string;
  user_metadata?: { name?: string; avatar_url?: string };
}): UserProfile {
  return {
    id: user.id,
    name: user.user_metadata?.name || user.email?.split("@")[0] || "旅行家",
    email: user.email || "",
    avatarUrl: user.user_metadata?.avatar_url || "",
    tier: "free",
    preferences: useUserStore.getState().userPreferences,
    savedDestinations: [],
    createdAt: new Date().toISOString(),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const setUser = useUserStore((s) => s.setUser);
  const logout = useUserStore((s) => s.logout);

  // Hydration fix for Zustand persist middleware
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(profileFromSupabaseUser(data.user));
      } else {
        logout();
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(profileFromSupabaseUser(session.user));
      } else {
        logout();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [logout, setUser]);

  return <>{children}</>;
}
