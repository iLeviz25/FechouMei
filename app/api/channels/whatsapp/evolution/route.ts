import { NextResponse } from "next/server";
import { handleEvolutionWhatsAppWebhook } from "@/lib/channels/whatsapp/adapter";
import { WhatsAppChannelConfigError } from "@/lib/channels/whatsapp/evolution";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const routeStartedAt = Date.now();
  markWebhookRouteLatency(routeStartedAt, "webhook_received");
  const authResult = validateWhatsAppWebhookRequest(request);
  markWebhookRouteLatency(routeStartedAt, "webhook_secret_validation_finished", {
    ok: authResult.ok,
    status: authResult.ok ? 200 : authResult.status,
  });

  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, reason: authResult.reason },
      { status: authResult.status },
    );
  }

  try {
    const payload = await request.json();
    markWebhookRouteLatency(routeStartedAt, "webhook_body_parse_finished");
    const result = await handleEvolutionWhatsAppWebhook(payload);
    markWebhookRouteLatency(routeStartedAt, "webhook_handler_finished", {
      status: result.status,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof WhatsAppChannelConfigError) {
      return NextResponse.json(
        { ok: false, reason: "whatsapp_channel_not_configured" },
        { status: 503 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, reason: "invalid_webhook_payload" },
        { status: 400 },
      );
    }

    console.error("WhatsApp Evolution webhook failed before processing.", error);

    return NextResponse.json(
      { ok: false, reason: "whatsapp_webhook_processing_failed" },
      { status: 500 },
    );
  }
}

function markWebhookRouteLatency(
  startedAt: number,
  stage: string,
  metadata: Record<string, unknown> = {},
) {
  const elapsedMs = Date.now() - startedAt;

  console.info("[FECHOUMEI_WHATSAPP_LATENCY]", {
    elapsedMs,
    provider: "evolution",
    stage,
    surface: "webhook_route",
    ...metadata,
  });
}

type WhatsAppWebhookAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason:
        | "whatsapp_webhook_secret_not_configured"
        | "whatsapp_webhook_unauthorized"
        | "whatsapp_webhook_forbidden";
      status: 401 | 403 | 503;
    };

function validateWhatsAppWebhookRequest(request: Request): WhatsAppWebhookAuthResult {
  const configuredSecret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();

  if (!configuredSecret) {
    console.error("WhatsApp webhook rejected because WHATSAPP_WEBHOOK_SECRET is not configured.");
    return {
      ok: false,
      reason: "whatsapp_webhook_secret_not_configured",
      status: 503,
    };
  }

  const providedSecret = getProvidedWebhookSecret(request);

  if (!providedSecret) {
    return {
      ok: false,
      reason: "whatsapp_webhook_unauthorized",
      status: 401,
    };
  }

  if (!safeSecretEquals(providedSecret, configuredSecret)) {
    return {
      ok: false,
      reason: "whatsapp_webhook_forbidden",
      status: 403,
    };
  }

  return { ok: true };
}

function getProvidedWebhookSecret(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();

  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const headerSecret =
    request.headers.get("x-fechoumei-webhook-secret") ??
    request.headers.get("x-webhook-secret");

  if (headerSecret?.trim()) {
    return headerSecret.trim();
  }

  const url = new URL(request.url);
  return (
    url.searchParams.get("webhook_secret") ??
    url.searchParams.get("token") ??
    url.searchParams.get("secret")
  )?.trim();
}

function safeSecretEquals(providedSecret: string, configuredSecret: string) {
  const provided = Buffer.from(providedSecret);
  const configured = Buffer.from(configuredSecret);

  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
