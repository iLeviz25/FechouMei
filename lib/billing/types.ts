import type { Database } from "@/types/database";
import type { BillingCycleCode } from "@/lib/billing/plans";

export type InternalPaidAccessPlan = "pro";
export type BillingCycle = BillingCycleCode;

export type AsaasCustomerRow = Database["public"]["Tables"]["asaas_customers"]["Row"];
export type AsaasCheckoutRow = Database["public"]["Tables"]["asaas_checkouts"]["Row"];
export type AsaasSubscriptionRow = Database["public"]["Tables"]["asaas_subscriptions"]["Row"];
export type AsaasPaymentRow = Database["public"]["Tables"]["asaas_payments"]["Row"];
export type AsaasWebhookEventRow = Database["public"]["Tables"]["asaas_webhook_events"]["Row"];
export type CaktoWebhookEventRow = Database["public"]["Tables"]["cakto_webhook_events"]["Row"];
export type CaktoOrderRow = Database["public"]["Tables"]["cakto_orders"]["Row"];

export type AsaasWebhookEventStatus = AsaasWebhookEventRow["status"];
export type CaktoWebhookEventStatus = CaktoWebhookEventRow["status"];

export const asaasWebhookEventStatuses = [
  "received",
  "processed",
  "ignored",
  "failed",
] as const satisfies readonly AsaasWebhookEventStatus[];

export const caktoWebhookEventStatuses = [
  "received",
  "processed",
  "ignored",
  "failed",
] as const satisfies readonly CaktoWebhookEventStatus[];
