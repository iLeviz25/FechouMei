import {
  getInternalAccessPlanForPaidCustomer,
  isValidBillingCycle,
  type BillingCycleCode,
} from "@/lib/billing/plans";
import type { InternalPaidAccessPlan } from "@/lib/billing/types";
import type { Json } from "@/types/database";

export const asaasPaymentEvents = [
  "PAYMENT_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
] as const;

export const asaasSubscriptionEvents = [
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_DELETED",
] as const;

export const asaasCheckoutEvents = [
  "CHECKOUT_CREATED",
  "CHECKOUT_PAID",
  "CHECKOUT_CANCELED",
  "CHECKOUT_EXPIRED",
] as const;

export type AsaasPaymentEvent = (typeof asaasPaymentEvents)[number];
export type AsaasSubscriptionEvent = (typeof asaasSubscriptionEvents)[number];
export type AsaasCheckoutEvent = (typeof asaasCheckoutEvents)[number];
export type AsaasRecognizedEvent =
  | AsaasPaymentEvent
  | AsaasSubscriptionEvent
  | AsaasCheckoutEvent;

export type AsaasEventCategory =
  | "payment"
  | "subscription"
  | "checkout"
  | "unknown";

export type ExtractedAsaasCustomer = {
  asaasCustomerId: string;
  email: string | null;
  name: string | null;
  cpfCnpj: string | null;
  rawPayload: Json;
};

export type ExtractedAsaasPayment = {
  asaasPaymentId: string;
  asaasSubscriptionId: string | null;
  asaasCheckoutId: string | null;
  asaasCustomerId: string | null;
  status: string;
  valueCents: number | null;
  billingType: string | null;
  dueDate: string | null;
  paidAt: string | null;
  billingCycle: BillingCycleCode | null;
  internalAccessPlan: InternalPaidAccessPlan;
  rawPayload: Json;
};

export type ExtractedAsaasSubscription = {
  asaasSubscriptionId: string;
  asaasCustomerId: string | null;
  status: string;
  billingCycle: BillingCycleCode | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextDueDate: string | null;
  canceledAt: string | null;
  internalAccessPlan: InternalPaidAccessPlan;
  rawPayload: Json;
};

export type ExtractedAsaasCheckout = {
  asaasCheckoutId: string | null;
  externalReference: string | null;
  status: string;
  checkoutUrl: string | null;
  billingCycle: BillingCycleCode | null;
  internalAccessPlan: InternalPaidAccessPlan;
  rawPayload: Json;
};

const billingCycleByTotalCents = new Map<number, BillingCycleCode>([
  [4700, "monthly"],
  [22740, "semiannual"],
  [35880, "annual"],
]);

export function getAsaasEventCategory(event: string): AsaasEventCategory {
  if (isAsaasPaymentEvent(event)) {
    return "payment";
  }

  if (isAsaasSubscriptionEvent(event)) {
    return "subscription";
  }

  if (isAsaasCheckoutEvent(event)) {
    return "checkout";
  }

  return "unknown";
}

export function isAsaasRecognizedEvent(event: string): event is AsaasRecognizedEvent {
  return getAsaasEventCategory(event) !== "unknown";
}

export function extractAsaasCustomer(payload: Record<string, unknown>): ExtractedAsaasCustomer | null {
  const payment = getRecord(payload.payment);
  const subscription = getRecord(payload.subscription);
  const checkout = getRecord(payload.checkout);
  const checkoutCustomerData = getRecord(checkout?.customerData);

  const candidates = [
    payload.customer,
    payment?.customer,
    subscription?.customer,
    checkout?.customer,
    checkoutCustomerData,
    payload.customerData,
  ];

  const customerId = firstString(candidates.map(normalizeResourceId));

  if (!customerId) {
    return null;
  }

  const customerRecords = candidates.filter(isRecord);
  const rawCustomer = customerRecords.find((record) => normalizeResourceId(record) === customerId)
    ?? customerRecords[0]
    ?? { id: customerId };

  return {
    asaasCustomerId: customerId,
    email: firstString(customerRecords.map((record) => getString(record, ["email"]))),
    name: firstString(customerRecords.map((record) => getString(record, ["name"]))),
    cpfCnpj: firstString(customerRecords.map((record) => getString(record, ["cpfCnpj", "cpf_cnpj", "cpfCNPJ"]))),
    rawPayload: rawCustomer as Json,
  };
}

export function extractAsaasPayment(
  payload: Record<string, unknown>,
  event: string,
): ExtractedAsaasPayment | null {
  const payment = getRecord(payload.payment);

  if (!payment) {
    return null;
  }

  const asaasPaymentId = normalizeResourceId(payment);

  if (!asaasPaymentId) {
    return null;
  }

  const valueCents = getInteger(payment, ["valueCents", "value_cents", "totalCents"])
    ?? normalizeMoneyToCents(firstDefined([payment.value, payment.amount, payment.totalValue]));

  return {
    asaasPaymentId,
    asaasSubscriptionId: normalizeResourceId(firstDefined([
      payment.subscription,
      payment.subscriptionId,
      payment.asaasSubscriptionId,
    ])),
    asaasCheckoutId: normalizeResourceId(firstDefined([
      payment.checkout,
      payment.checkoutId,
      payment.asaasCheckoutId,
    ])),
    asaasCustomerId: normalizeResourceId(payment.customer),
    status: getString(payment, ["status"]) ?? statusFromEvent(event),
    valueCents,
    billingType: getString(payment, ["billingType", "billing_type"]),
    dueDate: normalizeDate(getString(payment, ["dueDate", "due_date"])),
    paidAt: normalizeTimestamp(firstString([
      getString(payment, ["paymentDate", "payment_date"]),
      getString(payment, ["clientPaymentDate", "client_payment_date"]),
      getString(payment, ["confirmedDate", "confirmed_date"]),
      getString(payment, ["receivedDate", "received_date"]),
      getString(payment, ["creditDate", "credit_date"]),
    ])),
    billingCycle: identifyBillingCycle(payload, payment),
    internalAccessPlan: getInternalAccessPlanForPaidCustomer() as InternalPaidAccessPlan,
    rawPayload: payment as Json,
  };
}

export function extractAsaasSubscription(
  payload: Record<string, unknown>,
  event: string,
): ExtractedAsaasSubscription | null {
  const subscription = getRecord(payload.subscription);

  if (!subscription) {
    return null;
  }

  const asaasSubscriptionId = normalizeResourceId(subscription);

  if (!asaasSubscriptionId) {
    return null;
  }

  const deleted = subscription.deleted === true || event === "SUBSCRIPTION_DELETED";

  return {
    asaasSubscriptionId,
    asaasCustomerId: normalizeResourceId(subscription.customer),
    status: subscriptionStatusFromEvent(event) ?? getString(subscription, ["status"]) ?? statusFromEvent(event),
    billingCycle: identifyBillingCycle(payload, subscription),
    currentPeriodStart: normalizeDate(firstString([
      getString(subscription, ["currentPeriodStart", "current_period_start"]),
      getString(subscription, ["periodStart", "period_start"]),
      getString(subscription, ["startDate", "start_date"]),
    ])),
    currentPeriodEnd: normalizeDate(firstString([
      getString(subscription, ["currentPeriodEnd", "current_period_end"]),
      getString(subscription, ["periodEnd", "period_end"]),
      getString(subscription, ["endDate", "end_date"]),
    ])),
    nextDueDate: normalizeDate(getString(subscription, ["nextDueDate", "next_due_date"])),
    canceledAt: normalizeTimestamp(firstString([
      getString(subscription, ["canceledAt", "cancelledAt", "canceled_at", "cancelled_at"]),
      getString(subscription, ["deletedAt", "deleted_at"]),
    ])) ?? (deleted ? new Date().toISOString() : null),
    internalAccessPlan: getInternalAccessPlanForPaidCustomer() as InternalPaidAccessPlan,
    rawPayload: subscription as Json,
  };
}

export function extractAsaasCheckout(
  payload: Record<string, unknown>,
  event: string,
): ExtractedAsaasCheckout | null {
  const checkout = getRecord(payload.checkout);

  if (!checkout) {
    return null;
  }

  const asaasCheckoutId = normalizeResourceId(checkout);
  const externalReference = firstString([
    getString(checkout, ["externalReference", "external_reference"]),
    getString(payload, ["externalReference", "external_reference"]),
  ]);

  if (!asaasCheckoutId && !externalReference) {
    return null;
  }

  return {
    asaasCheckoutId,
    externalReference,
    status: checkoutStatusFromEvent(event) ?? getString(checkout, ["status"]) ?? statusFromEvent(event),
    checkoutUrl: getString(checkout, ["checkoutUrl", "checkout_url", "link", "url"]),
    billingCycle: identifyBillingCycle(payload, checkout),
    internalAccessPlan: getInternalAccessPlanForPaidCustomer() as InternalPaidAccessPlan,
    rawPayload: checkout as Json,
  };
}

export function normalizeMoneyToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value !== "string") {
    return null;
  }

  const sanitized = value.trim().replace(/[R$\s]/gi, "");
  const normalized = sanitized.includes(",")
    ? sanitized.replace(/\./g, "").replace(",", ".")
    : sanitized;
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export function identifyBillingCycle(
  payload: Record<string, unknown>,
  resource?: Record<string, unknown> | null,
): BillingCycleCode | null {
  const prioritizedRecords = [resource, payload].filter(isRecord);
  const metadataCandidates = collectMetadataCandidates(prioritizedRecords);
  const fromMetadata = firstBillingCycle(metadataCandidates);

  if (fromMetadata) {
    return fromMetadata;
  }

  const externalReferenceCandidates = collectStringFields(prioritizedRecords, [
    "externalReference",
    "external_reference",
    "reference",
  ]);
  const fromExternalReference = firstBillingCycle(externalReferenceCandidates);

  if (fromExternalReference) {
    return fromExternalReference;
  }

  const descriptionCandidates = [
    ...collectStringFields(prioritizedRecords, ["description", "name", "title"]),
    ...collectCheckoutItemTexts(resource),
  ];
  const fromDescription = firstBillingCycle(descriptionCandidates);

  if (fromDescription) {
    return fromDescription;
  }

  const valueCandidates = collectValueCandidates(prioritizedRecords);
  const fromValue = valueCandidates
    .map((value) => billingCycleByTotalCents.get(value) ?? null)
    .find(Boolean);

  return fromValue ?? null;
}

function isAsaasPaymentEvent(event: string): event is AsaasPaymentEvent {
  return (asaasPaymentEvents as readonly string[]).includes(event);
}

function isAsaasSubscriptionEvent(event: string): event is AsaasSubscriptionEvent {
  return (asaasSubscriptionEvents as readonly string[]).includes(event);
}

function isAsaasCheckoutEvent(event: string): event is AsaasCheckoutEvent {
  return (asaasCheckoutEvents as readonly string[]).includes(event);
}

function firstBillingCycle(values: unknown[]) {
  for (const value of values) {
    const billingCycle = parseBillingCycleText(value);

    if (billingCycle) {
      return billingCycle;
    }
  }

  return null;
}

function parseBillingCycleText(value: unknown): BillingCycleCode | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = removeAccents(value.trim().toLowerCase());

  if (!text) {
    return null;
  }

  if (isValidBillingCycle(text)) {
    return text;
  }

  if (/\bsemi[-_\s]?annual\b/.test(text) || /\bsemestral\b/.test(text) || /\b6\s*x\b/.test(text)) {
    return "semiannual";
  }

  if (/\bannual\b/.test(text) || /\byearly\b/.test(text) || /\banual\b/.test(text) || /\b12\s*x\b/.test(text)) {
    return "annual";
  }

  if (/\bmonthly\b/.test(text) || /\bmensal\b/.test(text) || /\bmonth\b/.test(text) || /\bmes\b/.test(text)) {
    return "monthly";
  }

  if (/\bsemiannually\b/.test(text)) {
    return "semiannual";
  }

  return null;
}

function collectMetadataCandidates(records: Record<string, unknown>[]) {
  const values: unknown[] = [];

  for (const record of records) {
    values.push(
      ...collectStringFields([record], [
        "billingCycle",
        "billing_cycle",
        "billingCycleCode",
        "billing_cycle_code",
        "cycle",
        "plan",
        "planCode",
        "plan_code",
        "product",
        "productCode",
        "product_code",
      ]),
    );

    const metadata = getRecord(record.metadata);
    if (metadata) {
      values.push(
        ...collectStringFields([metadata], [
          "billingCycle",
          "billing_cycle",
          "billingCycleCode",
          "billing_cycle_code",
          "cycle",
          "plan",
          "planCode",
          "plan_code",
          "product",
          "productCode",
          "product_code",
        ]),
      );
    }

    const customFields = Array.isArray(record.customFields)
      ? record.customFields
      : Array.isArray(record.custom_fields)
        ? record.custom_fields
        : [];

    for (const customField of customFields) {
      const customFieldRecord = getRecord(customField);

      if (customFieldRecord) {
        values.push(
          ...collectStringFields([customFieldRecord], ["name", "key", "value", "text"]),
        );
      }
    }
  }

  return values;
}

function collectStringFields(records: Record<string, unknown>[], keys: string[]) {
  const values: string[] = [];

  for (const record of records) {
    for (const key of keys) {
      const value = getString(record, [key]);

      if (value) {
        values.push(value);
      }
    }
  }

  return values;
}

function collectCheckoutItemTexts(resource?: Record<string, unknown> | null) {
  if (!resource || !Array.isArray(resource.items)) {
    return [];
  }

  return resource.items
    .map(getRecord)
    .filter(isRecord)
    .flatMap((item) => collectStringFields([item], ["name", "description", "title"]));
}

function collectValueCandidates(records: Record<string, unknown>[]) {
  const values: number[] = [];

  for (const record of records) {
    const cents = getInteger(record, ["valueCents", "value_cents", "totalCents", "total_cents"]);
    if (cents !== null) {
      values.push(cents);
    }

    for (const value of [record.value, record.amount, record.totalValue, record.total_value]) {
      const normalized = normalizeMoneyToCents(value);

      if (normalized !== null) {
        values.push(normalized);
      }
    }

    if (Array.isArray(record.items)) {
      const itemsTotal = record.items.reduce((total, item) => {
        const itemRecord = getRecord(item);

        if (!itemRecord) {
          return total;
        }

        const valueCents = normalizeMoneyToCents(itemRecord.value);
        const quantity = typeof itemRecord.quantity === "number" && Number.isFinite(itemRecord.quantity)
          ? itemRecord.quantity
          : 1;

        return valueCents === null ? total : total + valueCents * quantity;
      }, 0);

      if (itemsTotal > 0) {
        values.push(itemsTotal);
      }
    }
  }

  return values;
}

function normalizeResourceId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  return firstString([
    getString(value, ["id"]),
    getString(value, ["customer"]),
    getString(value, ["customerId", "customer_id"]),
    getString(value, ["asaasCustomerId", "asaas_customer_id"]),
  ]);
}

function getInteger(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }

    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
      return Number.parseInt(value, 10);
    }
  }

  return null;
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

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
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

function firstDefined(values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined);
}

function firstString(values: Array<string | null | undefined>) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}

function statusFromEvent(event: string) {
  const [, ...parts] = event.split("_");
  return parts.join("_") || event;
}

function subscriptionStatusFromEvent(event: string) {
  return event === "SUBSCRIPTION_DELETED" ? "DELETED" : null;
}

function checkoutStatusFromEvent(event: string) {
  if (event === "CHECKOUT_PAID") {
    return "PAID";
  }

  if (event === "CHECKOUT_CANCELED") {
    return "CANCELED";
  }

  if (event === "CHECKOUT_EXPIRED") {
    return "EXPIRED";
  }

  return null;
}

function normalizeDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const isoDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const brazilianDateMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (brazilianDateMatch) {
    return `${brazilianDateMatch[3]}-${brazilianDateMatch[2]}-${brazilianDateMatch[1]}`;
  }

  return null;
}

function normalizeTimestamp(value: string | null): string | null {
  const normalizedDate = normalizeDate(value);

  if (!value || !normalizedDate) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) || /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) {
    return `${normalizedDate}T00:00:00.000Z`;
  }

  const parseableValue = value.includes(" ")
    ? value.replace(" ", "T")
    : value;
  const parsed = new Date(parseableValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
