import type { SubscriptionPlan } from "@/lib/subscription/access";

export type BillingCycleCode = "monthly" | "quarterly" | "annual";

export type BillingCycle = {
  code: BillingCycleCode;
  label: string;
  priceCents: number;
  totalCents: number;
  displayPrice: string;
  displayInstallment: string;
  displayTotal: string;
  equivalentMonthly?: string;
  offerId: string;
  checkoutUrl: string;
  internalAccessPlan: SubscriptionPlan;
};

export const billingProduct = {
  code: "fechoumei_complete",
  name: "FechouMEI Completo",
  internalAccessPlan: "pro" satisfies SubscriptionPlan,
} as const;

const internalAccessPlanForPaidCustomer: SubscriptionPlan = "pro";

const billingCycles = [
  {
    code: "monthly",
    label: "Mensal",
    priceCents: 4790,
    totalCents: 4790,
    displayPrice: "R$ 47,90/mês",
    displayInstallment: "R$ 47,90/mês",
    displayTotal: "R$ 47,90",
    offerId: "yp9ig32",
    checkoutUrl: "https://pay.cakto.com.br/yp9ig32_871207",
    internalAccessPlan: internalAccessPlanForPaidCustomer,
  },
  {
    code: "quarterly",
    label: "Trimestral",
    priceCents: 11970,
    totalCents: 11970,
    displayPrice: "R$ 119,70/trimestre",
    displayInstallment: "R$ 119,70/trimestre",
    displayTotal: "R$ 119,70",
    equivalentMonthly: "R$ 39,90/mês",
    offerId: "87bxdzb",
    checkoutUrl: "https://pay.cakto.com.br/87bxdzb",
    internalAccessPlan: internalAccessPlanForPaidCustomer,
  },
  {
    code: "annual",
    label: "Anual",
    priceCents: 29700,
    totalCents: 29700,
    displayPrice: "R$ 297,00/ano",
    displayInstallment: "R$ 297,00/ano",
    displayTotal: "R$ 297,00",
    equivalentMonthly: "R$ 24,75/mês",
    offerId: "34ebr2s",
    checkoutUrl: "https://pay.cakto.com.br/34ebr2s",
    internalAccessPlan: internalAccessPlanForPaidCustomer,
  },
] as const satisfies readonly BillingCycle[];

export function getBillingCycles() {
  return billingCycles;
}

export function getBillingCycleByCode(code: string | null | undefined) {
  return billingCycles.find((cycle) => cycle.code === code);
}

export function isValidBillingCycle(code: unknown): code is BillingCycleCode {
  return typeof code === "string" && billingCycles.some((cycle) => cycle.code === code);
}

export function getBillingCycleByCaktoOfferId(offerId: string | null | undefined) {
  if (!offerId) {
    return undefined;
  }

  return billingCycles.find((cycle) => cycle.offerId === offerId);
}

export function getInternalAccessPlanForPaidCustomer(): SubscriptionPlan {
  return internalAccessPlanForPaidCustomer;
}
