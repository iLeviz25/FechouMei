export type MovementVisualType = "entrada" | "despesa";

export function getMovementVisualTone(type: MovementVisualType) {
  const income = type === "entrada";

  return {
    amountClass: income ? "text-primary" : "text-destructive",
    badgeClass: income
      ? "border-primary/18 bg-primary/10 text-primary"
      : "border-destructive/18 bg-destructive/10 text-destructive",
    iconClass: income
      ? "bg-primary/10 text-primary"
      : "bg-destructive/10 text-destructive",
    label: income ? "Entrada" : "Despesa",
  };
}
