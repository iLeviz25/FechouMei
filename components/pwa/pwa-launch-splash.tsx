"use client";

import { useEffect, useState } from "react";

const SPLASH_VISIBLE_MS = 850;
const SPLASH_FADE_MS = 180;

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
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!isStandalonePwa()) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setVisible(true);

    if (prefersReducedMotion) {
      const timeout = window.setTimeout(() => setVisible(false), 500);
      return () => window.clearTimeout(timeout);
    }

    const fadeTimeout = window.setTimeout(() => setLeaving(true), SPLASH_VISIBLE_MS);
    const hideTimeout = window.setTimeout(
      () => setVisible(false),
      SPLASH_VISIBLE_MS + SPLASH_FADE_MS,
    );

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-label="Abrindo FechouMEI"
      aria-live="polite"
      className={[
        "fixed inset-0 z-[1000] flex flex-col items-center justify-center",
        "bg-[#F7FBF8] text-[#0F2F25]",
        "transition-opacity duration-200 ease-out",
        "[@media(prefers-color-scheme:dark)]:bg-[#033D27]",
        "[@media(prefers-color-scheme:dark)]:text-white",
        leaving ? "opacity-0" : "opacity-100",
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
