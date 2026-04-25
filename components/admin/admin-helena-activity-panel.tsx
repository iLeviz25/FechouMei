"use client";

import { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AdminHelenaEvent } from "@/lib/admin/helena";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

function formatDate(value: string | null) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sem registro" : dateFormatter.format(date);
}

function includesText(value: string | null | undefined, query: string) {
  return (value ?? "").toLowerCase().includes(query);
}

export function AdminHelenaActivityPanel({ events }: { events: AdminHelenaEvent[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "error" | "success">("all");
  const [source, setSource] = useState("all");
  const sources = useMemo(() => [...new Set(events.map((event) => event.source))].sort(), [events]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesStatus = status === "all" || event.result === status;
        const matchesSource = source === "all" || event.source === source;
        const matchesText =
          !normalizedQuery ||
          includesText(event.eventType, normalizedQuery) ||
          includesText(event.summary, normalizedQuery) ||
          includesText(event.userName, normalizedQuery) ||
          includesText(event.email, normalizedQuery) ||
          includesText(event.status, normalizedQuery);

        return matchesStatus && matchesSource && matchesText;
      }),
    [events, normalizedQuery, source, status],
  );

  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="p-5">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Eventos recentes
            </p>
            <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Atividade da Helena</h2>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {filteredEvents.length} de {events.length} eventos carregados.
            </p>
          </div>
          <MessageCircle className="hidden h-5 w-5 text-primary lg:block" />
        </div>

        <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_150px_170px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar atividade..."
              value={query}
            />
          </label>
          <select
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground shadow-sm"
            onChange={(event) => setStatus(event.target.value as "all" | "error" | "success")}
            value={status}
          >
            <option value="all">Todos</option>
            <option value="success">Sucesso</option>
            <option value="error">Erro</option>
          </select>
          <select
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground shadow-sm"
            onChange={(event) => setSource(event.target.value)}
            value={source}
          >
            <option value="all">Todas as origens</option>
            {sources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {filteredEvents.length ? (
            filteredEvents.map((event, index) => (
              <div
                className="rounded-2xl border border-border/70 bg-background p-4"
                key={`${event.source}-${event.createdAt}-${index}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{event.source}</Badge>
                    <Badge variant={event.result === "error" ? "danger" : "success"}>
                      {event.result === "error" ? "Erro" : "Sucesso"}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-muted-foreground">{formatDate(event.createdAt)}</p>
                </div>
                <p className="mt-3 text-sm font-extrabold text-foreground">{event.eventType}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                  {event.userName ?? event.email ?? "Usuario nao identificado"} · {event.summary ?? event.status}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-primary-soft/45 p-4 text-sm font-semibold text-primary">
              Nenhuma atividade encontrada com esses filtros.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
