"use client";

import { completeOnboardingTour } from "@/app/app/onboarding-tour/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Receipt,
  Sparkles,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TourStep = {
  icon: LucideIcon;
  id:
    | "dashboard"
    | "movimentacoes"
    | "importacao"
    | "fechamento"
    | "relatorios"
    | "obrigacoes"
    | "helena"
    | "final";
  targetSelectors: string[];
  text: string;
  title: string;
};

type HighlightRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type TargetRect = HighlightRect & {
  bottom: number;
  isFixed: boolean;
  right: number;
};

type TourLayout = {
  cardStyle?: CSSProperties;
  highlightRect: HighlightRect | null;
  isMobile: boolean;
  placement: "desktop" | "mobile-above-target" | "mobile-bottom";
};

type OnboardingTourContextValue = {
  openTour: () => void;
};

const MOBILE_BREAKPOINT = 768;

const defaultTourLayout: TourLayout = {
  highlightRect: null,
  isMobile: false,
  placement: "desktop",
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

const tourSteps: TourStep[] = [
  {
    icon: LayoutDashboard,
    id: "dashboard",
    targetSelectors: ['[data-tour-target="dashboard-summary"]', '[data-tour-target="dashboard-nav"]'],
    title: "Seu resumo do mês",
    text: "Aqui você acompanha entradas, despesas, saldo do mês, faturamento anual e pontos de atenção do seu MEI.",
  },
  {
    icon: Receipt,
    id: "movimentacoes",
    targetSelectors: ['[data-tour-target="movimentacoes-nav"]'],
    title: "Registre entradas e despesas",
    text: "Use esta área para adicionar, editar, filtrar e exportar movimentações do seu negócio.",
  },
  {
    icon: Upload,
    id: "importacao",
    targetSelectors: ['[data-tour-target="importacao-nav"]'],
    title: "Importe seus registros antigos",
    text: "Se você já usa planilha, pode importar entradas e despesas por CSV ou XLSX, revisar os dados e salvar tudo com mais segurança.",
  },
  {
    icon: ClipboardCheck,
    id: "fechamento",
    targetSelectors: ['[data-tour-target="fechamento-nav"]'],
    title: "Confira seu fechamento",
    text: "Aqui você vê o resumo do mês, compara com períodos anteriores e confere os registros antes de enviar ao contador.",
  },
  {
    icon: FileText,
    id: "relatorios",
    targetSelectors: ['[data-tour-target="relatorios-nav"]'],
    title: "Gere seu relatório mensal",
    text: "Aqui você confere um resumo organizado do mês, com entradas, despesas, obrigações e dados para salvar em PDF ou enviar ao contador.",
  },
  {
    icon: BellRing,
    id: "obrigacoes",
    targetSelectors: ['[data-tour-target="obrigacoes-nav"]'],
    title: "Acompanhe suas obrigações",
    text: "Veja pendências do mês, lembretes e tarefas importantes para manter sua rotina organizada.",
  },
  {
    icon: MessageCircle,
    id: "helena",
    targetSelectors: ['[data-tour-target="helena-nav"]'],
    title: "Use a Helena pelo WhatsApp",
    text: "A Helena ajuda você a registrar movimentações, importar arquivos, exportar dados e consultar informações sem precisar abrir o app toda hora.",
  },
  {
    icon: Sparkles,
    id: "final",
    targetSelectors: [],
    title: "Pronto para começar",
    text: "Agora você já sabe o básico. Comece registrando uma entrada ou despesa, importe seus dados antigos ou chame a Helena no WhatsApp.",
  },
];

export function OnboardingTourProvider({
  children,
  completedAt,
}: {
  children: ReactNode;
  completedAt: string | null | undefined;
}) {
  const router = useRouter();
  const autoOpenedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedInSession, setCompletedInSession] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tourLayout, setTourLayout] = useState<TourLayout>(defaultTourLayout);

  const hasCompletedTour = Boolean(completedAt || completedInSession);
  const activeStep = tourSteps[activeIndex];
  const isLastStep = activeIndex === tourSteps.length - 1;

  const openTour = useCallback(() => {
    setActiveIndex(0);
    setErrorMessage(null);
    setIsOpen(true);
  }, []);

  const contextValue = useMemo(() => ({ openTour }), [openTour]);

  const updateLayout = useCallback(() => {
    if (!isOpen) {
      setTourLayout(defaultTourLayout);
      return;
    }

    const nextLayout = getTourLayout(activeStep);
    setTourLayout((current) => (areTourLayoutsEqual(current, nextLayout) ? current : nextLayout));
  }, [activeStep, isOpen]);

  useEffect(() => {
    if (hasCompletedTour || autoOpenedRef.current) {
      return;
    }

    autoOpenedRef.current = true;
    const timeout = window.setTimeout(() => {
      openTour();
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [hasCompletedTour, openTour]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setErrorMessage(null);
    scrollMobileTargetIntoView(activeStep.targetSelectors);

    let resizeFrame = 0;
    const firstFrame = window.requestAnimationFrame(updateLayout);
    const settleTimeout = window.setTimeout(updateLayout, 240);

    function scheduleLayoutUpdate() {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(updateLayout);
    }

    window.addEventListener("resize", scheduleLayoutUpdate, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleLayoutUpdate);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(resizeFrame);
      window.clearTimeout(settleTimeout);
      window.removeEventListener("resize", scheduleLayoutUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleLayoutUpdate);
    };
  }, [activeIndex, activeStep, isOpen, updateLayout]);

  const closeAndPersist = useCallback(async () => {
    if (isSaving) {
      return;
    }

    if (hasCompletedTour) {
      setIsOpen(false);
      setTourLayout(defaultTourLayout);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const result = await completeOnboardingTour();

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setCompletedInSession(result.completedAt);
      setIsOpen(false);
      setTourLayout(defaultTourLayout);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }, [hasCompletedTour, isSaving, router]);

  const goBack = useCallback(() => {
    setErrorMessage(null);
    setActiveIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setErrorMessage(null);

    if (isLastStep) {
      void closeAndPersist();
      return;
    }

    setActiveIndex((current) => Math.min(tourSteps.length - 1, current + 1));
  }, [closeAndPersist, isLastStep]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        void closeAndPersist();
      }

      if (event.key === "ArrowRight" && !isSaving) {
        goNext();
      }

      if (event.key === "ArrowLeft" && !isSaving) {
        goBack();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAndPersist, goBack, goNext, isOpen, isSaving]);

  return (
    <OnboardingTourContext.Provider value={contextValue}>
      {children}

      {isOpen ? (
        <OnboardingTourDialog
          activeIndex={activeIndex}
          errorMessage={errorMessage}
          isLastStep={isLastStep}
          isSaving={isSaving}
          layout={tourLayout}
          onBack={goBack}
          onNext={goNext}
          onSkip={() => void closeAndPersist()}
          step={activeStep}
        />
      ) : null}
    </OnboardingTourContext.Provider>
  );
}

export function useOnboardingTour() {
  return useContext(OnboardingTourContext) ?? { openTour: () => undefined };
}

function OnboardingTourDialog({
  activeIndex,
  errorMessage,
  isLastStep,
  isSaving,
  layout,
  onBack,
  onNext,
  onSkip,
  step,
}: {
  activeIndex: number;
  errorMessage: string | null;
  isLastStep: boolean;
  isSaving: boolean;
  layout: TourLayout;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  step: TourStep;
}) {
  const Icon = step.icon;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-neutral-950/40 print:hidden" />

      {layout.highlightRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] rounded-[22px] border-2 border-primary bg-white/10 shadow-[0_0_0_4px_hsl(var(--primary)/0.16),0_18px_42px_hsl(165_35%_10%/0.22)] print:hidden"
          data-tour-highlight
          style={{
            height: layout.highlightRect.height,
            left: layout.highlightRect.left,
            top: layout.highlightRect.top,
            width: layout.highlightRect.width,
          }}
        />
      ) : null}

      <div
        className={cn(
          "fixed z-[80] print:hidden",
          layout.isMobile
            ? cn(
                "inset-x-3 mx-auto max-w-[27rem]",
                layout.placement === "mobile-bottom" && "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
              )
            : "bottom-6 right-6 w-[27rem] max-w-[calc(100vw-2rem)]",
        )}
        data-tour-card
        style={layout.isMobile ? layout.cardStyle : undefined}
      >
        <section
          aria-describedby="onboarding-tour-description"
          aria-labelledby="onboarding-tour-title"
          aria-modal="true"
          className="flex max-h-[min(calc(100dvh-2rem),34rem)] min-h-0 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-elevated"
          role="dialog"
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-primary-soft text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-primary/15 bg-primary/10 text-primary" variant="outline">
                  Guia do app
                </Badge>
                <span className="text-xs font-bold text-muted-foreground">
                  {activeIndex + 1}/{tourSteps.length}
                </span>
              </div>
            </div>
            <button
              aria-label="Pular guia"
              className="mt-0.5 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving}
              onClick={onSkip}
              type="button"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-lg font-extrabold leading-tight tracking-tight text-foreground" id="onboarding-tour-title">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground" id="onboarding-tour-description">
                {step.text}
              </p>
            </div>

            <div
              aria-hidden="true"
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${tourSteps.length}, minmax(0, 1fr))` }}
            >
              {tourSteps.map((item, index) => (
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    index <= activeIndex ? "bg-primary" : "bg-muted",
                  )}
                  key={item.id}
                />
              ))}
            </div>

            {errorMessage ? (
              <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border/70 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:px-5">
            <Button disabled={activeIndex === 0 || isSaving} onClick={onBack} size="sm" type="button" variant="outline">
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Button disabled={isSaving} onClick={onSkip} size="sm" type="button" variant="ghost">
              Pular
            </Button>
            <Button className="col-span-2 sm:ml-auto" disabled={isSaving} onClick={onNext} size="sm" type="button">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLastStep ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {isLastStep ? "Concluir" : "Próximo"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function getTourLayout(step: TourStep): TourLayout {
  if (typeof window === "undefined") {
    return defaultTourLayout;
  }

  const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
  const target = step.targetSelectors.length > 0 ? findVisibleTarget(step.targetSelectors) : null;

  if (!target) {
    return {
      highlightRect: null,
      isMobile,
      placement: isMobile ? "mobile-bottom" : "desktop",
    };
  }

  const highlightRect = getHighlightRect(target, isMobile);

  if (!isMobile) {
    return {
      highlightRect,
      isMobile,
      placement: "desktop",
    };
  }

  if (!highlightRect) {
    return {
      highlightRect: null,
      isMobile,
      placement: "mobile-bottom",
    };
  }

  const viewportHeight = window.innerHeight;
  const estimatedCardHeight = step.id === "helena" ? 356 : 324;
  const bottomCardTop = viewportHeight - estimatedCardHeight - 20;
  const highlightBottom = highlightRect.top + highlightRect.height;
  const shouldLiftCard = target.isFixed || highlightBottom > bottomCardTop;

  if (!shouldLiftCard) {
    return {
      highlightRect,
      isMobile,
      placement: "mobile-bottom",
    };
  }

  const bottomOffset = Math.max(92, Math.ceil(viewportHeight - target.top + 12));
  const availableHeight = viewportHeight - bottomOffset - 16;

  if (availableHeight < 260) {
    return {
      highlightRect: null,
      isMobile,
      placement: "mobile-bottom",
    };
  }

  return {
    cardStyle: {
      bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))`,
      maxHeight: `calc(100dvh - ${bottomOffset + 16}px - env(safe-area-inset-bottom))`,
    },
    highlightRect,
    isMobile,
    placement: "mobile-above-target",
  };
}

function getHighlightRect(target: TargetRect, isMobile: boolean): HighlightRect | null {
  const padding = isMobile ? 6 : 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(6, target.left - padding);
  const right = Math.min(viewportWidth - 6, target.right + padding);
  const top = Math.max(6, target.top - padding);
  const bottom = Math.min(viewportHeight - 6, target.bottom + padding);
  const width = right - left;
  const height = bottom - top;

  if (width < 28 || height < 28) {
    return null;
  }

  return { height, left, top, width };
}

function scrollMobileTargetIntoView(selectors: string[]) {
  if (typeof window === "undefined" || window.innerWidth >= MOBILE_BREAKPOINT) {
    return;
  }

  const target = findTargetElement(selectors);

  if (!target || hasFixedAncestor(target)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const hasComfortableSpace = rect.top >= 72 && rect.bottom <= window.innerHeight - 360;

  if (!hasComfortableSpace) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }
}

function findVisibleTarget(selectors: string[]): TargetRect | null {
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

    for (const element of elements) {
      const rect = element.getBoundingClientRect();

      if (!isElementRendered(element, rect)) {
        continue;
      }

      const isVisible =
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;

      if (isVisible) {
        return {
          bottom: rect.bottom,
          height: rect.height,
          isFixed: hasFixedAncestor(element),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      }
    }
  }

  return null;
}

function findTargetElement(selectors: string[]) {
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const element = elements.find((item) => isElementRendered(item, item.getBoundingClientRect()));

    if (element) {
      return element;
    }
  }

  return null;
}

function isElementRendered(element: HTMLElement, rect: DOMRect) {
  const style = window.getComputedStyle(element);

  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function hasFixedAncestor(element: HTMLElement) {
  let current: HTMLElement | null = element;

  while (current) {
    const position = window.getComputedStyle(current).position;

    if (position === "fixed") {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function areTourLayoutsEqual(current: TourLayout, next: TourLayout) {
  return (
    current.isMobile === next.isMobile &&
    current.placement === next.placement &&
    current.cardStyle?.bottom === next.cardStyle?.bottom &&
    current.cardStyle?.maxHeight === next.cardStyle?.maxHeight &&
    areHighlightRectsEqual(current.highlightRect, next.highlightRect)
  );
}

function areHighlightRectsEqual(current: HighlightRect | null, next: HighlightRect | null) {
  if (!current || !next) {
    return current === next;
  }

  return (
    Math.round(current.height) === Math.round(next.height) &&
    Math.round(current.left) === Math.round(next.left) &&
    Math.round(current.top) === Math.round(next.top) &&
    Math.round(current.width) === Math.round(next.width)
  );
}
