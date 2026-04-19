import type {
  WhatsAppAudioMessage,
  WhatsAppChannelConfig,
  WhatsAppNormalizedInboundMessage,
} from "@/lib/channels/whatsapp/types";
import { getWhatsAppAssistantNumber } from "@/lib/channels/whatsapp/activation";

const defaultMaxReplyLength = 900;
const evolutionProvider = "evolution";

export class WhatsAppChannelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppChannelConfigError";
  }
}

export function getWhatsAppChannelConfig(): WhatsAppChannelConfig {
  const enabled = process.env.WHATSAPP_CHANNEL_ENABLED?.trim() === "true";
  const issues: string[] = [];

  const evolutionApiUrl = process.env.EVOLUTION_API_BASE_URL?.trim();
  const evolutionApiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instanceName = process.env.EVOLUTION_API_INSTANCE?.trim();
  const assistantNumber = getWhatsAppAssistantNumber();

  if (!enabled) {
    return {
      assistantNumber,
      enabled: false,
      evolutionApiKey: evolutionApiKey ?? "",
      evolutionApiUrl: evolutionApiUrl ?? "",
      instanceName: instanceName ?? "",
      maxReplyLength: defaultMaxReplyLength,
    };
  }

  if (!evolutionApiUrl) {
    issues.push("faltando EVOLUTION_API_BASE_URL");
  }

  if (!evolutionApiKey) {
    issues.push("faltando EVOLUTION_API_KEY");
  }

  if (!instanceName) {
    issues.push("faltando EVOLUTION_API_INSTANCE");
  }

  if (issues.length > 0) {
    throw new WhatsAppChannelConfigError(
      process.env.NODE_ENV === "production"
        ? "O canal local do WhatsApp não está configurado."
        : `Canal local do WhatsApp não pôde ser inicializado: ${issues.join("; ")}.`,
    );
  }

  const maxReplyLength = Number.parseInt(process.env.WHATSAPP_MAX_REPLY_LENGTH?.trim() ?? "", 10);
  const configuredEvolutionApiKey = evolutionApiKey!;
  const configuredEvolutionApiUrl = evolutionApiUrl!.replace(/\/$/, "");
  const configuredInstanceName = instanceName!;

  return {
    assistantNumber,
    enabled: true,
    evolutionApiKey: configuredEvolutionApiKey,
    evolutionApiUrl: configuredEvolutionApiUrl,
    instanceName: configuredInstanceName,
    maxReplyLength: Number.isFinite(maxReplyLength) && maxReplyLength >= 280 ? maxReplyLength : defaultMaxReplyLength,
  };
}

export function normalizeEvolutionWebhookPayload(payload: unknown): WhatsAppNormalizedInboundMessage {
  const root = asRecord(payload);
  const rawData = asRecord(root?.data) ?? root;
  const rawKey = asRecord(rawData?.key);
  const rawMessage = asRecord(rawData?.message);
  const externalMessageId = asString(rawKey?.id) ?? null;
  const messageType = asString(rawData?.messageType) ?? inferMessageType(rawMessage);
  const remoteJid =
    asString(rawKey?.remoteJid) ??
    asString(root?.sender) ??
    asString(rawData?.remoteJid) ??
    null;

  return {
    audio: extractInboundAudio({
      externalMessageId,
      messageType,
      rawData,
      rawKey,
      rawMessage,
      remoteJid,
    }),
    event: asString(root?.event)?.toLowerCase() ?? null,
    externalMessageId,
    instance:
      asString(root?.instance) ??
      asString(rawData?.instance) ??
      asString(rawData?.instanceName) ??
      null,
    isFromMe: rawKey?.fromMe === true,
    messageType,
    remoteJid,
    text: extractInboundText(rawMessage),
  };
}

export async function sendWhatsAppTextReply({
  config,
  remoteNumber,
  reply,
}: {
  config: WhatsAppChannelConfig;
  remoteNumber: string;
  reply: string;
}) {
  const chunks = splitReplyForWhatsApp(reply, config.maxReplyLength);

  for (const chunk of chunks) {
    const response = await fetch(`${config.evolutionApiUrl}/message/sendText/${config.instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.evolutionApiKey,
      },
      body: JSON.stringify({
        number: remoteNumber,
        text: chunk,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await safeReadText(response);
      throw new Error(`Evolution sendText falhou com status ${response.status}: ${errorText}`);
    }
  }
}

export async function sendWhatsAppTypingIndicator({
  config,
  delayMs = 3000,
  remoteNumber,
}: {
  config: WhatsAppChannelConfig;
  delayMs?: number;
  remoteNumber: string;
}) {
  const response = await fetch(`${config.evolutionApiUrl}/chat/sendPresence/${config.instanceName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.evolutionApiKey,
    },
    body: JSON.stringify({
      delay: delayMs,
      number: remoteNumber,
      presence: "composing",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(`Evolution sendPresence falhou com status ${response.status}: ${errorText}`);
  }
}

export async function markWhatsAppMessageAsRead({
  config,
  externalMessageId,
  remoteJid,
}: {
  config: WhatsAppChannelConfig;
  externalMessageId: string;
  remoteJid: string;
}) {
  const response = await fetch(`${config.evolutionApiUrl}/chat/markMessageAsRead/${config.instanceName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.evolutionApiKey,
    },
    body: JSON.stringify({
      readMessages: [
        {
          fromMe: false,
          id: externalMessageId,
          remoteJid,
        },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(`Evolution markMessageAsRead falhou com status ${response.status}: ${errorText}`);
  }
}

export function normalizePhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? digits : null;
}

export function getRemoteNumberFromJid(remoteJid: string | null | undefined) {
  if (!remoteJid) {
    return null;
  }

  return normalizePhoneNumber(remoteJid.split("@")[0] ?? remoteJid);
}

export function isGroupJid(remoteJid: string | null | undefined) {
  return typeof remoteJid === "string" && remoteJid.endsWith("@g.us");
}

export function getEvolutionProviderName() {
  return evolutionProvider;
}

function extractInboundText(message: Record<string, unknown> | null) {
  if (!message) {
    return null;
  }

  const conversation = asString(message.conversation);

  if (conversation) {
    return conversation.trim();
  }

  const extendedTextMessage = asRecord(message.extendedTextMessage);
  const extendedText = asString(extendedTextMessage?.text);

  if (extendedText) {
    return extendedText.trim();
  }

  return null;
}

function inferMessageType(message: Record<string, unknown> | null) {
  if (!message) {
    return null;
  }

  if (typeof message.conversation === "string") {
    return "conversation";
  }

  if (typeof asRecord(message.extendedTextMessage)?.text === "string") {
    return "extendedTextMessage";
  }

  if (asRecord(message.audioMessage)) {
    return "audioMessage";
  }

  const keys = Object.keys(message);
  return keys.length > 0 ? keys[0] : null;
}

function extractInboundAudio({
  externalMessageId,
  messageType,
  rawData,
  rawKey,
  rawMessage,
  remoteJid,
}: {
  externalMessageId: string | null;
  messageType: string | null;
  rawData: Record<string, unknown> | null;
  rawKey: Record<string, unknown> | null;
  rawMessage: Record<string, unknown> | null;
  remoteJid: string | null;
}): WhatsAppAudioMessage | null {
  const audioMessage = asRecord(rawMessage?.audioMessage);
  const isAudio = messageType === "audioMessage" || Boolean(audioMessage);

  if (!isAudio || !externalMessageId || !remoteJid) {
    return null;
  }

  return {
    base64:
      asString(rawData?.base64) ??
      asString(rawData?.mediaBase64) ??
      asString(audioMessage?.base64) ??
      null,
    downloadPayload: {
      key: rawKey ?? { fromMe: false, id: externalMessageId, remoteJid },
      message: rawMessage ?? undefined,
      messageType: messageType ?? "audioMessage",
    },
    externalMessageId,
    mimeType:
      asString(audioMessage?.mimetype) ??
      asString(audioMessage?.mimeType) ??
      asString(rawData?.mimeType) ??
      asString(rawData?.mimetype) ??
      null,
    remoteJid,
    seconds:
      asNumber(audioMessage?.seconds) ??
      asNumber(audioMessage?.duration) ??
      asNumber(rawData?.seconds) ??
      asNumber(rawData?.duration) ??
      null,
    sizeBytes:
      asNumber(audioMessage?.fileLength) ??
      asNumber(rawData?.fileLength) ??
      asNumber(rawData?.size) ??
      null,
  };
}

function splitReplyForWhatsApp(text: string, maxLength: number) {
  const normalized = text.trim();

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }

    chunks.push(...splitByWords(paragraph, maxLength));
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : splitByWords(normalized, maxLength);
}

function splitByWords(text: string, maxLength: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : null;
  }

  return null;
}

async function safeReadText(response: Response) {
  try {
    return (await response.text()).slice(0, 240);
  } catch {
    return "sem resposta textual";
  }
}
