"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2Off, MessageCircle, Sparkles } from "lucide-react";
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

type WhatsAppActivationPanelProps = {
  initialActivation: WhatsAppAssistantActivationSnapshot;
};

const exampleMessages = [
  "recebi 350 do Joao no pix",
  "paguei 90 de internet",
  "ajustar saldo para 2 mil",
  "como esta meu mes?",
  "quais obrigacoes estao pendentes?",
];

export function WhatsAppActivationPanel({ initialActivation }: WhatsAppActivationPanelProps) {
  const [activation, setActivation] = useState(initialActivation);
  const [copyState, setCopyState] = useState<"idle" | "code" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const displayUserNumber = activation.phoneNumber ? formatWhatsAppNumber(activation.phoneNumber) : null;
  const activationUrl = activation.activationCode
    ? buildWhatsAppActivationUrl(activation.activationCode)
    : `https://wa.me/${activation.assistantNumber}`;
  const status = getStatusContent(activation);
  const usageGuide = getUsageGuide(activation);
  const linked = activation.status === "linked";
  const pendingActivation = activation.status === "pending" && Boolean(activation.activationCode);
  const statusBadgeVariant = linked ? "success" : "danger";

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
      <Card className="summary-shell overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="hero-pill w-fit" variant="secondary">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Helena
                </Badge>
                <Badge variant={statusBadgeVariant}>{status.label}</Badge>
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Helena no WhatsApp</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  A Helena funciona pelo WhatsApp para registrar movimentacoes e responder consultas rapidas da sua conta.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div
              className={cn(
                "rounded-[28px] border p-4 sm:p-5",
                linked
                  ? "border-success/18 bg-[linear-gradient(180deg,hsl(152_60%_96%)_0%,hsl(152_36%_92%)_100%)]"
                  : "border-destructive/18 bg-[linear-gradient(180deg,hsl(0_100%_99%)_0%,hsl(0_82%_95%)_100%)]",
              )}
            >
              <p
                className={cn(
                  "text-[11px] font-bold uppercase tracking-[0.1em]",
                  linked ? "text-success/80" : "text-destructive/80",
                )}
              >
                {linked ? "WhatsApp ativo" : pendingActivation ? "Falta um passo" : "Vinculacao"}
              </p>
              <h2
                className={cn(
                  "mt-1 text-lg font-extrabold tracking-tight",
                  linked ? "text-success" : "text-foreground",
                )}
              >
                {linked
                  ? "Conversa pronta para usar"
                  : pendingActivation
                    ? "Conclua a ativacao no WhatsApp"
                    : "Ative a Helena em poucos segundos"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{status.description}</p>
              {displayUserNumber ? (
                <p className="mt-2 text-sm font-semibold text-foreground">
                  WhatsApp vinculado: {displayUserNumber}
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {linked ? (
                  <Button asChild className="flex-1">
                    <a href={activationUrl} rel="noreferrer" target="_blank">
                      <MessageCircle className="h-4 w-4" />
                      Abrir WhatsApp
                    </a>
                  </Button>
                ) : pendingActivation ? (
                  <Button asChild className="flex-1">
                    <a href={activationUrl} rel="noreferrer" target="_blank">
                      <MessageCircle className="h-4 w-4" />
                      Continuar ativacao
                    </a>
                  </Button>
                ) : (
                  <Button className="flex-1" disabled={isPending} onClick={handleStartActivation} type="button">
                    <Sparkles className="h-4 w-4" />
                    Ativar Helena
                  </Button>
                )}

                {linked ? (
                  <Button
                    className="sm:w-auto"
                    disabled={isPending}
                    onClick={handleDisconnect}
                    type="button"
                    variant="outline"
                  >
                    <Link2Off className="h-4 w-4" />
                    Desvincular
                  </Button>
                ) : null}
              </div>

              {pendingActivation ? (
                <div className="mt-4 rounded-[24px] border border-white/70 bg-white/55 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Codigo de ativacao
                      </p>
                      <p className="font-mono text-xl font-extrabold tracking-[0.2em] text-foreground">
                        {activation.activationCode}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleCopy(activation.activationCode!)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {copyState === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copyState === "code" ? "Codigo copiado" : "Copiar codigo"}
                    </Button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    O botao acima ja abre o WhatsApp com a mensagem pronta para envio.
                  </p>
                </div>
              ) : null}

              {copyState === "error" ? (
                <p className="mt-3 text-sm font-semibold text-destructive">
                  Nao consegui copiar automaticamente. Copie o codigo manualmente.
                </p>
              ) : null}
              {errorMessage ? <p className="mt-3 text-sm font-semibold text-destructive">{errorMessage}</p> : null}
            </div>

            <div className="surface-panel rounded-[28px] p-4 sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Como usar</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">{usageGuide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{usageGuide.description}</p>

              <div className="mt-4 space-y-2">
                {usageGuide.steps.map((step, index) => (
                  <div
                    className="surface-panel-muted flex gap-3 rounded-[24px] px-4 py-3 text-sm leading-6 text-foreground"
                    key={step}
                  >
                    <span className="icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-sm font-extrabold text-primary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Exemplos de mensagem
            </p>
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">O que mandar para a Helena</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {linked
                ? "Escreva do jeito mais natural para voce. A Helena entende frases curtas e objetivas."
                : "Depois de ativar, voce pode falar assim no WhatsApp."}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {exampleMessages.map((example) => (
              <div className="surface-panel-muted rounded-[24px] p-4" key={example}>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Exemplo</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-foreground">"{example}"</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getStatusContent(activation: WhatsAppAssistantActivationSnapshot) {
  switch (activation.status) {
    case "linked":
      return {
        description: "Seu WhatsApp ja esta vinculado. Agora voce pode abrir a conversa e usar a Helena sempre que precisar.",
        label: "WhatsApp vinculado",
      };
    case "pending":
      return {
        description: activation.activationExpiresAt
          ? `Seu codigo ja foi gerado. Envie a primeira mensagem ate ${formatDateTime(activation.activationExpiresAt)} para concluir o vinculo.`
          : "Seu codigo ja foi gerado. Abra o WhatsApp e envie a primeira mensagem para concluir o vinculo.",
        label: "Aguardando confirmacao",
      };
    case "expired":
      return {
        description: "O codigo anterior expirou. Gere uma nova ativacao para continuar.",
        label: "Ativacao expirada",
      };
    case "revoked":
      return {
        description: "Esse WhatsApp foi desvinculado. Voce pode ativar novamente quando quiser.",
        label: "WhatsApp desvinculado",
      };
    default:
      return {
        description: "Ative a Helena para conectar seu WhatsApp com seguranca e usar esse canal no dia a dia.",
        label: "Ainda nao ativado",
      };
  }
}

function getUsageGuide(activation: WhatsAppAssistantActivationSnapshot) {
  if (activation.status === "linked") {
    return {
      description:
        "A Helena foi feita para uso rapido no WhatsApp. Voce manda uma mensagem simples, ela responde com base na sua conta e registra quando fizer sentido.",
      steps: [
        "Abra a conversa pelo botao desta tela.",
        "Envie entradas, despesas, ajustes de saldo ou perguntas sobre sua conta.",
        "Use o app para revisar historico, fechamento e configuracoes quando quiser.",
      ],
      title: "Use pelo WhatsApp no dia a dia",
    };
  }

  if (activation.status === "pending") {
    return {
      description:
        "Falta so confirmar o vinculo. Depois disso, a Helena passa a funcionar direto no seu WhatsApp.",
      steps: [
        "Abra o WhatsApp pelo botao de continuar ativacao.",
        "Envie a mensagem pronta com o codigo para concluir o vinculo.",
        "Depois, use a conversa para registrar movimentacoes e fazer consultas rapidas.",
      ],
      title: "Finalize a ativacao",
    };
  }

  return {
    description:
      "A ativacao leva poucos segundos e deixa a Helena pronta no seu WhatsApp para registrar e consultar sua conta.",
    steps: [
      "Toque em Ativar Helena para gerar seu codigo seguro.",
      "Abra o WhatsApp e envie a mensagem pronta para concluir o vinculo.",
      "Depois disso, fale com a Helena direto no WhatsApp sempre que precisar.",
    ],
    title: "Ative e comece a usar",
  };
}

function formatWhatsAppNumber(number: string) {
  const digits = number.replace(/\D/g, "");

  if (digits.length !== 13) {
    return number;
  }

  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
