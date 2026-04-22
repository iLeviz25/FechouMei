"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot, Loader2, Send, Trash2 } from "lucide-react";
import { clearAgentConversation, sendAgentMessage } from "@/app/app/agente/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentConversationSnapshot, AgentConversationState, AgentMessage } from "@/lib/agent/types";

const examples = [
  "Paguei 120 de internet",
  "Como esta meu mes?",
  "Qual meu limite do MEI?",
  "Quais obrigacoes estao pendentes?",
];

const welcomeMessage: AgentMessage = {
  id: "welcome",
  role: "agent",
  content: "Oi, eu sou a Helena. Posso te ajudar com resumo do mes, limite do MEI e registros rapidos.",
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
      return "Aguardando confirmacao";
    }

    if (state.status === "collecting") {
      return "Coletando dados";
    }

    return "Pronta";
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
        setMessages((current) => [
          ...current,
          {
            content: "Nao consegui enviar sua mensagem agora. Tente novamente em instantes.",
            id: crypto.randomUUID(),
            role: "agent",
          },
        ]);
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
            content: "Nao consegui limpar a conversa agora. Tente novamente em instantes.",
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

  const empty = messages.length === 1 && messages[0]?.id === "welcome";

  return (
    <Card className="flex min-h-[620px] flex-col overflow-hidden">
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="flex items-center gap-3 border-b border-border/70 bg-muted/30 px-5 py-4">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground shadow-glow">
            <Bot className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">Helena no app</p>
            <p className="text-xs text-muted-foreground">Chat de apoio rapido com os dados da sua conta.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={state.status === "idle" ? "success" : "warning"}>{stateLabel}</Badge>
            <Button onClick={handleClearConversation} size="sm" type="button" variant="outline">
              <Trash2 className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </div>

        {!isPersistent ? (
          <div className="border-b border-border/70 bg-secondary-soft px-5 py-3 text-sm text-secondary-foreground">
            Modo temporario: aplique a migration da Helena no Supabase para salvar a conversa.
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Bot className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-extrabold tracking-tight text-foreground">Como posso ajudar?</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Pergunte sobre seu mes, limite do MEI, obrigacoes ou mande um registro em linguagem natural.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {examples.map((example) => (
                  <button
                    className="rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary-soft/30"
                    disabled={isPending}
                    key={example}
                    onClick={() => submitMessage(example)}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")} key={message.id}>
                  <div className={cn("flex max-w-[90%] gap-2", message.role === "user" ? "flex-row-reverse" : "flex-row")}>
                    {message.role === "agent" ? (
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-primary-foreground">
                        <Bot className="h-4 w-4" />
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm",
                        message.role === "user"
                          ? "rounded-br-md bg-gradient-brand text-primary-foreground"
                          : "rounded-bl-md border border-border/70 bg-muted/30 text-foreground",
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}

              {isPending ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-[22px] rounded-bl-md border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Pensando...
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {!empty ? (
          <div className="border-t border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {examples.map((example) => (
                <button
                  className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary-soft/30"
                  disabled={isPending}
                  key={example}
                  onClick={() => submitMessage(example)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <form className="flex items-end gap-2 border-t border-border/70 bg-card px-4 py-4 sm:px-5" onSubmit={handleSubmit}>
          <textarea
            className="min-h-[52px] max-h-32 flex-1 resize-none rounded-[20px] border border-input bg-background px-4 py-3 text-sm leading-6 shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
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
          <Button className="shrink-0" disabled={isPending || !input.trim()} size="icon" type="submit">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
