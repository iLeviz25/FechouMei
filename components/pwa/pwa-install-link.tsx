"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type InstallFeedback = "installed" | "dismissed" | null;

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function isIosSafari() {
  const userAgent = window.navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/i.test(userAgent);

  return isIos && isSafari;
}

export function PwaInstallLink() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [canShowIosHelp, setCanShowIosHelp] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<InstallFeedback>(null);

  useEffect(() => {
    const standalone = isStandaloneMode();
    setIsStandalone(standalone);

    if (standalone) {
      return;
    }

    const mobile = isMobileViewport();
    setCanShowIosHelp(mobile && isIosSafari());

    function handleBeforeInstallPrompt(event: Event) {
      if (isStandaloneMode() || !isMobileViewport()) {
        return;
      }

      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallFeedback(null);
      setShowIosHelp(false);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setCanShowIosHelp(false);
      setShowIosHelp(false);
      setInstallFeedback("installed");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPrompt) {
      return;
    }

    const promptEvent = installPrompt;
    setInstallPrompt(null);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setInstallFeedback(choice.outcome === "accepted" ? "installed" : "dismissed");
    } catch {
      // Se o navegador bloquear o prompt, a tela continua funcionando normalmente.
      setInstallFeedback(null);
    }
  }

  if (isStandalone || (!installPrompt && !canShowIosHelp && !installFeedback)) {
    return null;
  }

  if (installFeedback === "installed") {
    return (
      <p className="mt-2 text-center text-sm font-medium text-primary md:hidden" role="status">
        Instalação iniciada! O FechouMEI aparecerá entre seus aplicativos.
      </p>
    );
  }

  if (installFeedback === "dismissed") {
    return (
      <p className="mt-2 text-center text-sm text-muted-foreground md:hidden" role="status">
        Instalação cancelada. Se quiser, tente novamente pelo menu do navegador.
      </p>
    );
  }

  if (installPrompt) {
    return (
      <p className="mt-2 text-center text-sm text-muted-foreground md:hidden">
        Quer acessar como aplicativo?{" "}
        <button className="font-bold text-primary hover:underline" onClick={handleInstallClick} type="button">
          instale aqui
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 text-center text-sm text-muted-foreground md:hidden">
      <p>
        Quer acessar como aplicativo?{" "}
        <button className="font-bold text-primary hover:underline" onClick={() => setShowIosHelp(true)} type="button">
          veja como instalar
        </button>
      </p>

      {showIosHelp ? (
        <p
          className="mx-auto mt-2 max-w-xs rounded-2xl border border-primary/10 bg-primary-soft/70 px-3 py-2 text-xs leading-5 text-muted-foreground"
          role="status"
        >
          Toque no botão de compartilhar do Safari e depois em &quot;Adicionar à Tela de Início&quot;.
        </p>
      ) : null}
    </div>
  );
}
