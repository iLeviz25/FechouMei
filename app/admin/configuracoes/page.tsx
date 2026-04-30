import { AlertTriangle, CheckCircle2, Settings, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAdminSettings, type AdminSettingKey, type AdminSettingValue } from "@/lib/admin/settings";
import { saveAdminSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function settingValue<T extends AdminSettingValue>(value: AdminSettingValue, fallback: T): T {
  return typeof value === typeof fallback ? (value as T) : fallback;
}

function BooleanSetting({
  description,
  label,
  name,
  value,
}: {
  description: string;
  label: string;
  name: AdminSettingKey;
  value: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-extrabold text-foreground">{label}</p>
          <Badge variant="success">Ativo no sistema</Badge>
        </div>
        <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">{description}</p>
      </div>
      <input className="h-5 w-5 shrink-0 accent-primary" defaultChecked={value} name={name} type="checkbox" />
    </label>
  );
}

export default async function AdminConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [settingsResult, resolvedSearchParams] = await Promise.all([getAdminSettings(), searchParams]);
  const saved = getSingle(resolvedSearchParams.saved) === "1";
  const error = getSingle(resolvedSearchParams.error);
  const settings = settingsResult.settings;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Admin FechouMEI</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Configuracoes admin
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Consulte e ajuste parametros internos do produto sem alterar regras do app normal nesta fase.
            </p>
          </div>
          <Badge className="w-fit" variant={settingsResult.available ? "success" : "danger"}>
            {settingsResult.available ? "Carregado" : "Fallback"}
          </Badge>
        </div>
      </div>

      {!settingsResult.available ? (
        <Card className="overflow-hidden rounded-[26px] border-destructive/20 bg-destructive/5">
          <CardContent className="flex gap-4 p-5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-semibold leading-6 text-muted-foreground">
              {settingsResult.error ?? "Aplique a migration da Fase 5 para carregar configuracoes reais."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {saved ? (
        <div className="flex items-center gap-3 rounded-[22px] border border-primary/15 bg-primary-soft/55 p-4 text-sm font-semibold text-primary">
          <CheckCircle2 className="h-5 w-5" />
          Configuracoes salvas com sucesso.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-3 rounded-[22px] border border-destructive/15 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      ) : null}

      <form action={saveAdminSettingsAction} className="space-y-4">
        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Flags</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Operacao do produto</h2>
              </div>
              <Settings className="h-5 w-5 text-primary" />
            </div>

            <BooleanSetting
              description={settings.helena_enabled.description ?? "Controla disponibilidade da Helena."}
              label="Helena habilitada"
              name="helena_enabled"
              value={settingValue(settings.helena_enabled.value, true)}
            />
            <BooleanSetting
              description={settings.whatsapp_enabled.description ?? "Controla disponibilidade do WhatsApp."}
              label="WhatsApp habilitado"
              name="whatsapp_enabled"
              value={settingValue(settings.whatsapp_enabled.value, true)}
            />
            <BooleanSetting
              description={settings.maintenance_mode.description ?? "Bloqueia temporariamente a Helena para usuarios finais."}
              label="Modo manutencao"
              name="maintenance_mode"
              value={settingValue(settings.maintenance_mode.value, false)}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[26px]">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Suporte</p>
                <h2 className="mt-2 text-lg font-extrabold tracking-tight text-foreground">Mensagens e limites</h2>
              </div>
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>

            <label className="block space-y-2">
              <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-foreground">
                E-mail de suporte
                <Badge variant="secondary">Informativo/futuro</Badge>
              </span>
              <Input defaultValue={settingValue(settings.support_email.value, "") ?? ""} name="support_email" placeholder="suporte@fechoumei.com" type="email" />
              <span className="block text-xs font-semibold leading-5 text-muted-foreground">{settings.support_email.description}</span>
            </label>

            <label className="block space-y-2">
              <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-foreground">
                Mensagem publica de suporte
                <Badge variant="secondary">Informativo/futuro</Badge>
              </span>
              <textarea
                className="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm transition-[background-color,border-color,box-shadow,color] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10"
                defaultValue={settingValue(settings.public_support_message.value, "") ?? ""}
                maxLength={500}
                name="public_support_message"
                placeholder="Mensagem curta para suporte..."
              />
              <span className="block text-xs font-semibold leading-5 text-muted-foreground">
                {settings.public_support_message.description} Maximo de 500 caracteres.
              </span>
            </label>

            <label className="block space-y-2">
              <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-foreground">
                Maximo de mensagens da Helena por dia
                <Badge variant="success">Ativo no sistema</Badge>
              </span>
              <Input
                defaultValue={settings.max_agent_messages_per_day.value === null ? "" : String(settings.max_agent_messages_per_day.value)}
                min={0}
                max={100000}
                name="max_agent_messages_per_day"
                placeholder="Sem limite definido"
                type="number"
              />
              <span className="block text-xs font-semibold leading-5 text-muted-foreground">
                {settings.max_agent_messages_per_day.description} Deixe vazio ou 0 para nao limitar.
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit">Salvar configuracoes</Button>
        </div>
      </form>
    </div>
  );
}
