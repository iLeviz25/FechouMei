import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Profile } from "@/types/database";

export type SubscriptionPlan = "essential" | "pro";
export type SubscriptionStatus = "active" | "pending_payment" | "past_due" | "canceled";

export type SubscriptionAccess = {
  canAccessApp: boolean;
  canUseAdvancedHelena: boolean;
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

export const helenaDailyLimitReply =
  "Você atingiu o limite diário da Helena do seu plano. Tente novamente amanhã ou atualize seu plano.";

export const helenaProFeatureReply =
  "Esse recurso faz parte do plano Pro. No Essencial, você pode continuar registrando e consultando pela Helena, mas importação/exportação por WhatsApp fica no Pro.";

const subscriptionBlockedReplies: Record<SubscriptionStatus, string> = {
  active: "",
  canceled: "Seu acesso ao FechouMEI esta cancelado. Regularize sua assinatura para voltar a usar o app.",
  past_due: "Existe um pagamento pendente na sua assinatura. Regularize para voltar a usar o FechouMEI.",
  pending_payment: "Seu acesso ao FechouMEI esta aguardando a confirmacao do pagamento.",
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
  return plan === "pro" ? 100 : 30;
}

export function getSubscriptionAccessFromProfile(profile: SubscriptionProfile): SubscriptionAccess {
  const isAdmin = profile?.role === "admin";
  const plan = isAdmin ? "pro" : normalizeSubscriptionPlan(profile?.subscription_plan);
  const status = isAdmin ? "active" : normalizeSubscriptionStatus(profile?.subscription_status);

  return {
    canAccessApp: isAdmin || status === "active",
    canUseAdvancedHelena: isAdmin || plan === "pro",
    dailyHelenaLimit: isAdmin ? null : getDailyHelenaLimit(plan),
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

  return "Aguardando pagamento";
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
