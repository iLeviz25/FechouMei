import { resolveImportFileKind } from "@/lib/import/process-file";
import type { WhatsAppAudioMessage, WhatsAppChannelConfig, WhatsAppDocumentMessage } from "./types";

const maxAudioDurationSeconds = 120;
const maxAudioSizeBytes = 8 * 1024 * 1024;
const maxDocumentSizeBytes = 5 * 1024 * 1024;
const defaultAudioMediaDownloadTimeoutMs = 8000;
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

export class WhatsAppUnsupportedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppUnsupportedDocumentError";
  }
}

export type DownloadedWhatsAppAudio = {
  buffer: Buffer;
  mimeType: string;
};

export type DownloadedWhatsAppDocument = {
  buffer: Buffer;
  fileName: string;
  fileType: "csv" | "xlsx";
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
    signal: AbortSignal.timeout(getAudioMediaDownloadTimeoutMs()),
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

export async function downloadWhatsAppDocument({
  config,
  document,
}: {
  config: WhatsAppChannelConfig;
  document: WhatsAppDocumentMessage;
}): Promise<DownloadedWhatsAppDocument> {
  validateWhatsAppDocument(document);

  if (document.base64) {
    const buffer = decodeBase64Media(document.base64, "Arquivo vazio recebido da Evolution.");
    validateDownloadedDocumentSize(buffer);

    return {
      buffer,
      fileName: getSafeDocumentFileName(document.fileName),
      fileType: resolveDocumentKind(document),
      mimeType: normalizeDocumentMimeType(document.mimeType),
    };
  }

  const response = await fetch(`${config.evolutionApiUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`, {
    body: JSON.stringify({
      convertToMp4: false,
      message: document.downloadPayload,
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
    throw new WhatsAppMediaDownloadError(`Falha ao baixar arquivo da Evolution: ${response.status} ${errorText}`);
  }

  const payload = await safeReadJson(response);
  const base64 = findBase64Payload(payload);

  if (!base64) {
    throw new WhatsAppMediaDownloadError("Evolution nao retornou base64 do arquivo.");
  }

  const downloadedMimeType = findMimeTypePayload(payload);
  const buffer = decodeBase64Media(base64, "Arquivo vazio recebido da Evolution.");
  validateDownloadedDocumentSize(buffer);

  return {
    buffer,
    fileName: getSafeDocumentFileName(document.fileName),
    fileType: resolveDocumentKind({
      ...document,
      mimeType: document.mimeType ?? downloadedMimeType,
    }),
    mimeType: normalizeDocumentMimeType(document.mimeType ?? downloadedMimeType),
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
  const buffer = decodeBase64Media(value, "Audio vazio recebido da Evolution.");

  return buffer;
}

function decodeBase64Media(value: string, emptyMessage: string) {
  const base64 = value.includes(",") ? value.split(",").at(-1) : value;
  const buffer = Buffer.from(base64 ?? "", "base64");

  if (buffer.length === 0) {
    throw new WhatsAppMediaDownloadError(emptyMessage);
  }

  return buffer;
}

function validateDownloadedAudioSize(buffer: Buffer) {
  if (buffer.length > maxAudioSizeBytes) {
    throw new WhatsAppUnsupportedAudioError(`Audio baixado acima do limite de ${maxAudioSizeBytes} bytes.`);
  }
}

function getAudioMediaDownloadTimeoutMs() {
  const configuredTimeout = Number.parseInt(
    process.env.WHATSAPP_AUDIO_DOWNLOAD_TIMEOUT_MS?.trim() ??
      process.env.WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS?.trim() ??
      "",
    10,
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout >= 3000
    ? configuredTimeout
    : defaultAudioMediaDownloadTimeoutMs;
}

function validateWhatsAppDocument(document: WhatsAppDocumentMessage) {
  if (typeof document.sizeBytes === "number" && document.sizeBytes > maxDocumentSizeBytes) {
    throw new WhatsAppUnsupportedDocumentError(`Arquivo acima do limite de ${maxDocumentSizeBytes} bytes.`);
  }

  resolveDocumentKind(document);
}

function validateDownloadedDocumentSize(buffer: Buffer) {
  if (buffer.length > maxDocumentSizeBytes) {
    throw new WhatsAppUnsupportedDocumentError(`Arquivo baixado acima do limite de ${maxDocumentSizeBytes} bytes.`);
  }
}

function resolveDocumentKind(document: Pick<WhatsAppDocumentMessage, "fileName" | "mimeType">) {
  try {
    return resolveImportFileKind({
      fileName: document.fileName,
      fileType: document.mimeType,
    });
  } catch {
    throw new WhatsAppUnsupportedDocumentError("Formato de arquivo nao suportado.");
  }
}

function normalizeAudioMimeType(value?: string | null) {
  const normalized = parseAudioMimeType(value);
  return normalized && supportedAudioMimeTypes.has(normalized) ? normalized : "audio/ogg";
}

function normalizeDocumentMimeType(value?: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function getSafeDocumentFileName(value?: string | null) {
  const normalized = value?.trim().replace(/[\\/:*?"<>|]+/g, "-");
  return normalized && normalized.length <= 180 ? normalized : "planilha-whatsapp";
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
