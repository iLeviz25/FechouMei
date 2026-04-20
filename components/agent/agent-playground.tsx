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
    "Oi, eu sou a Helena. Este chat é só um apoio dentro do app; o canal principal é o WhatsApp.",
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
      {isOpen ? (
        <section className="fixed inset-x-3 bottom-24 z-40 max-h-[calc(100vh-8rem)] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)] md:bottom-6 md:left-auto md:right-6 md:w-[420px]">
          <header className="border-b border-neutral-100 bg-neutral-50/90 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-md border border-emerald-100 bg-white p-2 text-emerald-700 shadow-sm">
                  <Bot className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold text-neutral-950">Helena no app</p>
                  <p className="text-xs leading-5 text-neutral-500">
                    Apoio rápido enquanto o WhatsApp é o canal principal.
                  </p>
                </div>
              </div>
              <Button className="h-8 w-8 shrink-0" onClick={() => setIsOpen(false)} size="icon" type="button" variant="ghost">
                <X className="h-4 w-4" />
                <span className="sr-only">Fechar chat</span>
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={state.status === "idle" ? "success" : "warning"} className="w-fit">
                {stateLabel}
              </Badge>
              <Button
                className="h-7 px-2 text-xs"
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

          <div className="flex h-[min(620px,calc(100vh-14rem))] flex-col gap-3 p-3">
            {!isPersistent ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Modo temporário: aplique a migration da Helena no Supabase para salvar a conversa.
              </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50/70 p-3">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-lg border px-3 py-2 text-sm leading-6 shadow-sm",
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

            <div className="space-y-2">
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

      <Button
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-[0_16px_48px_rgba(16,185,129,0.35)] md:bottom-6 md:right-6"
        onClick={() => setIsOpen(true)}
        size="icon"
        type="button"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="sr-only">Abrir chat da Helena no app</span>
      </Button>
    </>
  );
}
