import type { WhatsAppAudioMessage, WhatsAppChannelConfig } from "./types";

const maxAudioDurationSeconds = 120;
const maxAudioSizeBytes = 8 * 1024 * 1024;
const mediaDownloadTimeoutMs = 15000;
const supportedAudioMimeTypes = new Set([
  "audio/aac",
  "audio/amr",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
]);

export class WhatsAppMediaDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppMediaDownloadError";
  }
}

export class WhatsAppUnsupportedAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppUnsupportedAudioError";
  }
}

export type DownloadedWhatsAppAudio = {
  buffer: Buffer;
  mimeType: string;
};

export async function downloadWhatsAppAudio({
  audio,
  config,
}: {
  audio: WhatsAppAudioMessage;
  config: WhatsAppChannelConfig;
}): Promise<DownloadedWhatsAppAudio> {
  validateWhatsAppAudio(audio);

  if (audio.base64) {
    const buffer = decodeBase64Audio(audio.base64);
    validateDownloadedAudioSize(buffer);

    return {
      buffer,
      mimeType: normalizeAudioMimeType(audio.mimeType),
    };
  }

  const response = await fetch(`${config.evolutionApiUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`, {
    body: JSON.stringify({
      convertToMp4: false,
      message: audio.downloadPayload,
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      apikey: config.evolutionApiKey,
    },
    method: "POST",
    signal: AbortSignal.timeout(mediaDownloadTimeoutMs),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new WhatsAppMediaDownloadError(`Falha ao baixar audio da Evolution: ${response.status} ${errorText}`);
  }

  const payload = await safeReadJson(response);
  const base64 = findBase64Payload(payload);

  if (!base64) {
    throw new WhatsAppMediaDownloadError("Evolution nao retornou base64 do audio.");
  }

  const buffer = decodeBase64Audio(base64);
  validateDownloadedAudioSize(buffer);

  return {
    buffer,
    mimeType: normalizeAudioMimeType(audio.mimeType ?? findMimeTypePayload(payload)),
  };
}

export function validateWhatsAppAudio(audio: WhatsAppAudioMessage) {
  const normalizedMimeType = audio.mimeType ? parseAudioMimeType(audio.mimeType) : null;

  if (normalizedMimeType && !supportedAudioMimeTypes.has(normalizedMimeType)) {
    throw new WhatsAppUnsupportedAudioError(`Mime type de audio nao suportado: ${normalizedMimeType}`);
  }

  if (typeof audio.seconds === "number" && audio.seconds > maxAudioDurationSeconds) {
    throw new WhatsAppUnsupportedAudioError(`Audio acima do limite de ${maxAudioDurationSeconds}s.`);
  }

  if (typeof audio.sizeBytes === "number" && audio.sizeBytes > maxAudioSizeBytes) {
    throw new WhatsAppUnsupportedAudioError(`Audio acima do limite de ${maxAudioSizeBytes} bytes.`);
  }
}

function decodeBase64Audio(value: string) {
  const base64 = value.includes(",") ? value.split(",").at(-1) : value;
  const buffer = Buffer.from(base64 ?? "", "base64");

  if (buffer.length === 0) {
    throw new WhatsAppMediaDownloadError("Audio vazio recebido da Evolution.");
  }

  return buffer;
}

function validateDownloadedAudioSize(buffer: Buffer) {
  if (buffer.length > maxAudioSizeBytes) {
    throw new WhatsAppUnsupportedAudioError(`Audio baixado acima do limite de ${maxAudioSizeBytes} bytes.`);
  }
}

function normalizeAudioMimeType(value?: string | null) {
  const normalized = parseAudioMimeType(value);
  return normalized && supportedAudioMimeTypes.has(normalized) ? normalized : "audio/ogg";
}

function parseAudioMimeType(value?: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? null;
}

function findBase64Payload(payload: unknown): string | null {
  const record = asRecord(payload);
  const data = asRecord(record?.data);

  return (
    asString(record?.base64) ??
    asString(record?.base64Message) ??
    asString(record?.mediaBase64) ??
    asString(data?.base64) ??
    asString(data?.base64Message) ??
    asString(data?.mediaBase64) ??
    null
  );
}

function findMimeTypePayload(payload: unknown) {
  const record = asRecord(payload);
  const data = asRecord(record?.data);

  return (
    asString(record?.mimetype) ??
    asString(record?.mimeType) ??
    asString(data?.mimetype) ??
    asString(data?.mimeType) ??
    null
  );
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

async function safeReadJson(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    throw new WhatsAppMediaDownloadError(`Resposta invalida da Evolution: ${error instanceof Error ? error.message : "erro inesperado"}`);
  }
}

async function safeReadText(response: Response) {
  try {
    return (await response.text()).slice(0, 240);
  } catch {
    return "sem resposta textual";
  }
}
