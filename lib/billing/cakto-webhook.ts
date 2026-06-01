import { timingSafeEqual } from "crypto";
import { provisionAccessForPaidCaktoOrder } from "@/lib/billing/cakto-access-provisioning";
import {
  approvedCaktoOrderStatuses,
  extractCaktoOrderId,
  extractCaktoRefundedAt,
  extractCaktoOrder,
  getCaktoEventKey,
  isApprovedCaktoEvent,
  isApprovedCaktoOrderStatus,
  isKnownIgnoredCaktoEvent,
  isRefundedCaktoEvent,
  normalizeEventName,
  type ExtractedCaktoOrder,
} from "@/lib/billing/cakto-events";
import { caktoBillingTables } from "@/lib/billing/database";
import type { CaktoWebhookEventStatus } from "@/lib/billing/types";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";

export type ParsedCaktoWebhookEvent = {
  caktoEventKey: string | null;
  event: string;
  order: ExtractedCaktoOrder | null;
  orderId: string | null;
  offerId: string | null;
  payload: Json;
};

export type CaktoWebhookAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "cakto_webhook_secret_not_configured"
        | "cakto_webhook_unauthorized";
      status: 401 | 503;
    };

export type CaktoWebhookParseResult =
  | {
      ok: true;
      event: ParsedCaktoWebhookEvent;
    }
  | {
      ok: false;
      reason: "invalid_webhook_payload" | "missing_webhook_event";
    };

export type SaveCaktoWebhookEventResult = {
  status: "received";
  webhookEventId: string;
} | {
  status: "duplicate";
  existingStatus: CaktoWebhookEventStatus | null;
  webhookEventId: string | null;
};

export type ProcessCaktoWebhookEventResult = {
  status: "processed" | "ignored";
  operations: string[];
  reason?: string;
};

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;
type WebhookEventUpdate = Database["public"]["Tables"]["cakto_webhook_events"]["Update"];
type CaktoOrderRow = Database["public"]["Tables"]["cakto_orders"]["Row"];
type CaktoOrderInsert = Database["public"]["Tables"]["cakto_orders"]["Insert"];
type CaktoOrderUpdate = Database["public"]["Tables"]["cakto_orders"]["Update"];

export function validateCaktoWebhookSecret(
  request: Request,
  payload: unknown,
): CaktoWebhookAuthResult {
  const configuredSecret = process.env.CAKTO_WEBHOOK_SECRET?.trim();

  if (!configuredSecret) {
    console.error("[cakto-webhook] Rejected request because CAKTO_WEBHOOK_SECRET is not configured.");
    return {
      ok: false,
      reason: "cakto_webhook_secret_not_configured",
      status: 503,
    };
  }

  const providedSecret = getProvidedWebhookSecret(request, payload);

  if (!providedSecret || !safeSecretEquals(providedSecret, configuredSecret)) {
    return {
      ok: false,
      reason: "cakto_webhook_unauthorized",
      status: 401,
    };
  }

  return { ok: true };
}

export function parseCaktoWebhookEvent(payload: unknown): CaktoWebhookParseResult {
  if (!isRecord(payload)) {
    return {
      ok: false,
      reason: "invalid_webhook_payload",
    };
  }

  const event = normalizeEventName(getString(payload, ["event", "type", "event_type"]));

  if (!event) {
    return {
      ok: false,
      reason: "missing_webhook_event",
    };
  }

  const order = extractCaktoOrder(payload);
  const orderId = order?.caktoOrderId ?? extractCaktoOrderId(payload);

  return {
    ok: true,
    event: {
      caktoEventKey: getCaktoEventKey({ event, order, orderId, payload }),
      event,
      order,
      orderId,
      offerId: order?.caktoOfferId ?? null,
      payload: payload as Json,
    },
  };
}

export async function saveCaktoWebhookEvent(
  event: ParsedCaktoWebhookEvent,
): Promise<SaveCaktoWebhookEventResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from(caktoBillingTables.webhookEvents)
    .insert({
      cakto_event_key: event.caktoEventKey,
      event: event.event,
      order_id: event.orderId,
      offer_id: event.offerId,
      payload: event.payload,
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

  if (event.caktoEventKey && error.code === "23505") {
    const { data: existingEvent } = await supabase
      .from(caktoBillingTables.webhookEvents)
      .select("id, status")
      .eq("cakto_event_key", event.caktoEventKey)
      .maybeSingle();

    return {
      status: "duplicate",
      existingStatus: existingEvent?.status ?? null,
      webhookEventId: existingEvent?.id ?? null,
    };
  }

  throw error;
}

export async function processCaktoWebhookEvent(
  webhookEventId: string,
  event: ParsedCaktoWebhookEvent,
): Promise<ProcessCaktoWebhookEventResult> {
  const supabase = createServiceRoleClient();

  try {
    const result = await processCaktoWebhookEventPayload(supabase, event);

    await updateCaktoWebhookEventStatus(
      supabase,
      webhookEventId,
      result.status,
      result.reason,
    );

    return result;
  } catch (error) {
    const sanitizedError = sanitizeProcessingError(error);

    try {
      await updateCaktoWebhookEventStatus(
        supabase,
        webhookEventId,
        "failed",
        sanitizedError,
      );
    } catch (statusError) {
      console.error(
        "[cakto-webhook] Failed to mark webhook event as failed.",
        sanitizeProcessingError(statusError),
      );
    }

    throw error;
  }
}

async function processCaktoWebhookEventPayload(
  supabase: ServiceRoleClient,
  event: ParsedCaktoWebhookEvent,
): Promise<ProcessCaktoWebhookEventResult> {
  if (isRefundedCaktoEvent(event.event)) {
    return revokeAccessForRefundedCaktoOrder(supabase, event);
  }

  if (isKnownIgnoredCaktoEvent(event.event)) {
    return {
      status: "ignored",
      operations: [],
      reason: "event_does_not_grant_access",
    };
  }

  if (!isApprovedCaktoEvent(event.event)) {
    return {
      status: "ignored",
      operations: [],
      reason: "unrecognized_event",
    };
  }

  if (!event.order) {
    return {
      status: "ignored",
      operations: [],
      reason: "order_missing_or_offer_not_allowed",
    };
  }

  const order = event.order;

  const existingOrder = await getExistingCaktoOrderByCaktoOrderId(supabase, order.caktoOrderId);

  if (existingOrder?.status === "refunded") {
    return {
      status: "processed",
      operations: [caktoBillingTables.orders, "cakto_order_already_refunded"],
      reason: "order_already_refunded",
    };
  }

  if (!isApprovedCaktoOrderStatus(order.status)) {
    await upsertCaktoOrder(supabase, order);

    return {
      status: "ignored",
      operations: [caktoBillingTables.orders],
      reason: "order_status_not_paid",
    };
  }

  const existingOrderUserId = await upsertCaktoOrder(supabase, order);
  const operations: string[] = [caktoBillingTables.orders];

  if (existingOrderUserId) {
    return {
      status: "processed",
      operations: [...operations, "cakto_order_already_linked"],
    };
  }

  const provisioningResult = await provisionAccessForPaidCaktoOrder(supabase, order);

  if (provisioningResult.status === "pending") {
    return {
      status: "ignored",
      operations: [...operations, ...provisioningResult.operations],
      reason: provisioningResult.reason,
    };
  }

  await linkCaktoOrderToUser(supabase, order.caktoOrderId, provisioningResult.userId);
  operations.push(...provisioningResult.operations, "cakto_order_user_link");

  return {
    status: "processed",
    operations,
  };
}

async function revokeAccessForRefundedCaktoOrder(
  supabase: ServiceRoleClient,
  event: ParsedCaktoWebhookEvent,
): Promise<ProcessCaktoWebhookEventResult> {
  const now = new Date().toISOString();
  const refundedAt = extractCaktoRefundedAt(event.payload as Record<string, unknown>) ?? now;
  const existingOrder = await findExistingCaktoOrderForRefund(supabase, event);

  if (!existingOrder) {
    if (event.order) {
      await insertRefundedCaktoOrder(supabase, event.order, event.payload, refundedAt);

      return {
        status: "processed",
        operations: [caktoBillingTables.orders],
        reason: "refunded_order_recorded_without_user",
      };
    }

    return {
      status: "ignored",
      operations: [],
      reason: "refunded_order_not_found",
    };
  }

  const operations = [caktoBillingTables.orders];
  const orderUpdate: CaktoOrderUpdate = {
    access_revoked_at: existingOrder.user_id ? existingOrder.access_revoked_at ?? now : existingOrder.access_revoked_at,
    raw_payload: event.payload,
    refunded_at: existingOrder.refunded_at ?? refundedAt,
    status: "refunded",
  };

  const { error: orderError } = await supabase
    .from(caktoBillingTables.orders)
    .update(orderUpdate)
    .eq("id", existingOrder.id);

  if (orderError) {
    throw orderError;
  }

  if (!existingOrder.user_id) {
    return {
      status: "processed",
      operations,
      reason: "refunded_order_not_linked_to_user",
    };
  }

  const hasNewerPaidOrder = await hasNewerActiveCaktoOrder(
    supabase,
    existingOrder.user_id,
    existingOrder.cakto_order_id,
    existingOrder.paid_at ?? existingOrder.created_at,
  );

  if (hasNewerPaidOrder) {
    return {
      status: "processed",
      operations: [...operations, "profile_revocation_skipped_newer_paid_order"],
      reason: "refund_did_not_revoke_newer_active_order",
    };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      subscription_status: "refunded",
      updated_at: now,
    })
    .eq("id", existingOrder.user_id);

  if (profileError) {
    throw profileError;
  }

  return {
    status: "processed",
    operations: [...operations, "profiles_access_revoked"],
  };
}

async function getExistingCaktoOrderByCaktoOrderId(
  supabase: ServiceRoleClient,
  caktoOrderId: string,
): Promise<Pick<CaktoOrderRow, "id" | "status" | "user_id"> | null> {
  const { data, error } = await supabase
    .from(caktoBillingTables.orders)
    .select("id, status, user_id")
    .eq("cakto_order_id", caktoOrderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findExistingCaktoOrderForRefund(
  supabase: ServiceRoleClient,
  event: ParsedCaktoWebhookEvent,
): Promise<Pick<
  CaktoOrderRow,
  | "access_revoked_at"
  | "cakto_order_id"
  | "cakto_ref_id"
  | "cakto_subscription_id"
  | "created_at"
  | "id"
  | "paid_at"
  | "refunded_at"
  | "user_id"
> | null> {
  const select = "id, user_id, cakto_order_id, cakto_ref_id, cakto_subscription_id, paid_at, created_at, refunded_at, access_revoked_at";

  if (event.orderId) {
    const { data, error } = await supabase
      .from(caktoBillingTables.orders)
      .select(select)
      .eq("cakto_order_id", event.orderId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  if (event.order?.caktoRefId) {
    const { data, error } = await supabase
      .from(caktoBillingTables.orders)
      .select(select)
      .eq("cakto_ref_id", event.order.caktoRefId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  if (event.order?.caktoSubscriptionId) {
    const { data, error } = await supabase
      .from(caktoBillingTables.orders)
      .select(select)
      .eq("cakto_subscription_id", event.order.caktoSubscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  return null;
}

async function insertRefundedCaktoOrder(
  supabase: ServiceRoleClient,
  order: ExtractedCaktoOrder,
  payload: Json,
  refundedAt: string,
) {
  const row: CaktoOrderInsert = {
    ...getCaktoOrderRow(order),
    raw_payload: payload,
    refunded_at: refundedAt,
    status: "refunded",
  };
  const { error } = await supabase
    .from(caktoBillingTables.orders)
    .insert(row);

  if (error) {
    throw error;
  }
}

async function hasNewerActiveCaktoOrder(
  supabase: ServiceRoleClient,
  userId: string,
  refundedCaktoOrderId: string,
  referenceTimestamp: string | null,
) {
  if (!referenceTimestamp) {
    return false;
  }

  const referenceTime = Date.parse(referenceTimestamp);

  if (!Number.isFinite(referenceTime)) {
    return false;
  }

  const { data, error } = await supabase
    .from(caktoBillingTables.orders)
    .select("cakto_order_id, paid_at, created_at, status")
    .eq("user_id", userId)
    .neq("cakto_order_id", refundedCaktoOrderId)
    .in("status", [...approvedCaktoOrderStatuses])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []).some((order) => {
    const paidAt = order.paid_at ? Date.parse(order.paid_at) : Number.NaN;
    const createdAt = order.created_at ? Date.parse(order.created_at) : Number.NaN;
    const orderTime = Math.max(
      Number.isFinite(paidAt) ? paidAt : 0,
      Number.isFinite(createdAt) ? createdAt : 0,
    );

    return orderTime > referenceTime;
  });
}

async function upsertCaktoOrder(
  supabase: ServiceRoleClient,
  order: ExtractedCaktoOrder,
): Promise<string | null> {
  const { data: existingOrder, error: readError } = await supabase
    .from(caktoBillingTables.orders)
    .select("id, user_id")
    .eq("cakto_order_id", order.caktoOrderId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const row = getCaktoOrderRow(order);

  if (existingOrder) {
    const { error } = await supabase
      .from(caktoBillingTables.orders)
      .update(row)
      .eq("cakto_order_id", order.caktoOrderId);

    if (error) {
      throw error;
    }

    return existingOrder.user_id ?? null;
  }

  const { error } = await supabase
    .from(caktoBillingTables.orders)
    .insert(row);

  if (error) {
    throw error;
  }

  return null;
}

function getCaktoOrderRow(order: ExtractedCaktoOrder): CaktoOrderInsert {
  return {
    cakto_order_id: order.caktoOrderId,
    cakto_ref_id: order.caktoRefId,
    cakto_subscription_id: order.caktoSubscriptionId,
    cakto_checkout_id: order.caktoCheckoutId,
    cakto_offer_id: order.caktoOfferId,
    cakto_product_id: order.caktoProductId,
    billing_cycle: order.billingCycle,
    internal_access_plan: order.internalAccessPlan,
    status: order.status,
    customer_email: order.customerEmail,
    customer_name: order.customerName,
    customer_document: order.customerDocument,
    amount_cents: order.amountCents,
    payment_method: order.paymentMethod,
    paid_at: order.paidAt,
    checkout_url: order.checkoutUrl,
    raw_payload: order.rawPayload,
  };
}

async function linkCaktoOrderToUser(
  supabase: ServiceRoleClient,
  caktoOrderId: string,
  userId: string,
) {
  const { error } = await supabase
    .from(caktoBillingTables.orders)
    .update({ user_id: userId })
    .eq("cakto_order_id", caktoOrderId)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) {
    throw error;
  }
}

async function updateCaktoWebhookEventStatus(
  supabase: ServiceRoleClient,
  webhookEventId: string,
  status: Extract<CaktoWebhookEventStatus, "processed" | "ignored" | "failed">,
  errorMessage?: string,
) {
  const update: WebhookEventUpdate = {
    status,
    processed_at: new Date().toISOString(),
    error: errorMessage ?? null,
  };

  const { error } = await supabase
    .from(caktoBillingTables.webhookEvents)
    .update(update)
    .eq("id", webhookEventId);

  if (error) {
    throw error;
  }
}

function getProvidedWebhookSecret(request: Request, payload: unknown) {
  const url = new URL(request.url);
  const bearer = getBearerSecret(request.headers.get("authorization"));

  return normalizeSecret(request.headers.get("cakto-webhook-secret"))
    ?? normalizeSecret(request.headers.get("x-cakto-webhook-secret"))
    ?? normalizeSecret(request.headers.get("x-webhook-secret"))
    ?? bearer
    ?? normalizeSecret(url.searchParams.get("secret"))
    ?? normalizeSecret(url.searchParams.get("token"))
    ?? getPayloadSecret(payload);
}

function getPayloadSecret(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  return normalizeSecret(payload.secret)
    ?? normalizeSecret(getRecord(payload.fields)?.secret);
}

function safeSecretEquals(providedSecret: string, configuredSecret: string) {
  const provided = Buffer.from(providedSecret);
  const configured = Buffer.from(configuredSecret);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

function getBearerSecret(value: string | null) {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? normalizeSecret(token) : null;
}

function normalizeSecret(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
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

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
