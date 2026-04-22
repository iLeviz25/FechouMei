"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2Off,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  disconnectWhatsAppAssistant,
  startWhatsAppActivation,
} from "@/app/app/agente/actions";
import { buildWhatsAppActivationUrl, type WhatsAppAssistantActivationSnapshot } from "@/lib/channels/whatsapp/activation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type WhatsAppActivationPanelProps = {
  initialActivation: WhatsAppAssistantActivationSnapshot;
};

const exampleMessages = [
  "recebi 350 do Joao",
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
  const linked = activation.status === "linked";
  const pendingActivation = activation.status === "pending" && Boolean(activation.activationCode);

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
    <div className="space-y-5">
      <Card className="summary-shell overflow-hidden">
          <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="hero-pill w-fit" variant="secondary">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Helena
                </Badge>
                {linked ? (
                  <Badge className="border-success/20 bg-success/10 text-success" variant="secondary">
                    WhatsApp vinculado
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Helena no WhatsApp</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  Use o WhatsApp como canal principal para registrar movimentacoes e consultar seu mes em segundos.
                </p>
              </div>
            </div>
            <div className="hero-panel rounded-[24px] px-4 py-3 sm:px-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/70">
                Status
              </p>
              <p className="mt-1 text-base font-extrabold text-foreground">{status.label}</p>
            </div>
          </div>

          <div className="hero-panel rounded-[24px] p-4 sm:p-5">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary/70">
                {linked ? "Canal ativo" : "Ativacao"}
              </p>
              <p className="text-lg font-extrabold text-foreground">{status.label}</p>
              <p className="text-sm leading-6 text-muted-foreground">{status.description}</p>
              {displayUserNumber ? (
                <p className="text-sm font-semibold text-foreground">WhatsApp vinculado: {displayUserNumber}</p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              {linked ? (
                <Button asChild className="flex-1">
                  <a href={activationUrl} rel="noreferrer" target="_blank">
                    <MessageCircle className="h-4 w-4" />
                    Conversar com a Helena
                  </a>
                </Button>
              ) : pendingActivation ? (
                <Button asChild className="flex-1">
                  <a href={activationUrl} rel="noreferrer" target="_blank">
                    <MessageCircle className="h-4 w-4" />
                    Ativar no WhatsApp
                  </a>
                </Button>
              ) : (
                <Button className="flex-1" disabled={isPending} onClick={handleStartActivation} type="button">
                  <Sparkles className="h-4 w-4" />
                  Ativar Helena
                </Button>
              )}

              {linked ? (
                <Button className="sm:w-auto" disabled={isPending} onClick={handleDisconnect} type="button" variant="outline">
                  <Link2Off className="h-4 w-4" />
                  Desvincular
                </Button>
              ) : null}
            </div>

            {pendingActivation ? (
              <div className="surface-panel-muted mt-4 rounded-[20px] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      Codigo de ativacao
                    </p>
                    <p className="font-mono text-xl font-extrabold tracking-[0.2em] text-foreground">
                      {activation.activationCode}
                    </p>
                  </div>
                  <Button onClick={() => handleCopy(activation.activationCode!)} size="sm" type="button" variant="outline">
                    {copyState === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copyState === "code" ? "Codigo copiado" : "Copiar codigo"}
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  O botao ja abre o WhatsApp com a mensagem pronta para envio.
                </p>
              </div>
            ) : null}

            {copyState === "error" ? (
              <p className="mt-3 text-sm font-semibold text-secondary">
                Nao consegui copiar automaticamente. Copie o codigo manualmente.
              </p>
            ) : null}
            {errorMessage ? <p className="mt-3 text-sm font-semibold text-secondary">{errorMessage}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Como usar</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">
                {linked ? "Coisas que voce pode mandar" : "Como ativar"}
              </h2>
            </div>
            {linked ? (
              <a
                className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                href={activationUrl}
                rel="noreferrer"
                target="_blank"
              >
                Abrir
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>

          {linked ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {exampleMessages.map((example) => (
                <div className="surface-panel-muted rounded-[24px] px-4 py-3 text-sm font-semibold text-foreground" key={example}>
                  "{example}"
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {getSteps(activation.status).map((step, index) => (
                <div className="surface-panel-muted flex gap-3 rounded-[24px] px-4 py-3 text-sm leading-6 text-foreground" key={step}>
                  <span className="icon-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-sm font-extrabold text-primary">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          )}

          {linked ? (
            <div className="surface-panel-muted flex gap-3 rounded-[24px] p-4">
              <div className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">App como apoio</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use o WhatsApp para conversar rapido e o app para revisar historico, fechamento e ajustes.
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function getStatusContent(activation: WhatsAppAssistantActivationSnapshot) {
  switch (activation.status) {
    case "linked":
      return {
        description: "Seu WhatsApp ja esta vinculado. Agora e so abrir a conversa e falar com a Helena.",
        label: "WhatsApp vinculado",
      };
    case "pending":
      return {
        description: activation.activationExpiresAt
          ? `Envie a primeira mensagem antes de ${formatDateTime(activation.activationExpiresAt)}.`
          : "Envie a primeira mensagem no WhatsApp para concluir a ativacao.",
        label: "Aguardando primeira mensagem",
      };
    case "expired":
      return {
        description: "O codigo anterior expirou. Gere uma nova ativacao para vincular seu WhatsApp.",
        label: "Ativacao expirada",
      };
    case "revoked":
      return {
        description: "O WhatsApp foi desvinculado desta conta. Voce pode iniciar uma nova ativacao quando quiser.",
        label: "WhatsApp desvinculado",
      };
    default:
      return {
        description: "Clique em ativar Helena para gerar um codigo seguro e vincular seu WhatsApp a sua conta.",
        label: "Ainda nao ativado",
      };
  }
}

function getSteps(status: WhatsAppAssistantActivationSnapshot["status"]) {
  if (status === "linked") {
    return [
      "Abra a conversa pelo botao desta tela.",
      "Mande entradas, despesas ou perguntas em linguagem natural.",
      "Confira os registros e o fechamento pelo app quando precisar.",
    ];
  }

  return [
    "Clique em ativar Helena.",
    "Abra o WhatsApp com a mensagem pronta.",
    "Envie o codigo para concluir o vinculo com sua conta.",
  ];
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
