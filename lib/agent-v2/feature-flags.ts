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

export function shouldUseAgentV2ForWhatsApp(input: {
  remoteNumber?: string | null;
  userId: string;
}) {
  return isAgentV2FeatureEnabled() && isAgentV2Allowlisted(input);
}

export function getAgentV2WhatsAppRouteDecision(input: {
  message: string;
  remoteNumber?: string | null;
  source: AgentV2RouteSource;
  state?: AgentConversationState | null;
  userId: string;
}): AgentV2WhatsAppRouteDecision {
  if (!isAgentV2FeatureEnabled()) {
    return { enabled: false, reason: "feature_disabled" };
  }

  if (!isAgentV2Allowlisted(input)) {
    return { enabled: false, reason: "not_allowlisted" };
  }

  if (input.source !== "text") {
    return { enabled: false, reason: "audio_not_supported" };
  }

  if (input.state && input.state.status !== "idle") {
    return { enabled: false, reason: "pending_state_v1" };
  }

  if (!canAgentV2HandleTurn(input)) {
    return { enabled: false, reason: "read_action_v1" };
  }

  return { enabled: true, reason: "enabled" };
}

function isAgentV2FeatureEnabled() {
  return isTruthyFlag(process.env.HELENA_V2_ENABLED);
}

function isAgentV2Allowlisted({
  remoteNumber,
  userId,
}: {
  remoteNumber?: string | null;
  userId: string;
}) {
  if (isTruthyFlag(process.env.HELENA_V2_ALLOW_ALL)) {
    return true;
  }

  const userIds = parseAllowlist(process.env.HELENA_V2_USER_IDS);

  if (userIds.has(userId.trim().toLowerCase())) {
    return true;
  }

  const normalizedRemoteNumber = normalizePhoneNumber(remoteNumber);

  if (!normalizedRemoteNumber) {
    return false;
  }

  const numbers = parseAllowlist(process.env.HELENA_V2_WHATSAPP_NUMBERS, normalizePhoneNumber);

  return numbers.has(normalizedRemoteNumber);
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
