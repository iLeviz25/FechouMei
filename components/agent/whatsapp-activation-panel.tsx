"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
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
    icon: ArrowUpRight,
    text: '"Paguei 120 de internet"',
    tone: "danger" as const,
  },
  {
    icon: ArrowDownLeft,
    text: '"Recebi 800 de cliente"',
    tone: "success" as const,
  },
  {
    icon: Wallet,
    text: '"Como esta meu mes?"',
    tone: "warning" as const,
  },
  {
    icon: ShieldCheck,
    text: '"Qual meu limite do MEI?"',
    tone: "neutral" as const,
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
    ? "Tudo acontece pelo WhatsApp: mande a mensagem e a Helena responde por la."
    : "Conecte o WhatsApp para comecar a usar.";

  function handleStartActivation() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const nextActivation = await startWhatsAppActivation();
        setActivation(nextActivation);
      } catch {
        setErrorMessage("Nao consegui iniciar a ativacao agora. Tente novamente em instantes.");
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
        setErrorMessage("Nao consegui desvincular o WhatsApp agora. Tente novamente.");
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
              Sua assistente do MEI. Conecte seu WhatsApp para registrar movimentacoes e consultar a Helena por la.
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
                  Helena no WhatsApp
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
                      Desvincular
                    </Button>
                  </>
                ) : pendingActivation ? (
                  <>
                    <Button asChild className="bg-secondary text-secondary-foreground shadow-amber hover:bg-secondary/90">
                      <a href={activationUrl} rel="noreferrer" target="_blank">
                        <MessageCircle className="h-4 w-4" />
                        Continuar no WhatsApp
                      </a>
                    </Button>
                    <Button
                      onClick={() => handleCopy(activation.activationCode!)}
                      type="button"
                      variant="outline"
                    >
                      {copyState === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copyState === "code" ? "Codigo copiado" : "Copiar codigo"}
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
                    Conectar WhatsApp
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white/82">
                  Seguro - usa so seu numero
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
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/68">Codigo de ativacao</p>
                  <p className="font-mono text-2xl font-extrabold tracking-[0.18em] text-white">
                    {activation.activationCode}
                  </p>
                </div>
                <p className="max-w-xs text-sm leading-6 text-white/78">
                  O botao acima ja abre o WhatsApp com a mensagem pronta para envio.
                </p>
              </div>
            </div>
          ) : null}

          {copyState === "error" ? (
            <p className="text-sm font-semibold text-secondary">Nao consegui copiar automaticamente. Copie o codigo manualmente.</p>
          ) : null}
          {errorMessage ? <p className="text-sm font-semibold text-secondary">{errorMessage}</p> : null}
        </div>
      </section>

      <Card className="overflow-hidden rounded-[30px]">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Exemplos</p>
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">
              Coisas que voce pode mandar pra Helena
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
          "Mande mensagens para a Helena no WhatsApp para registrar entradas e despesas em segundos. Sem planilha, sem app aberto.",
        statusLabel: "WhatsApp pronto",
      };
    case "pending":
      return {
        description:
          "Seu vinculo ja foi iniciado. Abra o WhatsApp, envie a mensagem pronta e termine a conexao em poucos segundos.",
        statusLabel: "Falta um passo",
      };
    case "expired":
      return {
        description:
          "O codigo anterior expirou. Gere uma nova conexao para voltar a usar a Helena pelo WhatsApp com seguranca.",
        statusLabel: "Codigo expirado",
      };
    case "revoked":
      return {
        description:
          "O WhatsApp foi desvinculado. Voce pode conectar novamente quando quiser para voltar a registrar e consultar por la.",
        statusLabel: "Desvinculado",
      };
    default:
      return {
        description:
          "Mande mensagens para a Helena no WhatsApp para registrar entradas e despesas em segundos. Sem planilha, sem app aberto.",
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
