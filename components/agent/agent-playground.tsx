"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot, Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { clearAgentConversation, sendAgentMessage } from "@/app/app/agente/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentConversationSnapshot, AgentConversationState, AgentMessage } from "@/lib/agent/types";

const examples = [
  "Paguei 120 de internet",
  "Como está meu mês?",
  "Qual meu limite do MEI?",
];

const welcomeMessage: AgentMessage = {
  id: "welcome",
  role: "agent",
  content:
    "Oi, eu sou a Helena. Este chat é um apoio dentro do app; o canal principal continua sendo o WhatsApp.",
};

export function AgentPlayground({
  initialConversation,
}: {
  initialConversation: AgentConversationSnapshot;
}) {
  const [isOpen, setIsOpen] = useState(false);
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
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isPending, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

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
    setIsOpen(true);

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
    <>
      {!isOpen ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-950">Helena no app</p>
                  <p className="text-xs leading-5 text-neutral-500">Chat de apoio rápido dentro do app.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="w-fit" variant={state.status === "idle" ? "success" : "warning"}>
                  {stateLabel}
                </Badge>
                {!isPersistent ? (
                  <Badge className="w-fit" variant="warning">
                    Modo temporário
                  </Badge>
                ) : null}
              </div>
            </div>

            <Button className="shrink-0" onClick={() => setIsOpen(true)} type="button">
              <MessageCircle className="h-4 w-4" />
              Abrir chat
            </Button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {examples.map((example) => (
              <button
                className="shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                disabled={isPending}
                key={example}
                onClick={() => submitMessage(example)}
                type="button"
              >
                {example}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isOpen ? (
        <section className="fixed inset-x-0 top-0 z-40 flex h-[100dvh] flex-col bg-white md:inset-auto md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] md:right-6 md:top-auto md:h-[min(720px,calc(100vh-3rem))] md:w-[420px] md:overflow-hidden md:rounded-lg md:border md:border-neutral-200 md:shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
          <header className="shrink-0 border-b border-neutral-100 bg-white/95 px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top))] backdrop-blur md:bg-neutral-50/90 md:px-3 md:pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-md border border-emerald-100 bg-white p-2 text-emerald-700 shadow-sm">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-neutral-950">Helena no app</p>
                  <p className="text-xs leading-5 text-neutral-500">
                    Apoio rápido no app. O canal principal continua sendo o WhatsApp.
                  </p>
                </div>
              </div>

              <Button
                className="h-10 w-10 shrink-0"
                onClick={() => setIsOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar chat</span>
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="w-fit" variant={state.status === "idle" ? "success" : "warning"}>
                {stateLabel}
              </Badge>
              <Button
                className="h-8 px-2 text-xs"
                disabled={isPending}
                onClick={handleClearConversation}
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
              {!isPersistent ? (
                <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  Modo temporário: aplique a migration da Helena no Supabase para salvar a conversa.
                </p>
              ) : null}

              <div className="space-y-3">
                {messages.map((message) => (
                  <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                    <div
                      className={cn(
                        "max-w-[90%] rounded-lg border px-3 py-2 text-sm leading-6 shadow-sm",
                        message.role === "user"
                          ? "border-emerald-200 bg-emerald-700 text-white"
                          : "border-neutral-200 bg-neutral-50 text-neutral-800",
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

            <div className="shrink-0 border-t border-neutral-200 bg-white/95 px-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {examples.map((example) => (
                  <button
                    className="shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                    disabled={isPending}
                    key={example}
                    onClick={() => submitMessage(example)}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <form className="flex items-end gap-2" onSubmit={handleSubmit}>
                <textarea
                  className="min-h-11 max-h-32 flex-1 resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitMessage(input);
                    }
                  }}
                  placeholder="Mensagem para a Helena"
                  rows={1}
                  value={input}
                />
                <Button className="h-11 shrink-0 px-3" disabled={isPending || !input.trim()} type="submit">
                  <Send className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only">Enviar</span>
                </Button>
              </form>
            </div>
          </div>
        </section>
      ) : null}

      {!isOpen ? (
        <Button
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-40 hidden h-14 w-14 rounded-full shadow-[0_16px_48px_rgba(16,185,129,0.35)] md:flex"
          onClick={() => setIsOpen(true)}
          size="icon"
          type="button"
        >
          <MessageCircle className="h-6 w-6" />
          <span className="sr-only">Abrir chat da Helena no app</span>
        </Button>
      ) : null}
    </>
  );
}
