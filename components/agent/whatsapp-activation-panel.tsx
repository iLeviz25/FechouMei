"use client";

import { useState, useTransition } from "react";
import {
  Check,
  CircleAlert,
  Clock3,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WhatsAppAssistantActivationSnapshot } from "@/lib/channels/whatsapp/activation";

type WhatsAppActivationPanelProps = {
  initialActivation: WhatsAppAssistantActivationSnapshot;
};

const exampleMessages = [
  "recebi 350 do João",
  "paguei 90 de internet",
  "ajustar saldo para 2 mil",
  "como está meu mês?",
  "quais obrigações estão pendentes?",
];

export function WhatsAppActivationPanel({ initialActivation }: WhatsAppActivationPanelProps) {
  const [activation, setActivation] = useState(initialActivation);
  const [copyState, setCopyState] = useState<"idle" | "code" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const displayUserNumber = activation.phoneNumber ? formatWhatsAppNumber(activation.phoneNumber) : null;
  const activationUrl = activation.activationCode
    ? `https://wa.me/${activation.assistantNumber}?text=${encodeURIComponent(
        `Ativar Helena FechouMEI: ${activation.activationCode}`,
      )}`
    : `https://wa.me/${activation.assistantNumber}`;
  const status = getStatusContent(activation);

  function handleStartActivation() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const nextActivation = await startWhatsAppActivation();
        setActivation(nextActivation);
      } catch {
        setErrorMessage("Não consegui iniciar a ativação agora. Tente de novo em instantes.");
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
        setErrorMessage("Não consegui desvincular o WhatsApp agora. Tente novamente.");
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
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5 p-4 sm:p-6">
            <div className="space-y-3">
              <Badge variant="success" className="w-fit">
                Helena
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                  Helena no WhatsApp
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
                  A Helena é a assistente financeira do FechouMEI. Ela registra entradas, despesas e responde consultas rápidas em conversa natural.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Canal principal
                  </p>
                  <p className="text-2xl font-semibold text-neutral-950">WhatsApp da Helena</p>
                  <p className="text-sm leading-6 text-neutral-600">
                    A ativação vincula seu WhatsApp à sua conta. Depois disso, basta conversar com a Helena por lá.
                  </p>
                </div>
                <div className="grid gap-2 sm:min-w-52">
                  {activation.status === "linked" ? (
                    <Button asChild className="min-h-11">
                      <a href={activationUrl} rel="noreferrer" target="_blank">
                        <MessageCircle className="h-4 w-4" />
                        Conversar com a Helena
                      </a>
                    </Button>
                  ) : activation.status === "pending" && activation.activationCode ? (
                    <Button asChild className="min-h-11">
                      <a href={activationUrl} rel="noreferrer" target="_blank">
                        <MessageCircle className="h-4 w-4" />
                        Ativar com a Helena
                      </a>
                    </Button>
                  ) : (
                    <Button className="min-h-11" disabled={isPending} onClick={handleStartActivation} type="button">
                      <Sparkles className="h-4 w-4" />
                      Ativar Helena
                    </Button>
                  )}
                </div>
              </div>

              {activation.status === "pending" && activation.activationCode ? (
                <div className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Código de ativação
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xl font-semibold tracking-wide text-neutral-950">{activation.activationCode}</p>
                    <Button
                      className="min-h-10"
                      onClick={() => handleCopy(activation.activationCode!)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {copyState === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copyState === "code" ? "Código copiado" : "Copiar código"}
                    </Button>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    O botão já abre o WhatsApp com esse código na mensagem. Envie para concluir o vínculo.
                  </p>
                </div>
              ) : null}

              {copyState === "error" ? (
                <p className="mt-3 text-sm font-medium text-rose-700">
                  Não consegui copiar automaticamente. Selecione o texto e copie manualmente.
                </p>
              ) : null}
              {errorMessage ? (
                <p className="mt-3 text-sm font-medium text-rose-700">{errorMessage}</p>
              ) : null}
            </div>
          </div>

          <aside className="border-t border-neutral-200 bg-neutral-50/80 p-4 sm:p-6 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-md ${status.iconClass}`}>
                    {status.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">Status da conta</p>
                    <p className={`text-xs font-medium ${status.textClass}`}>{status.label}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-neutral-600">{status.description}</p>
                {displayUserNumber ? (
                  <p className="mt-2 text-sm font-medium text-neutral-800">
                    WhatsApp vinculado: {displayUserNumber}
                  </p>
                ) : null}
                {activation.status === "linked" ? (
                  <Button
                    className="mt-3 w-full min-h-10"
                    disabled={isPending}
                    onClick={handleDisconnect}
                    type="button"
                    variant="outline"
                  >
                    <Link2Off className="h-4 w-4" />
                    Desvincular WhatsApp
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-neutral-950">Como ativar</p>
                <div className="space-y-2">
                  {getSteps(activation.status).map((step, index) => (
                    <div className="flex gap-2 rounded-md border border-neutral-200 bg-white p-3 text-sm leading-6 text-neutral-700" key={step}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-700">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-emerald-50 p-2 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-neutral-950">Canal principal</p>
              <p className="text-sm leading-6 text-neutral-600">
                O WhatsApp fica para o uso rápido do dia a dia. O app continua como apoio para conferir registros, histórico e configurações.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold text-neutral-950">O que pedir</p>
              <p className="text-sm leading-6 text-neutral-600">
                Depois de ativar, mande frases curtas e naturais.
              </p>
            </div>
            <a className="hidden text-sm font-semibold text-emerald-700 hover:text-emerald-800 sm:inline-flex" href={activationUrl} rel="noreferrer" target="_blank">
              Abrir <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {exampleMessages.map((example) => (
              <span
                className="shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-700"
                key={example}
              >
                {example}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function getStatusContent(activation: WhatsAppAssistantActivationSnapshot) {
  switch (activation.status) {
    case "linked":
      return {
        description: "Seu WhatsApp já está vinculado. Agora é só abrir a conversa e falar com a Helena.",
        icon: <Check className="h-4 w-4" />,
        iconClass: "bg-emerald-50 text-emerald-700",
        label: "WhatsApp vinculado",
        textClass: "text-emerald-700",
      };
    case "pending":
      return {
        description: activation.activationExpiresAt
          ? `Envie a primeira mensagem pelo WhatsApp antes de ${formatDateTime(activation.activationExpiresAt)}.`
          : "Envie a primeira mensagem pelo WhatsApp para concluir a ativação.",
        icon: <Clock3 className="h-4 w-4" />,
        iconClass: "bg-amber-50 text-amber-700",
        label: "Aguardando primeira mensagem",
        textClass: "text-amber-700",
      };
    case "expired":
      return {
        description: "O código anterior expirou. Gere uma nova ativação para vincular seu WhatsApp.",
        icon: <CircleAlert className="h-4 w-4" />,
        iconClass: "bg-rose-50 text-rose-700",
        label: "Ativação expirada",
        textClass: "text-rose-700",
      };
    case "revoked":
      return {
        description: "O WhatsApp foi desvinculado desta conta. Você pode iniciar uma nova ativação quando quiser.",
        icon: <MessageCircle className="h-4 w-4" />,
        iconClass: "bg-neutral-100 text-neutral-700",
        label: "WhatsApp desvinculado",
        textClass: "text-neutral-700",
      };
    default:
      return {
        description: "Clique em ativar Helena para gerar um código seguro e vincular seu WhatsApp à sua conta.",
        icon: <MessageCircle className="h-4 w-4" />,
        iconClass: "bg-neutral-100 text-neutral-700",
        label: "Ainda não ativado",
        textClass: "text-neutral-700",
      };
  }
}

function getSteps(status: WhatsAppAssistantActivationSnapshot["status"]) {
  if (status === "linked") {
    return [
      "Abra a conversa pelo botão desta tela.",
      "Mande entradas, despesas ou consultas em linguagem natural.",
      "Confira os registros pelo app quando precisar.",
    ];
  }

  return [
    "Clique em ativar Helena.",
    "Abra o WhatsApp com a mensagem pronta.",
    "Envie o código para concluir o vínculo com sua conta.",
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
