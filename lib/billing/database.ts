export const asaasBillingTables = {
  checkouts: "asaas_checkouts",
  customers: "asaas_customers",
  payments: "asaas_payments",
  subscriptions: "asaas_subscriptions",
  webhookEvents: "asaas_webhook_events",
} as const;

export type AsaasBillingTableName = (typeof asaasBillingTables)[keyof typeof asaasBillingTables];

export const caktoBillingTables = {
  orders: "cakto_orders",
  webhookEvents: "cakto_webhook_events",
} as const;

export type CaktoBillingTableName = (typeof caktoBillingTables)[keyof typeof caktoBillingTables];
