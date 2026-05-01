import { timingSafeEqual } from "crypto";
import { asaasBillingTables } from "@/lib/billing/database";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type ParsedAsaasWebhookEvent = {
  asaasEventId: string | null;
  event: string;
  payload: Json;
};

export type AsaasWebhookAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "asaas_webhook_token_not_configured"
        | "asaas_webhook_unauthorized";
      status: 401 | 503;
    };

export type AsaasWebhookParseResult =
  | {
      ok: true;
      event: ParsedAsaasWebhookEvent;
    }
  | {
      ok: false;
      reason: "invalid_webhook_payload" | "missing_webhook_event";
    };

export type SaveAsaasWebhookEventResult = {
  status: "received" | "duplicate";
};

export function validateAsaasWebhookToken(request: Request): AsaasWebhookAuthResult {
  const configuredToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN?.trim();

  if (!configuredToken) {
    console.error("[asaas-webhook] Rejected request because ASAAS_WEBHOOK_AUTH_TOKEN is not configured.");
    return {
      ok: false,
      reason: "asaas_webhook_token_not_configured",
      status: 503,
    };
  }

  const providedToken = request.headers.get("asaas-access-token")?.trim();

  if (!providedToken || !safeSecretEquals(providedToken, configuredToken)) {
    return {
      ok: false,
      reason: "asaas_webhook_unauthorized",
      status: 401,
    };
  }

  return { ok: true };
}

export function parseAsaasWebhookEvent(payload: unknown): AsaasWebhookParseResult {
  if (!isRecord(payload)) {
    return {
      ok: false,
      reason: "invalid_webhook_payload",
    };
  }

  const event = typeof payload.event === "string" ? payload.event.trim() : "";

  if (!event) {
    return {
      ok: false,
      reason: "missing_webhook_event",
    };
  }

  return {
    ok: true,
    event: {
      asaasEventId: normalizeOptionalId(payload.id),
      event,
      payload: payload as Json,
    },
  };
}

export async function saveAsaasWebhookEvent({
  asaasEventId,
  event,
  payload,
}: ParsedAsaasWebhookEvent): Promise<SaveAsaasWebhookEventResult> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from(asaasBillingTables.webhookEvents)
    .insert({
      asaas_event_id: asaasEventId,
      event,
      payload,
      received_at: new Date().toISOString(),
      status: "received",
    });

  if (!error) {
    return { status: "received" };
  }

  if (asaasEventId && error.code === "23505") {
    return { status: "duplicate" };
  }

  throw error;
}

function safeSecretEquals(providedSecret: string, configuredSecret: string) {
  const provided = Buffer.from(providedSecret);
  const configured = Buffer.from(configuredSecret);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalId(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}
