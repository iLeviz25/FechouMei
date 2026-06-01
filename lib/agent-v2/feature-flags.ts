import type { AgentConversationState } from "@/lib/agent/types";
import type { AgentV2RouteSource } from "@/lib/agent-v2/guardrails";

export type AgentV2WhatsAppRouteDecision = {
  enabled: boolean;
  reason:
    | "forced_v1_fallback"
    | "enabled";
};

export type AgentV2FeatureFlagSnapshot = {
  allowAll: boolean;
  allowlistConfigured: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
  forceV1Fallback: boolean;
  legacyGlobalFlagEnabled: boolean;
  numberAllowlistConfigured: boolean;
  numberAllowlisted: boolean;
  userAllowlistConfigured: boolean;
  userAllowlisted: boolean;
};

export function shouldUseAgentV2ForWhatsApp(input: {
  remoteNumber?: string | null;
  userId: string;
}) {
  const snapshot = getAgentV2FeatureFlagSnapshot(input);

  return snapshot.enabled;
}

export function getAgentV2WhatsAppRouteDecision(input: {
  message: string;
  remoteNumber?: string | null;
  source: AgentV2RouteSource;
  state?: AgentConversationState | null;
  userId: string;
}): AgentV2WhatsAppRouteDecision {
  const snapshot = getAgentV2FeatureFlagSnapshot(input);

  if (snapshot.forceV1Fallback) {
    return { enabled: false, reason: "forced_v1_fallback" };
  }

  return { enabled: true, reason: "enabled" };
}

export function getAgentV2FeatureFlagSnapshot({
  remoteNumber,
  userId,
}: {
  remoteNumber?: string | null;
  userId?: string | null;
} = {}): AgentV2FeatureFlagSnapshot {
  const forceV1Fallback = isAgentV1FallbackForced();
  const legacyGlobalFlagEnabled = isAgentV2FeatureEnabled();
  const defaultEnabled = true;
  const enabled = defaultEnabled && !forceV1Fallback;
  const allowAll = isTruthyFlag(process.env.HELENA_V2_ALLOW_ALL);
  const userIds = parseAllowlist(process.env.HELENA_V2_USER_IDS);
  const numbers = parseAllowlist(process.env.HELENA_V2_WHATSAPP_NUMBERS, normalizePhoneNumber);
  const normalizedUserId = userId?.trim().toLowerCase() ?? "";
  const normalizedRemoteNumber = normalizePhoneNumber(remoteNumber);
  const userAllowlisted = Boolean(normalizedUserId && userIds.has(normalizedUserId));
  const numberAllowlisted = Boolean(normalizedRemoteNumber && numbers.has(normalizedRemoteNumber));

  return {
    allowAll,
    allowlistConfigured: allowAll || userIds.size > 0 || numbers.size > 0,
    defaultEnabled,
    enabled,
    forceV1Fallback,
    legacyGlobalFlagEnabled,
    numberAllowlistConfigured: numbers.size > 0,
    numberAllowlisted,
    userAllowlistConfigured: userIds.size > 0,
    userAllowlisted,
  };
}

function isAgentV2FeatureEnabled() {
  return isTruthyFlag(process.env.HELENA_V2_ENABLED);
}

export function isAgentV1FallbackForced() {
  return (
    isTruthyFlag(process.env.HELENA_FORCE_V1) ||
    isTruthyFlag(process.env.HELENA_USE_V1_FALLBACK)
  );
}

function parseAllowlist(
  value?: string,
  normalize: (entry: string) => string = (entry) => entry.trim().toLowerCase(),
) {
  return new Set(
    (value ?? "")
      .split(/[\s,;]+/)
      .map((entry) => normalize(entry))
      .filter(Boolean),
  );
}

function normalizePhoneNumber(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function isTruthyFlag(value?: string | null) {
  return /^(1|true|yes|on|enabled|allowlist)$/i.test(value?.trim() ?? "");
}
