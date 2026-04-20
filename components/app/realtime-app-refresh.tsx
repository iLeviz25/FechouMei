"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RealtimeAppRefreshProps = {
  userId: string | null;
};

const refreshDelayMs = 250;

export function RealtimeAppRefresh({ userId }: RealtimeAppRefreshProps) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();
    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        router.refresh();
        refreshTimeoutRef.current = null;
      }, refreshDelayMs);
    };

    const channel = supabase
      .channel(`app-live-refresh:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `user_id=eq.${userId}`,
          schema: "public",
          table: "movimentacoes",
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `user_id=eq.${userId}`,
          schema: "public",
          table: "obrigacoes_checklist",
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `user_id=eq.${userId}`,
          schema: "public",
          table: "reminder_preferences",
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `id=eq.${userId}`,
          schema: "public",
          table: "profiles",
        },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Atualizacao em tempo real do app ficou indisponivel.", {
            status,
          });
        }
      });

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
