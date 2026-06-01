import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { WhatsAppInboundEventRecord } from "@/lib/channels/whatsapp/types";

type WhatsAppChannelPersistenceContext = {
  supabase: SupabaseClient<Database>;
};

const channel = "whatsapp";
const direction = "inbound";

export async function createInboundWhatsAppEvent(
  context: WhatsAppChannelPersistenceContext,
  record: WhatsAppInboundEventRecord,
) {
  const { error } = await context.supabase.from("agent_channel_events").insert({
    channel,
    conversation_id: record.conversationId ?? null,
    direction,
    error: record.error ?? null,
    external_message_id: record.externalMessageId,
    message_text: sanitizeInboundMessageText(record.messageText),
    provider: "evolution",
    provider_instance: record.instance ?? null,
    remote_id: record.remoteId ?? null,
    status: record.status,
    summary: record.summary ?? null,
    user_id: record.userId ?? null,
  });

  if (!error) {
    return { duplicate: false };
  }

  if (error.code === "23505") {
    return { duplicate: true };
  }

  throw new Error(error.message);
}

export async function updateInboundWhatsAppEvent(
  context: WhatsAppChannelPersistenceContext,
  record: WhatsAppInboundEventRecord,
) {
  const { error } = await context.supabase
    .from("agent_channel_events")
    .update({
      conversation_id: record.conversationId ?? null,
      error: record.error ?? null,
      message_text: sanitizeInboundMessageText(record.messageText),
      processed_at: new Date().toISOString(),
      provider_instance: record.instance ?? null,
      remote_id: record.remoteId ?? null,
      status: record.status,
      summary: record.summary ?? null,
      user_id: record.userId ?? null,
    })
    .eq("channel", channel)
    .eq("direction", direction)
    .eq("external_message_id", record.externalMessageId);

  if (error) {
    throw new Error(error.message);
  }
}

export function sanitizeInboundMessageText(value?: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/\b(?:\+?55)?\d[\d\s().-]{7,}\d\b/g, "[numero]")
    .replace(/\b(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\b/gi, "[valor]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
