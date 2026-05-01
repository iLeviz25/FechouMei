import type { SubscriptionPlan } from "@/lib/subscription/access";

export type BillingCycleCode = "monthly" | "semiannual" | "annual";

export type BillingCycle = {
  code: BillingCycleCode;
  label: string;
  installments: number;
  installmentPriceCents: number;
  totalCents: number;
  displayInstallment: string;
  internalAccessPlan: SubscriptionPlan;
  displayPrice?: string;
  priceCents?: number;
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
    priceCents: 4700,
    installments: 1,
    installmentPriceCents: 4700,
    totalCents: 4700,
    displayPrice: "R$ 47",
    displayInstallment: "R$ 47/mês",
    internalAccessPlan: internalAccessPlanForPaidCustomer,
  },
  {
    code: "semiannual",
    label: "Semestral",
    installments: 6,
    installmentPriceCents: 3790,
    totalCents: 22740,
    displayInstallment: "6x de R$ 37,90",
    internalAccessPlan: internalAccessPlanForPaidCustomer,
  },
  {
    code: "annual",
    label: "Anual",
    installments: 12,
    installmentPriceCents: 2990,
    totalCents: 35880,
    displayInstallment: "12x de R$ 29,90",
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

export function getInternalAccessPlanForPaidCustomer(): SubscriptionPlan {
  return internalAccessPlanForPaidCustomer;
}
