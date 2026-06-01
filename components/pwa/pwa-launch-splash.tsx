"use client";

import { useEffect, useState } from "react";

const SPLASH_VISIBLE_MS = 560;
const SPLASH_FADE_MS = 140;

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

export function PwaLaunchSplash() {
  const [hidden, setHidden] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clientStandalone, setClientStandalone] = useState(false);

  useEffect(() => {
    if (!isStandalonePwa()) {
      setHidden(true);
      return;
    }

    setClientStandalone(true);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      const timeout = window.setTimeout(() => setHidden(true), 350);
      return () => window.clearTimeout(timeout);
    }

    const fadeTimeout = window.setTimeout(() => setLeaving(true), SPLASH_VISIBLE_MS);
    const hideTimeout = window.setTimeout(
      () => setHidden(true),
      SPLASH_VISIBLE_MS + SPLASH_FADE_MS,
    );

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, []);

  if (hidden) {
    return null;
  }

  return (
    <div
      aria-label="Abrindo FechouMEI"
      aria-live="polite"
      className={[
        "pwa-launch-splash fixed inset-0 z-[1000] flex-col items-center justify-center",
        "bg-[#F7FBF8] text-[#0F2F25]",
        "transition-opacity duration-200 ease-out",
        "[@media(prefers-color-scheme:dark)]:bg-[#033D27]",
        "[@media(prefers-color-scheme:dark)]:text-white",
        clientStandalone ? "pwa-launch-splash--client-standalone" : "",
        leaving ? "pwa-launch-splash--leaving opacity-0" : "opacity-100",
      ].join(" ")}
      role="status"
    >
      <img
        alt=""
        aria-hidden="true"
        className="h-24 w-24 select-none sm:h-28 sm:w-28"
        draggable={false}
        src="/icons/splash-mark.png"
      />
      <span className="absolute bottom-10 text-sm font-semibold tracking-[0.18em] text-current/65 sm:bottom-12">
        FechouMEI
      </span>
    </div>
  );
}
