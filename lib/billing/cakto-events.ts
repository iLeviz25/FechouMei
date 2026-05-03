import {
  getBillingCycleByCaktoOfferId,
  getInternalAccessPlanForPaidCustomer,
  type BillingCycleCode,
} from "@/lib/billing/plans";
import type { Json } from "@/types/database";

export type CaktoBillingCycle = BillingCycleCode;

export type ExtractedCaktoOrder = {
  caktoOrderId: string;
  caktoRefId: string | null;
  caktoSubscriptionId: string | null;
  caktoCheckoutId: string | null;
  caktoOfferId: string;
  caktoProductId: string | null;
  billingCycle: CaktoBillingCycle;
  internalAccessPlan: "pro";
  status: string;
  customerEmail: string | null;
  customerName: string | null;
  customerDocument: string | null;
  amountCents: number | null;
  paymentMethod: string | null;
  paidAt: string | null;
  checkoutUrl: string | null;
  rawPayload: Json;
};

const approvedCaktoEvents = [
  "purchase_approved",
  "subscription_renewed",
] as const;

const ignoredCaktoPaymentEvents = [
  "initiate_checkout",
  "checkout_abandonment",
  "purchase_refused",
  "pix_gerado",
  "boleto_gerado",
  "picpay_gerado",
  "openfinance_nubank_gerado",
  "chargeback",
  "refund",
  "subscription_created",
  "subscription_canceled",
  "subscription_renewal_refused",
] as const;

export type ApprovedCaktoEvent = (typeof approvedCaktoEvents)[number];
export type IgnoredCaktoPaymentEvent = (typeof ignoredCaktoPaymentEvents)[number];

export function isApprovedCaktoEvent(event: string): event is ApprovedCaktoEvent {
  return (approvedCaktoEvents as readonly string[]).includes(normalizeEventName(event));
}

export function isKnownIgnoredCaktoEvent(event: string): event is IgnoredCaktoPaymentEvent {
  return (ignoredCaktoPaymentEvents as readonly string[]).includes(normalizeEventName(event));
}

export function isApprovedCaktoOrderStatus(status: string | null): boolean {
  return ["paid", "approved", "completed", "complete"].includes(normalizeStatus(status));
}

export function getCaktoBillingCycleByOfferId(offerId: string | null): CaktoBillingCycle | null {
  if (!offerId) {
    return null;
  }

  const normalizedOfferId = normalizeOfferId(offerId);
  return getBillingCycleByCaktoOfferId(normalizedOfferId)?.code ?? null;
}

export function extractCaktoOrder(payload: Record<string, unknown>): ExtractedCaktoOrder | null {
  const data = getRecord(payload.data) ?? payload;
  const offer = getRecord(data.offer) ?? getRecord(payload.offer);
  const product = getRecord(data.product) ?? getRecord(payload.product);
  const customer = getRecord(data.customer) ?? getRecord(payload.customer);

  const offerId = normalizeOfferId(
    getString(offer, ["id", "offer_id", "offerId"])
      ?? getString(data, ["offer_id", "offerId"])
      ?? extractOfferIdFromCheckoutUrl(getString(data, ["checkoutUrl", "checkout_url"])),
  );
  const billingCycle = getCaktoBillingCycleByOfferId(offerId);
  const orderId = normalizeId(
    data.id
      ?? data.order_id
      ?? data.orderId
      ?? payload.id
      ?? payload.order_id
      ?? payload.orderId,
  );

  if (!orderId || !offerId || !billingCycle) {
    return null;
  }

  const rawStatus = getString(data, ["status"]) ?? getString(payload, ["status"]) ?? "unknown";

  return {
    caktoOrderId: orderId,
    caktoRefId: getString(data, ["refId", "ref_id"]) ?? getString(payload, ["refId", "ref_id"]),
    caktoSubscriptionId: normalizeSubscriptionId(data.subscription ?? payload.subscription),
    caktoCheckoutId: normalizeId(data.checkout ?? payload.checkout),
    caktoOfferId: offerId,
    caktoProductId:
      normalizeId(product?.id)
      ?? getString(data, ["product_id", "productId"])
      ?? getString(payload, ["product_id", "productId"]),
    billingCycle,
    internalAccessPlan: getInternalAccessPlanForPaidCustomer() as "pro",
    status: normalizeStatus(rawStatus) || rawStatus,
    customerEmail: normalizeEmail(getString(customer, ["email"]) ?? findEmailDeep(payload)),
    customerName: getString(customer, ["name", "fullName", "full_name"]),
    customerDocument: normalizeOptionalString(
      getString(customer, ["docNumber", "doc_number", "document", "cpfCnpj", "cpf_cnpj"]),
    ),
    amountCents: moneyToCents(data.amount ?? data.baseAmount ?? payload.amount ?? payload.baseAmount),
    paymentMethod: getString(data, ["paymentMethod", "payment_method"]),
    paidAt: normalizeOptionalString(getString(data, ["paidAt", "paid_at"])),
    checkoutUrl: getString(data, ["checkoutUrl", "checkout_url"]),
    rawPayload: payload as Json,
  };
}

export function getCaktoEventKey({
  event,
  order,
  payload,
}: {
  event: string;
  order: ExtractedCaktoOrder | null;
  payload: Record<string, unknown>;
}): string | null {
  const explicitEventId = normalizeId(payload.event_id ?? payload.eventId ?? payload.id);

  if (explicitEventId && order?.caktoOrderId) {
    return `${normalizeEventName(event)}:${explicitEventId}:${order.caktoOrderId}`;
  }

  if (order?.caktoOrderId) {
    return `${normalizeEventName(event)}:${order.caktoOrderId}`;
  }

  return explicitEventId ? `${normalizeEventName(event)}:${explicitEventId}` : null;
}

export function normalizeEventName(event: string | null | undefined) {
  return String(event ?? "").trim().toLowerCase();
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toLowerCase();
}

function normalizeOfferId(value: string | null | undefined) {
  const trimmed = normalizeOptionalString(value);

  if (!trimmed) {
    return null;
  }

  return trimmed.split("_")[0] ?? trimmed;
}

function extractOfferIdFromCheckoutUrl(checkoutUrl: string | null | undefined) {
  if (!checkoutUrl) {
    return null;
  }

  try {
    const url = new URL(checkoutUrl);
    const slug = url.pathname.split("/").filter(Boolean).pop();
    return slug ? normalizeOfferId(slug) : null;
  } catch {
    return null;
  }
}

function normalizeSubscriptionId(value: unknown) {
  if (isRecord(value)) {
    return normalizeId(value.id ?? value.subscription_id ?? value.subscriptionId);
  }

  return normalizeId(value);
}

function moneyToCents(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const normalized = trimmed.includes(",")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed;
    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}

function findEmailDeep(value: unknown, depth = 0): string | null {
  if (depth > 4 || !isRecord(value)) {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.toLowerCase().includes("email") && typeof nestedValue === "string" && isValidEmail(nestedValue)) {
      return nestedValue;
    }

    const nestedEmail = findEmailDeep(nestedValue, depth + 1);

    if (nestedEmail) {
      return nestedEmail;
    }
  }

  return null;
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = normalizeOptionalString(email)?.toLowerCase() ?? null;
  return normalized && isValidEmail(normalized) ? normalized : null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeId(value: unknown) {
  if (typeof value === "string") {
    return normalizeOptionalString(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function getString(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    const normalized = normalizeOptionalString(value);

    if (normalized) {
      return normalized;
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
