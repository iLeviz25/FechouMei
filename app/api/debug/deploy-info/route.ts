import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAgentV2FeatureFlagSnapshot } from "@/lib/agent-v2/feature-flags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = validateDebugSecret(request);

  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, reason: authResult.reason },
      { status: authResult.status },
    );
  }

  const agentV2Flags = getAgentV2FeatureFlagSnapshot();

  return NextResponse.json({
    agentV2: {
      allowAll: agentV2Flags.allowAll,
      allowlistConfigured: agentV2Flags.allowlistConfigured,
      defaultEnabled: agentV2Flags.defaultEnabled,
      enabled: agentV2Flags.enabled,
      forceV1Fallback: agentV2Flags.forceV1Fallback,
      legacyGlobalFlagEnabled: agentV2Flags.legacyGlobalFlagEnabled,
      numberAllowlistConfigured: agentV2Flags.numberAllowlistConfigured,
      userAllowlistConfigured: agentV2Flags.userAllowlistConfigured,
    },
    build: {
      checkedAt: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      vercelGitRepoOwner: process.env.VERCEL_GIT_REPO_OWNER ?? null,
      vercelGitRepoSlug: process.env.VERCEL_GIT_REPO_SLUG ?? null,
      vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
      vercelUrl: process.env.VERCEL_URL ?? null,
    },
    envPresence: {
      deployDebugSecret: Boolean(process.env.DEPLOY_DEBUG_SECRET?.trim()),
      evolutionApiBaseUrl: Boolean(process.env.EVOLUTION_API_BASE_URL?.trim()),
      evolutionApiInstance: Boolean(process.env.EVOLUTION_API_INSTANCE?.trim()),
      evolutionApiKey: Boolean(process.env.EVOLUTION_API_KEY?.trim()),
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      geminiModel: Boolean(process.env.GEMINI_MODEL?.trim()),
      geminiTranscriptionApiKey: Boolean(process.env.GEMINI_TRANSCRIPTION_API_KEY?.trim()),
      geminiTranscriptionFallbackModel: Boolean(process.env.GEMINI_TRANSCRIPTION_FALLBACK_MODEL?.trim()),
      geminiTranscriptionModel: Boolean(process.env.GEMINI_TRANSCRIPTION_MODEL?.trim()),
      supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      whatsappChannelEnabled: process.env.WHATSAPP_CHANNEL_ENABLED?.trim() === "true",
      whatsappWebhookSecret: Boolean(process.env.WHATSAPP_WEBHOOK_SECRET?.trim()),
    },
    ok: true,
    project: {
      name: process.env.VERCEL_PROJECT_NAME ?? "fechou-mei",
    },
  });
}

type DebugAuthResult =
  | { ok: true }
  | {
      ok: false;
      reason: "debug_secret_not_configured" | "debug_unauthorized" | "debug_forbidden";
      status: 401 | 403 | 503;
    };

function validateDebugSecret(request: Request): DebugAuthResult {
  const configuredSecret = process.env.DEPLOY_DEBUG_SECRET?.trim();

  if (!configuredSecret) {
    return {
      ok: false,
      reason: "debug_secret_not_configured",
      status: 503,
    };
  }

  const providedSecret = getProvidedDebugSecret(request);

  if (!providedSecret) {
    return {
      ok: false,
      reason: "debug_unauthorized",
      status: 401,
    };
  }

  if (!safeSecretEquals(providedSecret, configuredSecret)) {
    return {
      ok: false,
      reason: "debug_forbidden",
      status: 403,
    };
  }

  return { ok: true };
}

function getProvidedDebugSecret(request: Request) {
  const headerSecret = request.headers.get("x-debug-secret")?.trim();

  if (headerSecret) {
    return headerSecret;
  }

  const url = new URL(request.url);
  return url.searchParams.get("debug_secret")?.trim() ?? null;
}

function safeSecretEquals(providedSecret: string, configuredSecret: string) {
  const provided = Buffer.from(providedSecret);
  const configured = Buffer.from(configuredSecret);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
