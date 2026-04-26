"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type RealtimeAppRefreshProps = {
  userId: string | null;
};

const refreshDelayMs = 250;
const focusRefreshCooldownMs = 3000;
const realtimeTables = [
  { filterColumn: "user_id", table: "movimentacoes" },
  { filterColumn: "user_id", table: "obrigacoes_checklist" },
  { filterColumn: "user_id", table: "reminder_preferences" },
  { filterColumn: "id", table: "profiles" },
] as const;

export function RealtimeAppRefresh({ userId }: RealtimeAppRefreshProps) {
  const router = useRouter();
  const lastFocusRefreshRef = useRef(0);
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

    const channels = realtimeTables.map(({ filterColumn, table }) =>
      supabase
        .channel(`app-live-refresh:${table}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            filter: `${filterColumn}=eq.${userId}`,
            schema: "public",
            table,
          },
          scheduleRefresh,
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("Atualizacao em tempo real do app ficou indisponivel para uma tabela.", {
              status,
              table,
            });
          }
        }),
    );

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        scheduleFocusRefresh();
      }
    };

    const scheduleFocusRefresh = () => {
      const now = Date.now();

      if (now - lastFocusRefreshRef.current < focusRefreshCooldownMs) {
        return;
      }

      lastFocusRefreshRef.current = now;
      scheduleRefresh();
    };

    window.addEventListener("focus", scheduleFocusRefresh);
    window.addEventListener("pageshow", scheduleFocusRefresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      window.removeEventListener("focus", scheduleFocusRefresh);
      window.removeEventListener("pageshow", scheduleFocusRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [router, userId]);

  return null;
}
