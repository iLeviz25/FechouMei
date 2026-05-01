import { NextResponse } from "next/server";
import {
  parseAsaasWebhookEvent,
  processAsaasWebhookEvent,
  saveAsaasWebhookEvent,
  validateAsaasWebhookToken,
} from "@/lib/billing/asaas-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResult = validateAsaasWebhookToken(request);

  if (!authResult.ok) {
    return NextResponse.json(
      { ok: false, reason: authResult.reason },
      { status: authResult.status },
    );
  }

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

    console.error("[asaas-webhook] Failed to read request body.", sanitizeWebhookError(error));
    return NextResponse.json(
      { ok: false, reason: "asaas_webhook_read_failed" },
      { status: 500 },
    );
  }

  const parsed = parseAsaasWebhookEvent(payload);

  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, reason: parsed.reason },
      { status: 400 },
    );
  }

  try {
    const result = await saveAsaasWebhookEvent(parsed.event);

    if (result.status === "duplicate") {
      return NextResponse.json({
        ok: true,
        status: result.status,
      });
    }

    const processingResult = await processAsaasWebhookEvent(
      result.webhookEventId,
      parsed.event,
    );

    return NextResponse.json({
      ok: true,
      status: processingResult.status,
      operations: processingResult.operations,
      reason: processingResult.reason,
    });
  } catch (error) {
    console.error("[asaas-webhook] Failed to persist or process webhook event.", sanitizeWebhookError(error));

    return NextResponse.json(
      { ok: false, reason: "asaas_webhook_processing_failed" },
      { status: 500 },
    );
  }
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
