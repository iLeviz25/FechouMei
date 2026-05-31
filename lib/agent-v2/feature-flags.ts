import type { AgentConversationState } from "@/lib/agent/types";
import {
  type AgentV2RouteSource,
  canAgentV2HandleTurn,
} from "@/lib/agent-v2/guardrails";

export type AgentV2WhatsAppRouteDecision = {
  enabled: boolean;
  reason:
    | "feature_disabled"
    | "not_allowlisted"
    | "audio_not_supported"
    | "pending_state_v1"
    | "read_action_v1"
    | "enabled";
};

export type AgentV2FeatureFlagSnapshot = {
  allowAll: boolean;
  allowlistConfigured: boolean;
  enabled: boolean;
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

  return snapshot.enabled && (snapshot.allowAll || snapshot.userAllowlisted || snapshot.numberAllowlisted);
}

export function getAgentV2WhatsAppRouteDecision(input: {
  message: string;
  remoteNumber?: string | null;
  source: AgentV2RouteSource;
  state?: AgentConversationState | null;
  userId: string;
}): AgentV2WhatsAppRouteDecision {
  const snapshot = getAgentV2FeatureFlagSnapshot(input);

  if (!snapshot.enabled) {
    return { enabled: false, reason: "feature_disabled" };
  }

  if (!snapshot.allowAll && !snapshot.userAllowlisted && !snapshot.numberAllowlisted) {
    return { enabled: false, reason: "not_allowlisted" };
  }

  if (input.source !== "text") {
    return { enabled: false, reason: "audio_not_supported" };
  }

  const canHandle = canAgentV2HandleTurn(input);

  if (!canHandle) {
    return {
      enabled: false,
      reason: input.state && input.state.status !== "idle" ? "pending_state_v1" : "read_action_v1",
    };
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
  const enabled = isAgentV2FeatureEnabled();
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
    enabled,
    numberAllowlistConfigured: numbers.size > 0,
    numberAllowlisted,
    userAllowlistConfigured: userIds.size > 0,
    userAllowlisted,
  };
}

function isAgentV2FeatureEnabled() {
  return isTruthyFlag(process.env.HELENA_V2_ENABLED);
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
