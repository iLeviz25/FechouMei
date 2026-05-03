export type CheckoutReturnCycle = "monthly" | "quarterly" | "annual";

const returnCycleLabels = {
  monthly: "Plano Mensal",
  quarterly: "Plano Trimestral",
  annual: "Plano Anual",
} as const satisfies Record<CheckoutReturnCycle, string>;

export function getCheckoutReturnCycleLabel(cycle: string | null | undefined) {
  if (!isCheckoutReturnCycle(cycle)) {
    return null;
  }

  return returnCycleLabels[cycle];
}

export function isCheckoutReturnCycle(cycle: unknown): cycle is CheckoutReturnCycle {
  return typeof cycle === "string" && cycle in returnCycleLabels;
}
