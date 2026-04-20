import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WhatsAppAssistantLink } from "@/types/database";

const defaultAssistantNumber = "5511948927889";
const activationTtlMs = 30 * 60 * 1000;
const activationCodePrefix = "FM";

type WhatsAppActivationContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

type WhatsAppWebhookActivationContext = {
  supabase: SupabaseClient<Database>;
};

export type WhatsAppAssistantActivationStatus =
  | "not_activated"
  | "pending"
  | "linked"
  | "expired"
  | "revoked";

export type WhatsAppAssistantActivationSnapshot = {
  activationCode: string | null;
  activationExpiresAt: string | null;
  assistantNumber: string;
  linkedAt: string | null;
  phoneNumber: string | null;
  status: WhatsAppAssistantActivationStatus;
};

export type WhatsAppInboundUserResolution =
  | {
      kind: "linked";
      userId: string;
      linkId: string;
    }
  | {
      kind: "activated";
      userId: string;
      linkId: string;
    }
  | {
      kind: "invalid_activation_code";
      activationCode: string;
    }
  | {
      kind: "expired_activation_code";
      activationCode: string;
      userId: string;
      linkId: string;
    }
  | {
      kind: "unlinked";
    };

export function getWhatsAppAssistantNumber() {
  return normalizePhoneNumber(process.env.WHATSAPP_ASSISTANT_NUMBER) ?? defaultAssistantNumber;
}

export function buildWhatsAppActivationMessage(activationCode: string) {
  return `Ativar Helena FechouMEI: ${activationCode}`;
}

export function buildWhatsAppActivationUrl(activationCode: string) {
  const assistantNumber = getWhatsAppAssistantNumber();
  return `https://wa.me/${assistantNumber}?text=${encodeURIComponent(buildWhatsAppActivationMessage(activationCode))}`;
}

export async function getWhatsAppAssistantActivationSnapshot(
  context: WhatsAppActivationContext,
): Promise<WhatsAppAssistantActivationSnapshot> {
  const link = await getLinkByUserId(context);

  if (!link) {
    return linkToSnapshot(null);
  }

  if (isPendingLinkExpired(link)) {
    const expiredLink = await updateLinkStatus(context, {
      activationCode: null,
      activationExpiresAt: null,
      status: "expired",
    });

    return linkToSnapshot(expiredLink);
  }

  return linkToSnapshot(link);
}

export async function startWhatsAppAssistantActivation(
  context: WhatsAppActivationContext,
): Promise<WhatsAppAssistantActivationSnapshot> {
  const current = await getLinkByUserId(context);

  if (current?.status === "linked") {
    return linkToSnapshot(current);
  }

  const activationCode = await createUniqueActivationCode(context.supabase);
  const expiresAt = new Date(Date.now() + activationTtlMs).toISOString();

  const { data, error } = await context.supabase
    .from("whatsapp_assistant_links")
    .upsert(
      {
        activation_code: activationCode,
        activation_expires_at: expiresAt,
        linked_at: null,
        phone_number: null,
        remote_jid: null,
        status: "pending",
        user_id: context.userId,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return linkToSnapshot(data);
}

export async function unlinkWhatsAppAssistant(
  context: WhatsAppActivationContext,
): Promise<WhatsAppAssistantActivationSnapshot> {
  const current = await getLinkByUserId(context);

  if (!current) {
    return linkToSnapshot(null);
  }

  const updated = await updateLinkStatus(context, {
    activationCode: null,
    activationExpiresAt: null,
    linkedAt: null,
    phoneNumber: null,
    remoteJid: null,
    status: "revoked",
  });

  return linkToSnapshot(updated);
}

export async function resolveWhatsAppInboundUser({
  context,
  messageText,
  remoteJid,
  remoteNumber,
}: {
  context: WhatsAppWebhookActivationContext;
  messageText?: string | null;
  remoteJid?: string | null;
  remoteNumber: string;
}): Promise<WhatsAppInboundUserResolution> {
  const normalizedRemoteNumber = normalizePhoneNumber(remoteNumber);

  if (!normalizedRemoteNumber) {
    return { kind: "unlinked" };
  }

  const activationCode = extractWhatsAppActivationCode(messageText);

  if (!activationCode) {
    const linked = await getLinkedLinkByPhone(context, normalizedRemoteNumber);

    if (linked) {
      await touchLinkedInbound(context, linked.id);
      return {
        kind: "linked",
        linkId: linked.id,
        userId: linked.user_id,
      };
    }

    return { kind: "unlinked" };
  }

  const pendingLink = await getPendingLinkByActivationCode(context, activationCode);

  if (!pendingLink) {
    return {
      activationCode,
      kind: "invalid_activation_code",
    };
  }

  if (isPendingLinkExpired(pendingLink)) {
    await expireLinkById(context, pendingLink.id);
    return {
      activationCode,
      kind: "expired_activation_code",
      linkId: pendingLink.id,
      userId: pendingLink.user_id,
    };
  }

  await revokeExistingPhoneLink(context, normalizedRemoteNumber, pendingLink.user_id);

  const { data, error } = await context.supabase
    .from("whatsapp_assistant_links")
    .update({
      activation_code: null,
      activation_expires_at: null,
      last_inbound_at: new Date().toISOString(),
      linked_at: new Date().toISOString(),
      phone_number: normalizedRemoteNumber,
      remote_jid: remoteJid ?? null,
      status: "linked",
    })
    .eq("id", pendingLink.id)
    .select("id, user_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    kind: "activated",
    linkId: data.id,
    userId: data.user_id,
  };
}

export function extractWhatsAppActivationCode(messageText?: string | null) {
  const normalized = messageText?.toUpperCase().replace(/\s+/g, " ").trim() ?? "";
  const match = normalized.match(/\bFM-[A-Z0-9]{6}\b/);

  return match?.[0] ?? null;
}

function linkToSnapshot(link: WhatsAppAssistantLink | null): WhatsAppAssistantActivationSnapshot {
  return {
    activationCode: link?.activation_code ?? null,
    activationExpiresAt: link?.activation_expires_at ?? null,
    assistantNumber: getWhatsAppAssistantNumber(),
    linkedAt: link?.linked_at ?? null,
    phoneNumber: link?.phone_number ?? null,
    status: link?.status ?? "not_activated",
  };
}

async function getLinkByUserId(context: WhatsAppActivationContext) {
  const { data, error } = await context.supabase
    .from("whatsapp_assistant_links")
    .select("*")
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getLinkedLinkByPhone(context: WhatsAppWebhookActivationContext, phoneNumber: string) {
  const { data, error } = await context.supabase
    .from("whatsapp_assistant_links")
    .select("id, user_id")
    .eq("phone_number", phoneNumber)
    .eq("status", "linked")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getPendingLinkByActivationCode(context: WhatsAppWebhookActivationContext, activationCode: string) {
  const { data, error } = await context.supabase
    .from("whatsapp_assistant_links")
    .select("*")
    .eq("activation_code", activationCode)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function createUniqueActivationCode(supabase: SupabaseClient<Database>) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const activationCode = `${activationCodePrefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const { data, error } = await supabase
      .from("whatsapp_assistant_links")
      .select("id")
      .eq("activation_code", activationCode)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return activationCode;
    }
  }

  throw new Error("Nao consegui gerar um codigo unico de ativacao do WhatsApp.");
}

async function updateLinkStatus(
  context: WhatsAppActivationContext,
  patch: {
    activationCode?: string | null;
    activationExpiresAt?: string | null;
    linkedAt?: string | null;
    phoneNumber?: string | null;
    remoteJid?: string | null;
    status: Exclude<WhatsAppAssistantActivationStatus, "not_activated">;
  },
) {
  const { data, error } = await context.supabase
    .from("whatsapp_assistant_links")
    .update({
      activation_code: patch.activationCode ?? null,
      activation_expires_at: patch.activationExpiresAt ?? null,
      linked_at: patch.linkedAt ?? null,
      phone_number: patch.phoneNumber ?? null,
      remote_jid: patch.remoteJid ?? null,
      status: patch.status,
    })
    .eq("user_id", context.userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function expireLinkById(context: WhatsAppWebhookActivationContext, linkId: string) {
  const { error } = await context.supabase
    .from("whatsapp_assistant_links")
    .update({
      activation_code: null,
      activation_expires_at: null,
      status: "expired",
    })
    .eq("id", linkId);

  if (error) {
    throw new Error(error.message);
  }
}

async function touchLinkedInbound(context: WhatsAppWebhookActivationContext, linkId: string) {
  const { error } = await context.supabase
    .from("whatsapp_assistant_links")
    .update({
      last_inbound_at: new Date().toISOString(),
    })
    .eq("id", linkId);

  if (error) {
    console.error("WhatsApp assistant link last inbound timestamp could not be updated.", error);
  }
}

async function revokeExistingPhoneLink(
  context: WhatsAppWebhookActivationContext,
  phoneNumber: string,
  nextUserId: string,
) {
  const { error } = await context.supabase
    .from("whatsapp_assistant_links")
    .update({
      activation_code: null,
      activation_expires_at: null,
      linked_at: null,
      phone_number: null,
      remote_jid: null,
      status: "revoked",
    })
    .eq("phone_number", phoneNumber)
    .eq("status", "linked")
    .neq("user_id", nextUserId);

  if (error) {
    throw new Error(error.message);
  }
}

function isPendingLinkExpired(link: WhatsAppAssistantLink) {
  return (
    link.status === "pending" &&
    Boolean(link.activation_expires_at) &&
    new Date(link.activation_expires_at!).getTime() <= Date.now()
  );
}

function normalizePhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? digits : null;
}
