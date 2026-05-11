import { after, NextResponse } from "next/server";
import {
  type ParsedCaktoWebhookEvent,
  parseCaktoWebhookEvent,
  processCaktoWebhookEvent,
  saveCaktoWebhookEvent,
  validateCaktoWebhookSecret,
} from "@/lib/billing/cakto-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, reason: "invalid_webhook_payload" },
        { status: 400 },
      );
    }

    console.error("[cakto-webhook] Failed to read request body.", sanitizeWebhookError(error));
    return NextResponse.json(
      { ok: false, reason: "cakto_webhook_read_failed" },
      { status: 500 },
    );
  }

  const authResult = validateCaktoWebhookSecret(request, payload);

  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, reason: authResult.reason },
      { status: authResult.status },
    );
  }

  const parsed = parseCaktoWebhookEvent(payload);

  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, reason: parsed.reason },
      { status: 400 },
    );
  }

  try {
    const result = await saveCaktoWebhookEvent(parsed.event);

    if (result.status === "duplicate") {
      if (result.webhookEventId && shouldReprocessDuplicateWebhook(result.existingStatus)) {
        scheduleCaktoWebhookProcessing(result.webhookEventId, parsed.event);

        return NextResponse.json({
          ok: true,
          status: "received",
          operations: ["cakto_webhook_events"],
          reason: "duplicate_reprocessing_scheduled",
        });
      }

      return NextResponse.json({
        ok: true,
        status: result.status,
      });
    }

    scheduleCaktoWebhookProcessing(result.webhookEventId, parsed.event);

    return NextResponse.json({
      ok: true,
      status: "received",
      operations: ["cakto_webhook_events"],
      reason: "processing_scheduled",
    });
  } catch (error) {
    console.error("[cakto-webhook] Failed to persist or process webhook event.", sanitizeWebhookError(error));

    return NextResponse.json(
      { ok: false, reason: "cakto_webhook_processing_failed" },
      { status: 500 },
    );
  }
}

function shouldReprocessDuplicateWebhook(status: string | null) {
  return status === "failed" || status === "received";
}

function scheduleCaktoWebhookProcessing(
  webhookEventId: string,
  event: ParsedCaktoWebhookEvent,
) {
  after(async () => {
    try {
      const processingResult = await processCaktoWebhookEvent(
        webhookEventId,
        event,
      );

      console.info("[cakto-webhook] Background processing completed.", {
        webhookEventId,
        status: processingResult.status,
        reason: processingResult.reason,
      });
    } catch (error) {
      console.error("[cakto-webhook] Background processing failed.", sanitizeWebhookError(error));
    }
  });
}

function sanitizeWebhookError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : "Unknown webhook error",
      name: typeof record.name === "string" ? record.name : undefined,
    };
  }

  return {
    message: "Unknown webhook error",
  };
}
