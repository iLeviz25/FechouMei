"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  FileSpreadsheet,
  Link2Off,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  disconnectWhatsAppAssistant,
  startWhatsAppActivation,
} from "@/app/app/agente/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  buildWhatsAppActivationUrl,
  type WhatsAppAssistantActivationSnapshot,
} from "@/lib/channels/whatsapp/activation";
import { cn } from "@/lib/utils";
import type { AgentConversationSnapshot } from "@/lib/agent/types";

type WhatsAppActivationPanelProps = {
  initialActivation: WhatsAppAssistantActivationSnapshot;
  initialConversation: AgentConversationSnapshot;
};

const exampleMessages = [
  {
    icon: ArrowDownLeft,
    text: '"Recebi 500 de um cliente"',
    tone: "success" as const,
  },
  {
    icon: ArrowUpRight,
    text: '"Paguei 120 de internet"',
    tone: "danger" as const,
  },
  {
    icon: Wallet,
    text: '"Como foi meu mês?"',
    tone: "warning" as const,
  },
  {
    icon: Wallet,
    text: '"Quanto falta para o limite MEI?"',
    tone: "neutral" as const,
  },
  {
    icon: ShieldCheck,
    text: '"Marcar DAS como pago"',
    tone: "neutral" as const,
  },
  {
    icon: FileSpreadsheet,
    text: '"Importar minha planilha"',
    tone: "warning" as const,
  },
];

export function WhatsAppActivationPanel({
  initialActivation,
  initialConversation: _initialConversation,
}: WhatsAppActivationPanelProps) {
  const [activation, setActivation] = useState(initialActivation);
  const [copyState, setCopyState] = useState<"idle" | "code" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const displayUserNumber = activation.phoneNumber ? formatWhatsAppNumber(activation.phoneNumber) : null;
  const activationUrl = activation.activationCode
    ? buildWhatsAppActivationUrl(activation.activationCode)
    : `https://wa.me/${activation.assistantNumber}`;
  const linked = activation.status === "linked";
  const pendingActivation = activation.status === "pending" && Boolean(activation.activationCode);
  const heroContent = getHeroContent(activation);
  const noteText = linked
    ? "Mande mensagens para a Helena quando quiser. Ela responde pelo WhatsApp."
    : "Conecte seu número para usar a Helena direto pelo WhatsApp.";

  function handleStartActivation() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const nextActivation = await startWhatsAppActivation();
        setActivation(nextActivation);
      } catch {
        setErrorMessage("Não foi possível começar a ativação agora. Tente novamente em instantes.");
      }
    });
  }

  function handleDisconnect() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const nextActivation = await disconnectWhatsAppAssistant();
        setActivation(nextActivation);
      } catch {
        setErrorMessage("Não foi possível desconectar o WhatsApp agora. Tente novamente.");
      }
    });
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("code");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2600);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Helena</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Sua assistente para organizar o MEI pelo WhatsApp. Ela entende mensagens simples para registrar entradas, despesas e consultar seu mês.
            </p>
          </div>

          <Badge className="w-fit shrink-0" variant="success">
            <Sparkles className="mr-1 h-3 w-3" />
            Helena
          </Badge>
        </div>
      </header>

      <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,hsl(155_48%_28%)_0%,hsl(155_46%_24%)_100%)] px-5 py-5 text-white shadow-elevated sm:px-6 sm:py-6">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <div className="icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-secondary">
              <MessageCircle className="h-5 w-5" />
            </div>

            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-secondary/15 bg-secondary/15 text-secondary shadow-none" variant="outline">
                  Canal principal
                </Badge>
                <Badge
                  className={cn(
                    "shadow-none",
                    linked && "border-white/10 bg-white/12 text-white",
                    !linked && "border-white/10 bg-white/8 text-white/82",
                  )}
                  variant="outline"
                >
                  {heroContent.statusLabel}
                </Badge>
              </div>

              <div className="space-y-2">
                <h2 className="text-[clamp(1.6rem,7vw,2.25rem)] font-extrabold tracking-tight text-white">
                  {linked ? "WhatsApp conectado" : "Ative a Helena no WhatsApp"}
                </h2>
                <p className="max-w-2xl text-[15px] leading-7 text-white/88">{heroContent.description}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {linked ? (
                  <>
                    <Button asChild className="bg-secondary text-secondary-foreground shadow-amber hover:bg-secondary/90">
                      <a href={activationUrl} rel="noreferrer" target="_blank">
                        <MessageCircle className="h-4 w-4" />
                        Abrir WhatsApp
                      </a>
                    </Button>
                    <Button disabled={isPending} onClick={handleDisconnect} type="button" variant="outline">
                      <Link2Off className="h-4 w-4" />
                      Desconectar WhatsApp
                    </Button>
                  </>
                ) : pendingActivation ? (
                  <>
                    <Button asChild className="bg-secondary text-secondary-foreground shadow-amber hover:bg-secondary/90">
                      <a href={activationUrl} rel="noreferrer" target="_blank">
                        <MessageCircle className="h-4 w-4" />
                        Abrir WhatsApp
                      </a>
                    </Button>
                    <Button
                      onClick={() => handleCopy(activation.activationCode!)}
                      type="button"
                      variant="outline"
                    >
                      {copyState === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copyState === "code" ? "Código copiado" : "Copiar código"}
                    </Button>
                  </>
                ) : (
                  <Button
                    className="bg-secondary text-secondary-foreground shadow-amber hover:bg-secondary/90"
                    disabled={isPending}
                    onClick={handleStartActivation}
                    type="button"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Começar ativação
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/82">
                  Vínculo seguro pelo seu número
                </span>
                {displayUserNumber ? (
                  <span className="rounded-full bg-white/8 px-3 py-1.5 font-semibold text-white/82">
                    Vinculado: {displayUserNumber}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {pendingActivation ? (
            <div className="rounded-[24px] border border-white/10 bg-white/8 p-4">
              <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/68">Seu código de ativação</p>
                  <p className="font-mono text-2xl font-extrabold tracking-[0.18em] text-white">
                    {activation.activationCode}
                  </p>
                </div>
                <p className="max-w-xs text-sm leading-6 text-white/78">
                  Envie este código para a Helena no WhatsApp para vincular seu número à sua conta.
                </p>
              </div>
            </div>
          ) : null}

          {copyState === "error" ? (
            <p className="text-sm font-semibold text-secondary">Não foi possível copiar automaticamente. Copie o código manualmente.</p>
          ) : null}
          {errorMessage ? <p className="text-sm font-semibold text-secondary">{errorMessage}</p> : null}
        </div>
      </section>

      <Card className="overflow-hidden rounded-[30px]">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Exemplos</p>
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">
              Mensagens que você pode mandar
            </h2>
          </div>

          <div className="space-y-3">
            {exampleMessages.map((example) => {
              const Icon = example.icon;

              return (
                <div className="surface-panel-muted flex items-center gap-3 rounded-[22px] px-4 py-4" key={example.text}>
                  <div
                    className={cn(
                      "icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                      example.tone === "danger" && "bg-destructive/10 text-destructive",
                      example.tone === "success" && "bg-primary/10 text-primary",
                      example.tone === "warning" && "bg-secondary-soft text-secondary-foreground",
                      example.tone === "neutral" && "bg-primary-soft text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-base font-semibold leading-7 text-foreground">{example.text}</p>
                </div>
              );
            })}
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{noteText}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function getHeroContent(activation: WhatsAppAssistantActivationSnapshot) {
  switch (activation.status) {
    case "linked":
      return {
        description:
          "Este número já está vinculado à sua conta. Você pode mandar mensagens para a Helena quando quiser.",
        statusLabel: "WhatsApp conectado",
      };
    case "pending":
      return {
        description:
          "Envie o código de ativação para a Helena no WhatsApp e termine o vínculo do seu número.",
        statusLabel: "Falta um passo",
      };
    case "expired":
      return {
        description:
          "O código anterior expirou. Gere um novo código para conectar a Helena pelo WhatsApp.",
        statusLabel: "Código expirado",
      };
    case "revoked":
      return {
        description:
          "O WhatsApp foi desconectado. Você pode conectar novamente quando quiser.",
        statusLabel: "WhatsApp desconectado",
      };
    default:
      return {
        description:
          "Conecte seu número para usar a Helena direto pelo WhatsApp.",
        statusLabel: "Canal principal",
      };
  }
}

function formatWhatsAppNumber(number: string) {
  const digits = number.replace(/\D/g, "");

  if (digits.length !== 13) {
    return number;
  }

  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
}
