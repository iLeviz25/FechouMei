export const asaasBillingTables = {
  checkouts: "asaas_checkouts",
  customers: "asaas_customers",
  payments: "asaas_payments",
  subscriptions: "asaas_subscriptions",
  webhookEvents: "asaas_webhook_events",
} as const;

export type AsaasBillingTableName = (typeof asaasBillingTables)[keyof typeof asaasBillingTables];
