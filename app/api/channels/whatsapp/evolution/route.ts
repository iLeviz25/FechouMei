import { NextResponse } from "next/server";
import { handleEvolutionWhatsAppWebhook } from "@/lib/channels/whatsapp/adapter";
import { WhatsAppChannelConfigError } from "@/lib/channels/whatsapp/evolution";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await handleEvolutionWhatsAppWebhook(payload);

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
