"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";

type RoutePrefetcher = {
  prefetch: (href: string) => void;
};

type FastNavigationLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch" | "onClick" | "onFocus" | "onPointerEnter" | "onTouchStart"
> & {
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onTouchStart?: (event: TouchEvent<HTMLAnchorElement>) => void;
  prefetch?: false;
};

type RouteWarmupProps = {
  routes: string[];
};

type NetworkInformationLike = {
  effectiveType?: string;
  saveData?: boolean;
};

const routePrefetchTtlMs = 45000;
const warmedRoutes = new Map<string, number>();

function getPathOnly(href: string) {
  return href.split("?")[0] ?? href;
}

function normalizeInternalHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) {
    return null;
  }

  return href;
}

function canWarmOnCurrentNetwork() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

  if (!connection) {
    return true;
  }

  if (connection.saveData) {
    return false;
  }

  return connection.effectiveType !== "slow-2g" && connection.effectiveType !== "2g";
}

function prefetchRoute(router: RoutePrefetcher, href: string, force = false) {
  const normalizedHref = normalizeInternalHref(href);

  if (!normalizedHref || !canWarmOnCurrentNetwork()) {
    return;
  }

  const now = Date.now();
  const lastWarmAt = warmedRoutes.get(normalizedHref) ?? 0;

  if (!force && now - lastWarmAt < routePrefetchTtlMs) {
    return;
  }

  warmedRoutes.set(normalizedHref, now);

  try {
    router.prefetch(normalizedHref);
  } catch (error) {
    warmedRoutes.delete(normalizedHref);
    console.warn("[navigation] Route prefetch failed", { error, href: normalizedHref });
  }
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.currentTarget.target !== "_blank"
  );
}

export function FastNavigationLink({
  href,
  onClick,
  onFocus,
  onPointerEnter,
  onTouchStart,
  ...props
}: FastNavigationLinkProps) {
  const router = useRouter();

  const warmRoute = useCallback(() => {
    prefetchRoute(router, href);
  }, [href, router]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isPlainLeftClick(event)) {
      prefetchRoute(router, href, true);
    }

    onClick?.(event);
  }

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    warmRoute();
    onFocus?.(event);
  }

  function handlePointerEnter(event: PointerEvent<HTMLAnchorElement>) {
    warmRoute();
    onPointerEnter?.(event);
  }

  function handleTouchStart(event: TouchEvent<HTMLAnchorElement>) {
    warmRoute();
    onTouchStart?.(event);
  }

  return (
    <Link
      {...props}
      href={href}
      onClick={handleClick}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onTouchStart={handleTouchStart}
      prefetch={false}
    />
  );
}

export function RouteWarmup({ routes }: RouteWarmupProps) {
  const pathname = usePathname();
  const router = useRouter();
  const routeQueue = useMemo(
    () =>
      Array.from(new Set(routes))
        .filter(Boolean)
        .filter((href) => getPathOnly(href) !== pathname),
    [pathname, routes],
  );
  const routeQueueKey = routeQueue.join("|");

  useEffect(() => {
    if (!routeQueue.length || !canWarmOnCurrentNetwork() || document.visibilityState !== "visible") {
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const idleCallbacks: number[] = [];
    const idleWindow = window as typeof window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };

    function queueNext(index: number) {
      if (cancelled || index >= routeQueue.length) {
        return;
      }

      const delayMs = index === 0 ? 1400 : 1900;
      const timerId = window.setTimeout(() => {
        const warmRoute = () => {
          if (cancelled || document.visibilityState !== "visible") {
            return;
          }

          prefetchRoute(router, routeQueue[index]);
          queueNext(index + 1);
        };

        if (idleWindow.requestIdleCallback) {
          idleCallbacks.push(idleWindow.requestIdleCallback(warmRoute, { timeout: 2600 }));
        } else {
          warmRoute();
        }
      }, delayMs);

      timers.push(timerId);
    }

    queueNext(0);

    return () => {
      cancelled = true;
      timers.forEach((timerId) => window.clearTimeout(timerId));

      if (idleWindow.cancelIdleCallback) {
        idleCallbacks.forEach((callbackId) => idleWindow.cancelIdleCallback?.(callbackId));
      }
    };
  }, [routeQueue, routeQueueKey, router]);

  return null;
}
