export type WhatsAppInboundEventStatus = "received" | "processed" | "discarded" | "failed";

export type WhatsAppAudioMessage = {
  base64?: string | null;
  downloadPayload?: Record<string, unknown> | null;
  externalMessageId: string;
  mimeType?: string | null;
  remoteJid: string;
  seconds?: number | null;
  sizeBytes?: number | null;
};

export type WhatsAppNormalizedInboundMessage = {
  audio?: WhatsAppAudioMessage | null;
  event: string | null;
  externalMessageId: string | null;
  instance: string | null;
  isFromMe: boolean;
  messageType: string | null;
  remoteJid: string | null;
  text: string | null;
};

export type WhatsAppChannelConfig = {
  allowedRemoteNumber: string;
  enabled: boolean;
  evolutionApiKey: string;
  evolutionApiUrl: string;
  instanceName: string;
  maxReplyLength: number;
  testUserId: string;
};

export type WhatsAppInboundEventRecord = {
  conversationId?: string | null;
  error?: string | null;
  externalMessageId: string;
  instance?: string | null;
  messageText?: string | null;
  remoteId?: string | null;
  status: WhatsAppInboundEventStatus;
  summary?: string | null;
  userId?: string | null;
};
