import { timingSafeEqual } from "crypto";
import {
  provisionAccessForPaidAsaasEvent,
  shouldProvisionAccessForAsaasEvent,
} from "@/lib/billing/access-provisioning";
import {
  extractAsaasCheckout,
  extractAsaasCustomer,
  extractAsaasPayment,
  extractAsaasSubscription,
  getAsaasEventCategory,
  type ExtractedAsaasCheckout,
  type ExtractedAsaasCustomer,
  type ExtractedAsaasPayment,
  type ExtractedAsaasSubscription,
} from "@/lib/billing/asaas-events";
import { asaasBillingTables } from "@/lib/billing/database";
import type { AsaasWebhookEventStatus } from "@/lib/billing/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

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
  status: "received";
  webhookEventId: string;
} | {
  status: "duplicate";
  webhookEventId: string | null;
};

export type ProcessAsaasWebhookEventResult = {
  status: "processed" | "ignored";
  operations: string[];
  reason?: string;
};

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;
type WebhookEventUpdate = Database["public"]["Tables"]["asaas_webhook_events"]["Update"];
type AsaasCustomerInsert = Database["public"]["Tables"]["asaas_customers"]["Insert"];
type AsaasPaymentInsert = Database["public"]["Tables"]["asaas_payments"]["Insert"];
type AsaasSubscriptionInsert = Database["public"]["Tables"]["asaas_subscriptions"]["Insert"];
type AsaasCheckoutInsert = Database["public"]["Tables"]["asaas_checkouts"]["Insert"];

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
  const { data, error } = await supabase
    .from(asaasBillingTables.webhookEvents)
    .insert({
      asaas_event_id: asaasEventId,
      event,
      payload,
      received_at: new Date().toISOString(),
      status: "received",
    })
    .select("id")
    .single();

  if (!error && data) {
    return {
      status: "received",
      webhookEventId: data.id,
    };
  }

  if (asaasEventId && error.code === "23505") {
    const { data: existingEvent } = await supabase
      .from(asaasBillingTables.webhookEvents)
      .select("id")
      .eq("asaas_event_id", asaasEventId)
      .maybeSingle();

    return {
      status: "duplicate",
      webhookEventId: existingEvent?.id ?? null,
    };
  }

  throw error;
}

export async function processAsaasWebhookEvent(
  webhookEventId: string,
  event: ParsedAsaasWebhookEvent,
): Promise<ProcessAsaasWebhookEventResult> {
  const supabase = createServiceRoleClient();

  try {
    const result = await processAsaasWebhookEventPayload(supabase, event);

    await updateAsaasWebhookEventStatus(
      supabase,
      webhookEventId,
      result.status,
      result.reason,
    );

    return result;
  } catch (error) {
    const sanitizedError = sanitizeProcessingError(error);

    try {
      await updateAsaasWebhookEventStatus(
        supabase,
        webhookEventId,
        "failed",
        sanitizedError,
      );
    } catch (statusError) {
      console.error(
        "[asaas-webhook] Failed to mark webhook event as failed.",
        sanitizeProcessingError(statusError),
      );
    }

    throw error;
  }
}

async function processAsaasWebhookEventPayload(
  supabase: ServiceRoleClient,
  event: ParsedAsaasWebhookEvent,
): Promise<ProcessAsaasWebhookEventResult> {
  if (!isRecord(event.payload)) {
    return {
      status: "ignored",
      operations: [],
      reason: "invalid_payload_shape",
    };
  }

  const category = getAsaasEventCategory(event.event);

  if (category === "unknown") {
    return {
      status: "ignored",
      operations: [],
      reason: "unrecognized_event",
    };
  }

  const operations: string[] = [];
  const ignoredReasons: string[] = [];
  let primaryResourceProcessed = false;

  const customer = extractAsaasCustomer(event.payload);
  if (customer) {
    await upsertAsaasCustomer(supabase, customer);
    operations.push(asaasBillingTables.customers);
  }

  const payment = extractAsaasPayment(event.payload, event.event);
  if (payment) {
    await upsertAsaasPayment(supabase, payment);
    operations.push(asaasBillingTables.payments);

    if (category === "payment") {
      primaryResourceProcessed = true;
    }
  } else if (category === "payment") {
    ignoredReasons.push("payment_missing_or_without_id");
  }

  const subscription = extractAsaasSubscription(event.payload, event.event);
  if (subscription) {
    if (subscription.billingCycle) {
      await upsertAsaasSubscription(supabase, subscription);
      operations.push(asaasBillingTables.subscriptions);

      if (category === "subscription") {
        primaryResourceProcessed = true;
      }
    } else {
      ignoredReasons.push("subscription_without_billing_cycle");
    }
  } else if (category === "subscription") {
    ignoredReasons.push("subscription_missing_or_without_id");
  }

  const checkout = extractAsaasCheckout(event.payload, event.event);
  if (checkout) {
    if (checkout.billingCycle) {
      await upsertAsaasCheckout(supabase, checkout);
      operations.push(asaasBillingTables.checkouts);

      if (category === "checkout") {
        primaryResourceProcessed = true;
      }
    } else {
      ignoredReasons.push("checkout_without_billing_cycle");
    }
  } else if (category === "checkout") {
    ignoredReasons.push("checkout_missing_id_or_reference");
  }

  if (primaryResourceProcessed) {
    const provisioningResult = await maybeProvisionPaidAccess(supabase, event);
    operations.push(...provisioningResult.operations);

    if (provisioningResult.status === "pending") {
      return {
        status: "ignored",
        operations,
        reason: provisioningResult.reason,
      };
    }

    return {
      status: "processed",
      operations,
    };
  }

  return {
    status: "ignored",
    operations,
    reason: ignoredReasons[0] ?? "no_supported_resource_processed",
  };
}

async function maybeProvisionPaidAccess(
  supabase: ServiceRoleClient,
  event: ParsedAsaasWebhookEvent,
) {
  if (!shouldProvisionAccessForAsaasEvent(event.event)) {
    return {
      status: "skipped" as const,
      operations: [],
    };
  }

  const result = await provisionAccessForPaidAsaasEvent(supabase, event);

  if (result.status === "provisioned") {
    return {
      status: "provisioned" as const,
      operations: result.operations,
    };
  }

  if (result.status === "pending") {
    return {
      status: "pending" as const,
      operations: result.operations,
      reason: result.reason,
    };
  }

  return {
    status: "skipped" as const,
    operations: result.operations,
  };
}

async function upsertAsaasCustomer(
  supabase: ServiceRoleClient,
  customer: ExtractedAsaasCustomer,
) {
  const row: AsaasCustomerInsert = {
    asaas_customer_id: customer.asaasCustomerId,
    raw_payload: customer.rawPayload,
  };

  if (customer.email) {
    row.email = customer.email;
  }

  if (customer.name) {
    row.name = customer.name;
  }

  if (customer.cpfCnpj) {
    row.cpf_cnpj = customer.cpfCnpj;
  }

  const { error } = await supabase
    .from(asaasBillingTables.customers)
    .upsert(row, { onConflict: "asaas_customer_id" });

  if (error) {
    throw error;
  }
}

async function upsertAsaasPayment(
  supabase: ServiceRoleClient,
  payment: ExtractedAsaasPayment,
) {
  const row: AsaasPaymentInsert = {
    asaas_payment_id: payment.asaasPaymentId,
    asaas_subscription_id: payment.asaasSubscriptionId,
    asaas_checkout_id: payment.asaasCheckoutId,
    asaas_customer_id: payment.asaasCustomerId,
    billing_cycle: payment.billingCycle,
    internal_access_plan: payment.internalAccessPlan,
    status: payment.status,
    value_cents: payment.valueCents,
    billing_type: payment.billingType,
    due_date: payment.dueDate,
    paid_at: payment.paidAt,
    raw_payload: payment.rawPayload,
  };

  const { error } = await supabase
    .from(asaasBillingTables.payments)
    .upsert(row, { onConflict: "asaas_payment_id" });

  if (error) {
    throw error;
  }
}

async function upsertAsaasSubscription(
  supabase: ServiceRoleClient,
  subscription: ExtractedAsaasSubscription,
) {
  if (!subscription.billingCycle) {
    throw new Error("subscription_without_billing_cycle");
  }

  const row: AsaasSubscriptionInsert = {
    asaas_subscription_id: subscription.asaasSubscriptionId,
    asaas_customer_id: subscription.asaasCustomerId,
    billing_cycle: subscription.billingCycle,
    internal_access_plan: subscription.internalAccessPlan,
    status: subscription.status,
    current_period_start: subscription.currentPeriodStart,
    current_period_end: subscription.currentPeriodEnd,
    next_due_date: subscription.nextDueDate,
    canceled_at: subscription.canceledAt,
    raw_payload: subscription.rawPayload,
  };

  const { error } = await supabase
    .from(asaasBillingTables.subscriptions)
    .upsert(row, { onConflict: "asaas_subscription_id" });

  if (error) {
    throw error;
  }
}

async function upsertAsaasCheckout(
  supabase: ServiceRoleClient,
  checkout: ExtractedAsaasCheckout,
) {
  if (!checkout.billingCycle) {
    throw new Error("checkout_without_billing_cycle");
  }

  const row: AsaasCheckoutInsert = {
    billing_cycle: checkout.billingCycle,
    internal_access_plan: checkout.internalAccessPlan,
    status: checkout.status,
    external_reference: checkout.externalReference,
    asaas_checkout_id: checkout.asaasCheckoutId,
    checkout_url: checkout.checkoutUrl,
    raw_response: checkout.rawPayload,
  };
  const onConflict = checkout.asaasCheckoutId
    ? "asaas_checkout_id"
    : "external_reference";

  const { error } = await supabase
    .from(asaasBillingTables.checkouts)
    .upsert(row, { onConflict });

  if (error) {
    throw error;
  }
}

async function updateAsaasWebhookEventStatus(
  supabase: ServiceRoleClient,
  webhookEventId: string,
  status: Extract<AsaasWebhookEventStatus, "processed" | "ignored" | "failed">,
  errorMessage?: string,
) {
  const update: WebhookEventUpdate = {
    status,
    processed_at: new Date().toISOString(),
    error: errorMessage ?? null,
  };

  const { error } = await supabase
    .from(asaasBillingTables.webhookEvents)
    .update(update)
    .eq("id", webhookEventId);

  if (error) {
    throw error;
  }
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

function sanitizeProcessingError(error: unknown) {
  if (error instanceof Error) {
    return limitErrorMessage(`${error.name}: ${error.message}`);
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : undefined;
    const message = typeof record.message === "string" ? record.message : "Unknown processing error";

    return limitErrorMessage([code, message].filter(Boolean).join(": "));
  }

  return "Unknown processing error";
}

function limitErrorMessage(message: string) {
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
