import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Profile } from "@/types/database";

export type SubscriptionPlan = "essential" | "pro";
export type SubscriptionStatus = "active" | "pending_payment" | "past_due" | "canceled";

export type SubscriptionAccess = {
  canAccessApp: boolean;
  canImport: boolean;
  canUseAppExport: boolean;
  canUseAppImport: boolean;
  canUseAdvancedHelena: boolean;
  canUseFileFeatures: boolean;
  canUseHelenaImportExport: boolean;
  canUseHelena: boolean;
  canUseReports: boolean;
  dailyHelenaLimit: number | null;
  isAdmin: boolean;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
};

export type HelenaDailyUsageResult = {
  allowed: boolean;
  limit: number | null;
  plan: SubscriptionPlan;
  reason: string;
  remaining: number | null;
  reply: string;
  status: SubscriptionStatus;
  used: number;
};

type SubscriptionProfile = Pick<Profile, "role" | "subscription_plan" | "subscription_status"> | null;

export const essentialHelenaDailyMessageLimit = 15;
export const proHelenaDailyMessageLimit = 50;

export const helenaDailyLimitReply =
  "Você atingiu o limite diário da Helena. Tente novamente amanhã.";

export const helenaFileAccessBlockedReply =
  "Seu acesso ao FechouMEI ainda não está ativo. Finalize ou regularize sua assinatura para usar arquivos pela Helena/WhatsApp.";

const subscriptionBlockedReplies: Record<SubscriptionStatus, string> = {
  active: "",
  canceled: "Seu acesso ao FechouMEI está cancelado. Finalize ou regularize sua assinatura para continuar.",
  past_due: "Existe um pagamento pendente na sua assinatura. Regularize sua assinatura para continuar.",
  pending_payment: "Seu acesso ao FechouMEI ainda não está ativo. Finalize sua assinatura para continuar.",
};

export function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan {
  return value === "pro" ? "pro" : "essential";
}

export function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  return value === "active" || value === "past_due" || value === "canceled"
    ? value
    : "pending_payment";
}

export function getDailyHelenaLimit(plan: SubscriptionPlan) {
  return proHelenaDailyMessageLimit;
}

export function getSubscriptionAccessFromProfile(profile: SubscriptionProfile): SubscriptionAccess {
  const isAdmin = profile?.role === "admin";
  const plan = isAdmin ? "pro" : normalizeSubscriptionPlan(profile?.subscription_plan);
  const status = isAdmin ? "active" : normalizeSubscriptionStatus(profile?.subscription_status);
  const hasActiveAccess = isAdmin || status === "active";

  return {
    canAccessApp: hasActiveAccess,
    canImport: hasActiveAccess,
    canUseAdvancedHelena: hasActiveAccess,
    canUseAppExport: hasActiveAccess,
    canUseAppImport: hasActiveAccess,
    canUseFileFeatures: hasActiveAccess,
    canUseHelenaImportExport: hasActiveAccess,
    canUseHelena: hasActiveAccess,
    canUseReports: hasActiveAccess,
    dailyHelenaLimit: isAdmin ? null : proHelenaDailyMessageLimit,
    isAdmin,
    plan,
    status,
  };
}

export function getSubscriptionBlockedReply(status: SubscriptionStatus) {
  return subscriptionBlockedReplies[status] || subscriptionBlockedReplies.pending_payment;
}

export function getSubscriptionBlockedTitle(status: SubscriptionStatus) {
  if (status === "past_due") {
    return "Pagamento pendente";
  }

  if (status === "canceled") {
    return "Acesso cancelado";
  }

  return "Acesso ainda não ativo";
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus) {
  const labels: Record<SubscriptionStatus, string> = {
    active: "Ativo",
    canceled: "Cancelado",
    past_due: "Pagamento pendente",
    pending_payment: "Aguardando confirmação",
  };

  return labels[status];
}

export async function getUserSubscriptionAccess({
  supabase,
  userId,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<SubscriptionAccess> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, subscription_plan, subscription_status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[subscription] Failed to load subscription access", {
      message: error.message,
      userId,
    });
    return getSubscriptionAccessFromProfile(null);
  }

  return getSubscriptionAccessFromProfile(data);
}

export async function consumeHelenaDailyMessage({
  supabase,
  userId,
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<HelenaDailyUsageResult> {
  const { data, error } = await supabase.rpc("consume_helena_daily_message", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[subscription] Failed to consume Helena daily usage", {
      message: error.message,
      userId,
    });

    return {
      allowed: false,
      limit: 0,
      plan: "essential",
      reason: "usage_unavailable",
      remaining: 0,
      reply: "Não consegui validar seu limite da Helena agora. Tente novamente em instantes.",
      status: "pending_payment",
      used: 0,
    };
  }

  const payload = asRecord(data);
  const plan = normalizeSubscriptionPlan(payload.plan);
  const status = normalizeSubscriptionStatus(payload.status);
  const reason = typeof payload.reason === "string" ? payload.reason : "allowed";
  const allowed = payload.allowed === true;

  return {
    allowed,
    limit: asNullableNumber(payload.limit),
    plan,
    reason,
    remaining: asNullableNumber(payload.remaining),
    reply: getHelenaUsageReply({ allowed, reason, status }),
    status,
    used: asNumber(payload.used),
  };
}

export function getHelenaUsageReply({
  allowed,
  reason,
  status,
}: {
  allowed: boolean;
  reason: string;
  status: SubscriptionStatus;
}) {
  if (allowed) {
    return "";
  }

  if (reason === "daily_limit_reached") {
    return helenaDailyLimitReply;
  }

  return getSubscriptionBlockedReply(status);
}

function asRecord(value: Json | unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asNullableNumber(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  return asNumber(value);
}
