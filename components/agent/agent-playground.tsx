"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, Trash2 } from "lucide-react";
import { clearAgentConversation, sendAgentMessage } from "@/app/app/agente/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentConversationSnapshot, AgentConversationState, AgentMessage } from "@/lib/agent/types";

const examples = [
  "Entrou 500 do Cliente Ana",
  "Paguei 120 de internet",
  "Como está meu mês?",
  "Qual meu limite do MEI?",
  "Quais obrigações estão pendentes?",
  "Mostre os últimos registros",
];

const welcomeMessage: AgentMessage = {
  id: "welcome",
  role: "agent",
  content:
    "Oi. Já consigo registrar entradas e despesas simples, além de consultar resumo, limite, obrigações e registros recentes.",
};

export function AgentPlayground({
  initialConversation,
}: {
  initialConversation: AgentConversationSnapshot;
}) {
  const [input, setInput] = useState("");
  const [state, setState] = useState<AgentConversationState>(initialConversation.state);
  const [isPersistent, setIsPersistent] = useState(initialConversation.isPersistent ?? true);
  const [messages, setMessages] = useState<AgentMessage[]>(
    initialConversation.messages.length > 0 ? initialConversation.messages : [welcomeMessage],
  );
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stateLabel = useMemo(() => {
    if (state.status === "awaiting_confirmation") {
      return "Aguardando confirmação";
    }

    if (state.status === "collecting") {
      return "Coletando dados";
    }

    return "Pronto";
  }, [state.status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isPending]);

  function submitMessage(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isPending) {
      return;
    }

    const userMessage: AgentMessage = {
      content: trimmedMessage,
      id: crypto.randomUUID(),
      role: "user",
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");

    startTransition(async () => {
      try {
        const result = await sendAgentMessage({
          message: trimmedMessage,
          transientState: state,
        });

        setState(result.state);
        setIsPersistent(result.isPersistent ?? true);

        if (result.isPersistent === false) {
          const agentMessage: AgentMessage = {
            content: result.reply,
            id: crypto.randomUUID(),
            role: "agent",
          };

          setMessages((current) => [...current, agentMessage]);
          return;
        }

        setMessages(result.messages.length > 0 ? result.messages : [welcomeMessage]);
      } catch {
        const agentMessage: AgentMessage = {
          content: "Não consegui enviar sua mensagem agora. Tente novamente em instantes.",
          id: crypto.randomUUID(),
          role: "agent",
        };

        setMessages((current) => [...current, agentMessage]);
      }
    });
  }

  function handleClearConversation() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await clearAgentConversation();

        setState(result.state);
        setIsPersistent(result.isPersistent ?? true);
        setMessages([welcomeMessage]);
        setInput("");
      } catch {
        setMessages((current) => [
          ...current,
          {
            content: "Não consegui limpar a conversa agora. Tente novamente em instantes.",
            id: crypto.randomUUID(),
            role: "agent",
          },
        ]);
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitMessage(input);
  }

  return (
    <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <CardHeader className="border-b border-neutral-100 bg-neutral-50/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md border border-emerald-100 bg-white p-2 text-emerald-700 shadow-sm">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-neutral-950">Playground do agente</CardTitle>
              <CardDescription className="mt-1">
                A conversa fica salva para continuar mesmo depois de sair desta tela.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="h-8"
              disabled={isPending}
              onClick={handleClearConversation}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar conversa
            </Button>
            <Badge variant={state.status === "idle" ? "success" : "warning"} className="w-fit">
              {stateLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex max-h-[calc(100vh-190px)] min-h-[560px] flex-col gap-4 p-4 sm:p-5">
        {!isPersistent ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
            Modo temporário: aplique a migration do agente no Supabase para salvar a conversa ao sair da tela.
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <div className="space-y-3">
            {messages.map((message) => (
              <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                <div
                  className={cn(
                    "max-w-[86%] rounded-lg border px-3 py-2 text-sm leading-6 shadow-sm",
                    message.role === "user"
                      ? "border-emerald-200 bg-emerald-700 text-white"
                      : "border-neutral-200 bg-white text-neutral-800",
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isPending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Pensando...
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t border-neutral-100 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {examples.map((example) => (
              <button
                className="shrink-0 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50"
                disabled={isPending}
                key={example}
                onClick={() => submitMessage(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>

          <form className="flex gap-2" onSubmit={handleSubmit}>
            <textarea
              className="min-h-11 flex-1 resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitMessage(input);
                }
              }}
              placeholder="Digite uma mensagem para o agente"
              rows={1}
              value={input}
            />
            <Button className="h-11 shrink-0" disabled={isPending || !input.trim()} type="submit">
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
