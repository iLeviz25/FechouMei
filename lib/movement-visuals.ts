export type MovementVisualType = "entrada" | "despesa";

export function getMovementVisualTone(type: MovementVisualType) {
  const income = type === "entrada";

  return {
    amountClass: income ? "text-success" : "text-destructive",
    badgeClass: income
      ? "border-success/18 bg-success/10 text-success"
      : "border-destructive/18 bg-destructive/10 text-destructive",
    iconClass: income
      ? "bg-success/10 text-success"
      : "bg-destructive/10 text-destructive",
    label: income ? "Entrada" : "Despesa",
  };
}
