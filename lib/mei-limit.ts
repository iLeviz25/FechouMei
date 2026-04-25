export const MEI_ANNUAL_LIMIT = 81000;

export type MeiLimitTone = "success" | "warning" | "orange" | "danger";

export type MeiLimitStatus = {
  badgeClass: string;
  label: "Tranquilo" | "Atencao" | "Cuidado" | "Quase no limite" | "Limite ultrapassado";
  progressClass: string;
  tone: MeiLimitTone;
};

export type MeiLimitInfo = {
  annualIncome: number;
  exceededLimit: number;
  remainingLimit: number;
  status: MeiLimitStatus;
  usage: number;
  usageDisplayPercent: number;
  usagePercent: number;
};

export function getMeiLimitStatus(usage: number): MeiLimitStatus {
  if (usage > 1) {
    return {
      badgeClass: "bg-destructive/18 text-primary-foreground",
      label: "Limite ultrapassado",
      progressClass: "bg-[linear-gradient(90deg,hsl(358_85%_62%)_0%,hsl(358_75%_50%)_100%)]",
      tone: "danger",
    };
  }

  if (usage >= 0.9) {
    return {
      badgeClass: "bg-[hsl(28_92%_52%/0.22)] text-primary-foreground",
      label: "Quase no limite",
      progressClass: "bg-[linear-gradient(90deg,hsl(38_95%_55%)_0%,hsl(28_92%_52%)_100%)]",
      tone: "orange",
    };
  }

  if (usage >= 0.75) {
    return {
      badgeClass: "bg-[hsl(28_92%_52%/0.18)] text-primary-foreground",
      label: "Cuidado",
      progressClass: "bg-[linear-gradient(90deg,hsl(40_96%_58%)_0%,hsl(28_92%_52%)_100%)]",
      tone: "orange",
    };
  }

  if (usage > 0.5) {
    return {
      badgeClass: "bg-secondary/20 text-primary-foreground",
      label: "Atencao",
      progressClass: "bg-[linear-gradient(90deg,hsl(50_96%_58%)_0%,hsl(38_95%_55%)_100%)]",
      tone: "warning",
    };
  }

  return {
    badgeClass: "bg-success/16 text-primary-foreground",
    label: "Tranquilo",
    progressClass: "bg-[linear-gradient(90deg,hsl(158_72%_45%)_0%,hsl(152_70%_58%)_100%)]",
    tone: "success",
  };
}

export function getMeiLimitInfo(annualIncome: number): MeiLimitInfo {
  const safeAnnualIncome = Math.max(annualIncome, 0);
  const usage = safeAnnualIncome / MEI_ANNUAL_LIMIT;
  const usageDisplayPercent = Math.max(usage * 100, 0);

  return {
    annualIncome: safeAnnualIncome,
    exceededLimit: Math.max(safeAnnualIncome - MEI_ANNUAL_LIMIT, 0),
    remainingLimit: Math.max(MEI_ANNUAL_LIMIT - safeAnnualIncome, 0),
    status: getMeiLimitStatus(usage),
    usage,
    usageDisplayPercent,
    usagePercent: Math.min(usageDisplayPercent, 100),
  };
}
