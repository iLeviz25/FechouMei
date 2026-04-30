import { runAgentTurnForContext } from "@/lib/agent/orchestrator";
import { getAgentRuntimeSettings } from "@/lib/agent/runtime-settings";
import {
  AudioTranscriptionError,
  type AudioTranscriptionStage,
  type AudioTranscriptionStageEvent,
  transcribeAudioWithGemini,
} from "@/lib/agent/transcription";
import {
  AgentPersistenceSetupError,
  loadAgentConversationSnapshot,
  persistAgentTurn,
} from "@/lib/agent/persistence";
import { agentTurnQueueBusyReply, runQueuedAgentTurn } from "@/lib/agent/turn-queue";
import type { AgentConversationState } from "@/lib/agent/types";
import {
  WhatsAppMediaDownloadError,
  WhatsAppUnsupportedAudioError,
  WhatsAppUnsupportedDocumentError,
  downloadWhatsAppDocument,
  downloadWhatsAppAudio,
} from "@/lib/channels/whatsapp/media";
import {
  createInboundWhatsAppEvent,
  updateInboundWhatsAppEvent,
} from "@/lib/channels/whatsapp/persistence";
import { resolveWhatsAppInboundUser } from "@/lib/channels/whatsapp/activation";
import {
  WhatsAppChannelConfigError,
  getRemoteNumberFromJid,
  getWhatsAppChannelConfig,
  getEvolutionProviderName,
  isGroupJid,
  markWhatsAppMessageAsRead,
  normalizeEvolutionWebhookPayload,
  sendWhatsAppDocument,
  sendWhatsAppTypingIndicator,
  sendWhatsAppTextReply,
} from "@/lib/channels/whatsapp/evolution";
import {
  buildTransactionCsvPeriod,
  getTransactionCsvExport,
  withCsvBom,
} from "@/lib/export/transactions-csv";
import { buildAppUrl } from "@/lib/app-url";
import {
  cancelWhatsAppImportSession,
  confirmWhatsAppImportSession,
  createImportReviewSessionFromFile,
  findLatestWhatsAppImportSession,
} from "@/lib/import/sessions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  consumeHelenaDailyMessage,
  getSubscriptionBlockedReply,
  getUserSubscriptionAccess,
  helenaProFeatureReply,
} from "@/lib/subscription/access";

const genericFallbackReply = "Tive uma instabilidade agora para processar isso. Tente novamente em instantes.";
const audioFallbackReply = "Tive uma instabilidade para entender esse audio agora. Pode repetir o audio ou me mandar em texto?";
const audioTranscriptionCooldownMs = 45000;
const whatsappTypingPresenceDelayMs = 4000;
const whatsappTypingKeepaliveIntervalMs = 2500;
const whatsappTypingKeepaliveMaxMs = 28000;
const globalAudioTranscriptionCooldownKey = "global";
const audioTranscriptionCooldowns = new Map<string, number>();
const audioTranscriptionQueues = new Map<string, Promise<unknown>>();

type WhatsAppImportIntent = "cancel" | "confirm" | "request_file";

type WhatsAppAudioPipelineStage =
  | "inbound_received"
  | "audio_detected"
  | "audio_cooldown_wait_started"
  | "audio_cooldown_wait_finished"
  | "media_download_started"
  | "media_download_failed"
  | "media_decoded"
  | AudioTranscriptionStage
  | "transcript_parse_started"
  | "transcript_parse_failed"
  | "agent_turn_started"
  | "agent_turn_finished";

type WhatsAppLatencyStage =
  | "webhook_received"
  | AudioTranscriptionStage
  | "typing_indicator_dispatch_started"
  | "typing_indicator_request_started"
  | "typing_indicator_response_received"
  | "typing_indicator_dispatch_finished"
  | "typing_indicator_failed"
  | "typing_keepalive_started"
  | "typing_keepalive_tick"
  | "typing_keepalive_stopped"
  | "read_receipt_sent"
  | "read_receipt_failed"
  | "media_download_started"
  | "media_download_finished"
  | "transcription_started"
  | "transcription_finished"
  | "audio_fallback_response_started"
  | "audio_fallback_response_finished"
  | "audio_error_handled_without_rethrow"
  | "total_audio_pipeline_elapsed_ms"
  | "parse_started"
  | "parse_finished"
  | "orchestration_started"
  | "orchestration_finished"
  | "action_execution_started"
  | "action_execution_finished"
  | "response_build_started"
  | "response_build_finished"
  | "response_send_started"
  | "response_send_finished"
  | "provider_send_request_started"
  | "provider_send_request_finished"
  | "total_elapsed_ms";

type WhatsAppLatencyTrace = ReturnType<typeof createWhatsAppLatencyTrace>;
type WhatsAppPresenceController = ReturnType<typeof startWhatsAppPresenceKeepalive>;

function createWhatsAppLatencyTrace({
  externalMessageId,
  messageType,
  remoteId,
}: {
  externalMessageId: string;
  messageType?: string | null;
  remoteId?: string | null;
}) {
  const startedAt = Date.now();
  let lastMarkAt = startedAt;

  const mark = (stage: WhatsAppLatencyStage, metadata?: Record<string, unknown>) => {
    const now = Date.now();
    const elapsedMs = now - startedAt;
    const deltaMs = now - lastMarkAt;
    lastMarkAt = now;

    console.info("[FECHOUMEI_WHATSAPP_LATENCY]", {
      deltaMs,
      elapsedMs,
      externalMessageId,
      messageType,
      provider: getEvolutionProviderName(),
      remoteId,
      stage,
      ...(metadata ?? {}),
    });
  };

  return {
    finish: (status: string, metadata?: Record<string, unknown>) => {
      mark("total_elapsed_ms", {
        status,
        totalElapsedMs: Date.now() - startedAt,
        ...(metadata ?? {}),
      });
    },
    mark,
  };
}

function startWhatsAppPresenceKeepalive({
  config,
  externalMessageId,
  normalized,
  remoteNumber,
  trace,
}: {
  config: ReturnType<typeof getWhatsAppChannelConfig>;
  externalMessageId: string;
  normalized: ReturnType<typeof normalizeEvolutionWebhookPayload>;
  remoteNumber: string;
  trace: WhatsAppLatencyTrace;
}) {
  let stopped = false;
  let consecutiveFailures = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;

  const stop = (reason: string) => {
    if (stopped) {
      return;
    }

    stopped = true;
    if (interval) {
      clearInterval(interval);
    }

    if (maxDurationTimeout) {
      clearTimeout(maxDurationTimeout);
    }

    trace.mark("typing_keepalive_stopped", {
      reason,
    });
  };

  const dispatchTyping = (reason: "initial" | "keepalive") => {
    if (stopped) {
      return;
    }
    trace.mark("typing_indicator_dispatch_started", {
      reason,
    });

    void (async () => {
      try {
        trace.mark("typing_indicator_request_started", {
          delayMs: whatsappTypingPresenceDelayMs,
          reason,
        });

        await sendWhatsAppTypingIndicator({
          config,
          delayMs: whatsappTypingPresenceDelayMs,
          remoteNumber,
        });

        consecutiveFailures = 0;
        trace.mark("typing_indicator_response_received", {
          reason,
        });
      } catch (error) {
        consecutiveFailures += 1;
        trace.mark("typing_indicator_failed", {
          error: summarizeError(error),
          failures: consecutiveFailures,
          reason,
        });
        console.warn("[FECHOUMEI_WHATSAPP_TYPING_WARNING]", {
          error: summarizeError(error),
          externalMessageId,
          failures: consecutiveFailures,
          provider: getEvolutionProviderName(),
          reason,
        });

        if (consecutiveFailures >= 3) {
          stop("typing_failed_repeatedly");
        }
      } finally {
        trace.mark("typing_indicator_dispatch_finished", {
          reason,
        });
      }
    })();
  };

  trace.mark("typing_keepalive_started", {
    intervalMs: whatsappTypingKeepaliveIntervalMs,
    maxMs: whatsappTypingKeepaliveMaxMs,
  });

  dispatchTyping("initial");

  interval = setInterval(() => {
    trace.mark("typing_keepalive_tick");
    dispatchTyping("keepalive");
  }, whatsappTypingKeepaliveIntervalMs);

  maxDurationTimeout = setTimeout(() => {
    stop("max_duration");
  }, whatsappTypingKeepaliveMaxMs);

  if (!normalized.remoteJid) {
    return { stop };
  }

  void markWhatsAppMessageAsRead({
    config,
    externalMessageId,
    remoteJid: normalized.remoteJid,
  }).then(() => {
    trace.mark("read_receipt_sent");
  }).catch((error) => {
    trace.mark("read_receipt_failed", {
      error: summarizeError(error),
    });
    console.warn("[FECHOUMEI_WHATSAPP_READ_WARNING]", {
      error: summarizeError(error),
      externalMessageId,
      provider: getEvolutionProviderName(),
    });
  });

  return { stop };
}

export async function handleEvolutionWhatsAppWebhook(payload: unknown) {
  const config = getWhatsAppChannelConfig();

  if (!config.enabled) {
    return {
      body: { ok: false, reason: "whatsapp_channel_disabled" },
      status: 404,
    };
  }

  const normalized = normalizeEvolutionWebhookPayload(payload);

  if (!normalized.externalMessageId) {
    console.error("WhatsApp webhook ignored because it did not provide a message id.", payload);
    return {
      body: { ok: true, reason: "missing_message_id" },
      status: 200,
    };
  }

  const externalMessageId = normalized.externalMessageId;
  const remoteNumber = getRemoteNumberFromJid(normalized.remoteJid);
  const trace = createWhatsAppLatencyTrace({
    externalMessageId,
    messageType: normalized.messageType,
    remoteId: normalized.remoteJid,
  });

  trace.mark("webhook_received", {
    event: normalized.event,
    hasAudio: Boolean(normalized.audio),
    hasDocument: Boolean(normalized.document),
  });

  let presenceController: WhatsAppPresenceController | null = null;

  const admin = createServiceRoleClient();
  let resolvedUserId: string | null = null;

  const createdEvent = await createInboundWhatsAppEvent(
    { supabase: admin },
    {
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      remoteId: normalized.remoteJid,
      status: "received",
      summary: getInboundReceivedSummary(normalized),
      userId: null,
    },
  );

  if (createdEvent.duplicate) {
    trace.finish("duplicate", {
      reason: "duplicate_event",
    });

    return {
      body: { ok: true, reason: "duplicate_event" },
      status: 200,
    };
  }

  const discard = async (reason: string, summary: string) => {
    presenceController?.stop(reason);
    await safeUpdateInboundEvent({
      error: null,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      remoteId: normalized.remoteJid,
      status: "discarded",
      summary: `${summary} (${reason}).`,
      userId: resolvedUserId,
    });

    trace.finish("discarded", {
      reason,
    });

    return {
      body: { ok: true, reason },
      status: 200,
    };
  };

  if (normalized.event && normalized.event !== "messages.upsert") {
    return discard("unsupported_event", "Evento descartado fora do escopo inicial do canal");
  }

  if (normalized.instance && normalized.instance !== config.instanceName) {
    return discard("unexpected_instance", "Evento descartado de instância diferente da configurada");
  }

  if (normalized.isFromMe) {
    return discard("from_me", "Mensagem outbound ignorada para não responder a si mesma");
  }

  if (isGroupJid(normalized.remoteJid)) {
    return discard("group_message", "Mensagem de grupo ignorada no modo local");
  }

  if (!remoteNumber) {
    return discard("missing_remote_number", "Mensagem ignorada sem remetente identificável");
  }

  const runtimeSettings = await getAgentRuntimeSettings(admin);

  if (runtimeSettings.maintenanceMode || !runtimeSettings.helenaEnabled || !runtimeSettings.whatsappEnabled) {
    const reason = runtimeSettings.maintenanceMode
      ? "agent_maintenance"
      : !runtimeSettings.helenaEnabled
        ? "agent_disabled"
        : "whatsapp_disabled";
    const reply = runtimeSettings.maintenanceMode
      ? "A Helena esta em manutencao rapida agora. Tente novamente em instantes."
      : !runtimeSettings.helenaEnabled
        ? "A Helena esta temporariamente indisponivel. Tente novamente em instantes."
        : "O canal WhatsApp da Helena esta temporariamente indisponivel. Voce ainda pode usar a Helena dentro do app.";

    await replyAndFinishWhatsAppTurn({
      config,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      presenceController,
      reason,
      remoteId: normalized.remoteJid,
      remoteNumber,
      reply,
      status: "discarded",
      summary: `WhatsApp bloqueado por configuracao admin: ${reason}.`,
      trace,
      userId: null,
    });

    return {
      body: { ok: true, reason },
      status: 200,
    };
  }

  const userResolution = await resolveWhatsAppInboundUser({
    context: { supabase: admin },
    messageText: normalized.text,
    remoteJid: normalized.remoteJid,
    remoteNumber,
  });

  if (userResolution.kind === "activated") {
    resolvedUserId = userResolution.userId;
    presenceController = startWhatsAppPresenceKeepalive({
      config,
      externalMessageId,
      normalized,
      remoteNumber,
      trace,
    });
    await replyAndFinishWhatsAppTurn({
      config,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      presenceController,
      reason: "whatsapp_activated",
      remoteId: normalized.remoteJid,
      remoteNumber,
      reply: "Pronto, seu WhatsApp foi vinculado ao FechouMEI. Eu sou a Helena; agora você já pode falar comigo por aqui.",
      status: "processed",
      summary: "WhatsApp vinculado por codigo de ativacao.",
      trace,
      userId: resolvedUserId,
    });

    return {
      body: { ok: true, status: "activated" },
      status: 200,
    };
  }

  if (userResolution.kind === "expired_activation_code") {
    resolvedUserId = userResolution.userId;
    return discard("expired_activation_code", "Codigo de ativacao expirado; mensagem ignorada sem resposta");
  }

  if (userResolution.kind === "invalid_activation_code") {
    return discard("invalid_activation_code", "Codigo de ativacao invalido; mensagem ignorada sem resposta");
  }

  if (userResolution.kind === "unlinked") {
    return discard("whatsapp_not_linked", "Mensagem recebida de numero nao vinculado; ignorada sem resposta");
  }

  resolvedUserId = userResolution.userId;
  presenceController = startWhatsAppPresenceKeepalive({
    config,
    externalMessageId,
    normalized,
    remoteNumber,
    trace,
  });

  const subscriptionAccess = await getUserSubscriptionAccess({
    supabase: admin,
    userId: resolvedUserId,
  });

  if (!subscriptionAccess.canAccessApp) {
    const reason = `subscription_${subscriptionAccess.status}`;
    await replyAndFinishWhatsAppTurn({
      config,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      presenceController,
      reason,
      remoteId: normalized.remoteJid,
      remoteNumber,
      reply: getSubscriptionBlockedReply(subscriptionAccess.status),
      status: "discarded",
      summary: `WhatsApp bloqueado por assinatura: ${subscriptionAccess.status}.`,
      trace,
      userId: resolvedUserId,
    });

    return {
      body: { ok: true, reason },
      status: 200,
    };
  }

  const usage = await consumeHelenaDailyMessage({
    supabase: admin,
    userId: resolvedUserId,
  });

  if (!usage.allowed) {
    await replyAndFinishWhatsAppTurn({
      config,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      presenceController,
      reason: usage.reason === "daily_limit_reached" ? "helena_daily_limit_reached" : `subscription_${usage.status}`,
      remoteId: normalized.remoteJid,
      remoteNumber,
      reply: usage.reply,
      status: "discarded",
      summary: `WhatsApp bloqueado por limite/status da Helena: ${usage.reason}.`,
      trace,
      userId: resolvedUserId,
    });

    return {
      body: { ok: true, reason: usage.reason },
      status: 200,
    };
  }

  if (normalized.document) {
    if (!subscriptionAccess.canUseAdvancedHelena) {
      await replyAndFinishWhatsAppTurn({
        config,
        externalMessageId,
        instance: normalized.instance,
        messageText: normalized.text,
        presenceController,
        reason: "whatsapp_import_document_requires_pro",
        remoteId: normalized.remoteJid,
        remoteNumber,
        reply: helenaProFeatureReply,
        status: "discarded",
        summary: "Importacao por arquivo via WhatsApp bloqueada para plano Essencial.",
        trace,
        userId: resolvedUserId,
      });

      return {
        body: { ok: true, reason: "whatsapp_import_document_requires_pro" },
        status: 200,
      };
    }

    try {
      trace.mark("media_download_started", {
        documentFileName: normalized.document.fileName,
        documentMimeType: normalized.document.mimeType,
      });
      const downloadedDocument = await downloadWhatsAppDocument({
        config,
        document: normalized.document,
      });
      trace.mark("media_download_finished", {
        bytes: downloadedDocument.buffer.length,
        fileType: downloadedDocument.fileType,
        mimeType: downloadedDocument.mimeType,
      });

      trace.mark("parse_started", {
        source: "whatsapp_document",
      });
      const { parseResult, session } = await createImportReviewSessionFromFile({
        buffer: downloadedDocument.buffer,
        channelRemoteId: normalized.remoteJid,
        fileName: downloadedDocument.fileName,
        fileType: downloadedDocument.mimeType,
        source: "whatsapp",
        supabase: admin,
        userId: resolvedUserId,
      });
      trace.mark("parse_finished", {
        importableCount: parseResult.summary.importableCount,
        totalRows: parseResult.summary.totalRows,
      });

      const reviewUrl = buildAppUrl(`/app/importar/sessao/${session.id}`);
      await replyAndFinishWhatsAppTurn({
        config,
        externalMessageId,
        instance: normalized.instance,
        messageText: normalized.text,
        presenceController,
        reason: "whatsapp_import_session_created",
        remoteId: normalized.remoteJid,
        remoteNumber,
        reply: buildImportSessionReply(parseResult.summary, reviewUrl),
        status: "processed",
        summary: `Arquivo recebido pelo WhatsApp e sessao de revisao criada: ${session.id}.`,
        trace,
        userId: resolvedUserId,
      });

      return {
        body: { ok: true, status: "import_session_created" },
        status: 200,
      };
    } catch (error) {
      const unsupported = error instanceof WhatsAppUnsupportedDocumentError;
      const reply = unsupported
        ? "Por enquanto eu consigo importar apenas arquivos CSV ou XLSX. Envie uma planilha nesses formatos para eu preparar a revisao."
        : "Recebi seu arquivo, mas nao consegui preparar a revisao agora. Tente enviar novamente em instantes.";

      console.warn("[FECHOUMEI_WHATSAPP_IMPORT_FILE_WARNING]", {
        error: summarizeError(error),
        messageId: externalMessageId,
        provider: getEvolutionProviderName(),
        unsupported,
      });

      await replyAndFinishWhatsAppTurn({
        config,
        externalMessageId,
        instance: normalized.instance,
        messageText: normalized.text,
        presenceController,
        reason: unsupported ? "unsupported_import_document" : "import_document_failed",
        remoteId: normalized.remoteJid,
        remoteNumber,
        reply,
        status: unsupported ? "discarded" : "failed",
        summary: unsupported
          ? "Arquivo inbound descartado por formato ou tamanho nao suportado."
          : "Falha ao preparar sessao de revisao para arquivo inbound.",
        trace,
        userId: resolvedUserId,
      });

      return {
        body: { ok: true, status: unsupported ? "discarded" : "failed" },
        status: 200,
      };
    }
  }

  const exportTextReply = await handleWhatsAppExportTextIntent({
    canUseAdvancedHelena: subscriptionAccess.canUseAdvancedHelena,
    config,
    messageText: normalized.text,
    remoteNumber,
    supabase: admin,
    userId: resolvedUserId,
  });

  if (exportTextReply) {
    await replyAndFinishWhatsAppTurn({
      config,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      presenceController,
      reason: exportTextReply.reason,
      remoteId: normalized.remoteJid,
      remoteNumber,
      reply: exportTextReply.reply,
      status: exportTextReply.status,
      summary: exportTextReply.summary,
      trace,
      userId: resolvedUserId,
    });

    return {
      body: { ok: true, status: exportTextReply.reason },
      status: 200,
    };
  }

  const importTextReply = await handleWhatsAppImportTextIntent({
    allowedIntents: ["request_file"],
    canUseAdvancedHelena: subscriptionAccess.canUseAdvancedHelena,
    messageText: normalized.text,
    remoteId: normalized.remoteJid,
    supabase: admin,
    userId: resolvedUserId,
  });

  if (importTextReply) {
    await replyAndFinishWhatsAppTurn({
      config,
      externalMessageId,
      instance: normalized.instance,
      messageText: normalized.text,
      presenceController,
      reason: importTextReply.reason,
      remoteId: normalized.remoteJid,
      remoteNumber,
      reply: importTextReply.reply,
      status: importTextReply.status,
      summary: importTextReply.summary,
      trace,
      userId: resolvedUserId,
    });

    return {
      body: { ok: true, status: importTextReply.reason },
      status: 200,
    };
  }

  const persistenceContext = {
    channel: "whatsapp" as const,
    supabase: admin,
    userId: resolvedUserId,
  };
  const executionContext = {
    supabase: admin,
    userId: resolvedUserId,
  };

  let conversationId: string | null = null;
  let agentInputText = normalized.text;
  let agentReply: string | null = null;
  let audioStage: WhatsAppAudioPipelineStage | null = normalized.audio ? "audio_detected" : null;
  let audioWasTranscribed = false;

  if (normalized.audio) {
    const audioPipelineStartedAt = Date.now();

    try {
      await logInboundStage({
        externalMessageId,
        instance: normalized.instance,
        messageText: agentInputText,
        metadata: getAudioMetadataSummary(normalized.audio),
        remoteId: normalized.remoteJid,
        stage: "audio_detected",
        userId: resolvedUserId,
      });

      audioStage = "media_download_started";
      trace.mark("media_download_started", {
        audioMimeType: normalized.audio.mimeType,
      });
      await logInboundStage({
        externalMessageId,
        instance: normalized.instance,
        messageText: agentInputText,
        metadata: getAudioMetadataSummary(normalized.audio),
        remoteId: normalized.remoteJid,
        stage: audioStage,
        userId: resolvedUserId,
      });

      const downloadedAudio = await downloadWhatsAppAudio({
        audio: normalized.audio,
        config,
      });

      audioStage = "media_decoded";
      trace.mark("media_download_finished", {
        bytes: downloadedAudio.buffer.length,
        mimeType: downloadedAudio.mimeType,
      });
      await logInboundStage({
        externalMessageId,
        instance: normalized.instance,
        messageText: agentInputText,
        metadata: `mime=${downloadedAudio.mimeType}; bytes=${downloadedAudio.buffer.length}`,
        remoteId: normalized.remoteJid,
        stage: audioStage,
        userId: resolvedUserId,
      });

      const cooldownKey = getAudioCooldownKey(config.instanceName, remoteNumber);
      trace.mark("transcription_started", {
        cooldownKey,
      });
      agentInputText = await enqueueAudioTranscription(cooldownKey, async () => {
        await waitForAudioCooldowns({
          externalMessageId,
          instance: normalized.instance,
          messageText: agentInputText,
          onStage: (stage) => {
            audioStage = stage;
          },
          remoteId: normalized.remoteJid,
          userId: resolvedUserId,
          userKey: cooldownKey,
        });

        return transcribeAudioWithGemini({
          audio: downloadedAudio.buffer,
          mimeType: downloadedAudio.mimeType,
          onStage: async (event) => {
            audioStage = event.stage;
            markTranscriptionLatencyStage(trace, event);
            if (event.status === 429) {
              setAudioCooldown(cooldownKey, "user");
              setAudioCooldown(globalAudioTranscriptionCooldownKey, "global");
            }

            await logInboundStage({
              error: event.error,
              externalMessageId,
              instance: normalized.instance,
              messageText: agentInputText,
              metadata: formatTranscriptionStageMetadata(event),
              remoteId: normalized.remoteJid,
              stage: event.stage,
              userId: resolvedUserId,
            });
          },
        });
      });
      audioWasTranscribed = true;
      trace.mark("transcription_finished", {
        characters: agentInputText.length,
      });
      trace.mark("total_audio_pipeline_elapsed_ms", {
        status: "transcribed",
        totalAudioPipelineElapsedMs: Date.now() - audioPipelineStartedAt,
      });

      audioStage = "transcript_parse_started";
      await logInboundStage({
        externalMessageId,
        instance: normalized.instance,
        messageText: agentInputText,
        metadata: `preview=${summarizeReplyForChannelLog(agentInputText)}`,
        remoteId: normalized.remoteJid,
        stage: audioStage,
        userId: resolvedUserId,
      });
    } catch (error) {
      audioStage = getAudioFailureStage(error, audioStage);
      const cooldownKey = getAudioCooldownKey(config.instanceName, remoteNumber);
      if (error instanceof AudioTranscriptionError && error.status === 429) {
        setAudioCooldown(cooldownKey, "user");
        setAudioCooldown(globalAudioTranscriptionCooldownKey, "global");
      }

      console.error("[FECHOUMEI_AUDIO_FINAL_FAILURE]", {
        cooldownActiveMs: getAudioCooldownWaitMs(cooldownKey),
        globalCooldownActiveMs: getAudioCooldownWaitMs(globalAudioTranscriptionCooldownKey),
        error: summarizeError(error),
        messageId: normalized.externalMessageId,
        provider: getEvolutionProviderName(),
        retryable: error instanceof AudioTranscriptionError ? error.transient : undefined,
        stage: audioStage,
        status: error instanceof AudioTranscriptionError ? error.status : undefined,
        timedOut: error instanceof AudioTranscriptionError ? error.timedOut : undefined,
      });

      trace.mark("response_build_started", {
        fallback: "audio",
      });
      trace.mark("response_build_finished", {
        characters: audioFallbackReply.length,
        fallback: "audio",
      });
      trace.mark("audio_fallback_response_started", {
        stage: audioStage,
      });
      trace.mark("response_send_started", {
        fallback: "audio",
      });
      presenceController?.stop("response_send_started");
      await sendAudioFallbackReply(config, remoteNumber, trace);
      trace.mark("response_send_finished", {
        fallback: "audio",
      });
      trace.mark("audio_fallback_response_finished", {
        stage: audioStage,
      });
      trace.mark("audio_error_handled_without_rethrow", {
        stage: audioStage,
      });
      await safeUpdateInboundEvent({
        conversationId,
        error: summarizeAudioError(error, audioStage),
        externalMessageId,
        instance: normalized.instance,
        messageText: agentInputText,
        remoteId: normalized.remoteJid,
        status: "failed",
        summary: getAudioFailureSummary(error, audioStage),
        userId: resolvedUserId,
      });

      trace.mark("total_audio_pipeline_elapsed_ms", {
        stage: audioStage,
        status: "failed",
        totalAudioPipelineElapsedMs: Date.now() - audioPipelineStartedAt,
      });
      trace.finish("failed", {
        stage: audioStage,
      });

      return {
        body: { ok: true, status: "failed" },
        status: 200,
      };
    }
  }

  trace.mark("parse_started", {
    source: audioWasTranscribed ? "audio_transcript" : "text",
  });

  if (!agentInputText) {
    trace.mark("parse_finished", {
      status: "unsupported_message_type",
    });
    return discard("unsupported_message_type", "Mensagem ignorada fora do escopo de texto simples");
  }

  trace.mark("parse_finished", {
    characters: agentInputText.length,
    source: audioWasTranscribed ? "audio_transcript" : "text",
  });

  try {
    trace.mark("orchestration_started");
    const queuedTurn = await runQueuedAgentTurn({
      context: persistenceContext,
      onTimeout: async () => {
        trace.mark("response_build_started", {
          fallback: "conversation_locked",
        });
        agentReply = agentTurnQueueBusyReply;
        trace.mark("response_build_finished", {
          characters: agentReply.length,
          fallback: "conversation_locked",
        });

        return {
          reply: agentReply,
          queuedTimeout: true,
          summary: undefined,
        };
      },
      work: async () => {
        const snapshot = await loadAgentConversationSnapshot(persistenceContext);
        conversationId = snapshot.conversationId;

        if (audioWasTranscribed) {
          audioStage = "agent_turn_started";
          await logInboundStage({
            conversationId,
            externalMessageId,
            instance: normalized.instance,
            messageText: agentInputText,
            metadata: `preview=${summarizeReplyForChannelLog(agentInputText)}`,
            remoteId: normalized.remoteJid,
            stage: audioStage,
            userId: resolvedUserId,
          });
        }

        const importControlReply = await handleWhatsAppImportTextIntent({
          agentState: snapshot.state,
          allowedIntents: ["cancel", "confirm"],
          canUseAdvancedHelena: subscriptionAccess.canUseAdvancedHelena,
          messageText: agentInputText,
          remoteId: normalized.remoteJid,
          supabase: admin,
          userId: resolvedUserId,
        });

        if (importControlReply) {
          trace.mark("action_execution_started", {
            conversationId,
            source: importControlReply.reason,
          });
          trace.mark("action_execution_finished", {
            replyCharacters: importControlReply.reply.length,
            source: importControlReply.reason,
          });
          trace.mark("response_build_started", {
            source: importControlReply.reason,
          });
          agentReply = importControlReply.reply;
          trace.mark("response_build_finished", {
            characters: agentReply.length,
            source: importControlReply.reason,
          });

          return {
            reply: importControlReply.reply,
            queuedTimeout: false,
            summary: importControlReply.summary,
          };
        }

        trace.mark("action_execution_started", {
          conversationId,
        });
        const result = await runAgentTurnForContext({
          channel: "whatsapp",
          context: executionContext,
          message: agentInputText,
          state: snapshot.state,
        });
        trace.mark("action_execution_finished", {
          replyCharacters: result.reply.length,
        });

        trace.mark("response_build_started", {
          source: "agent_result",
        });
        agentReply = result.reply;
        trace.mark("response_build_finished", {
          characters: agentReply.length,
        });

        if (audioWasTranscribed) {
          audioStage = "agent_turn_finished";
          await logInboundStage({
            conversationId,
            externalMessageId,
            instance: normalized.instance,
            messageText: agentInputText,
            metadata: `reply=${summarizeReplyForChannelLog(result.reply)}`,
            remoteId: normalized.remoteJid,
            stage: audioStage,
            userId: resolvedUserId,
          });
        }

        const updatedSnapshot = await persistAgentTurn({
          actionTrace: result.actionTrace,
          context: persistenceContext,
          conversationId: snapshot.conversationId,
          nextState: result.state,
          reply: result.reply,
          userMessage: agentInputText,
        });

        conversationId = updatedSnapshot.conversationId;

        return {
          reply: result.reply,
          queuedTimeout: false,
        };
      },
    });

    trace.mark("orchestration_finished", {
      conversationId,
      queuedTimeout: queuedTurn.queuedTimeout,
    });

    trace.mark("response_send_started");
    presenceController?.stop("response_send_started");
    trace.mark("provider_send_request_started", {
      channel: "whatsapp",
    });
    await sendWhatsAppTextReply({
      config,
      remoteNumber,
      reply: queuedTurn.reply,
    });
    trace.mark("provider_send_request_finished", {
      channel: "whatsapp",
    });
    trace.mark("response_send_finished");

    await safeUpdateInboundEvent({
      conversationId,
      error: null,
      externalMessageId,
      instance: normalized.instance,
      messageText: agentInputText,
      remoteId: normalized.remoteJid,
      status: "processed",
      summary: queuedTurn.queuedTimeout
        ? "Mensagem aguardou uma conversa ainda em processamento e recebeu fallback de fila."
        : queuedTurn.summary
          ? queuedTurn.summary
        : getProcessedSummary(queuedTurn.reply, audioWasTranscribed, agentInputText),
      userId: resolvedUserId,
    });

    trace.finish("processed", {
      conversationId,
    });

    return {
      body: { ok: true, status: "processed" },
      status: 200,
    };
  } catch (error) {
    console.error("WhatsApp local channel failed to process inbound message.", {
      error,
      messageId: normalized.externalMessageId,
      provider: getEvolutionProviderName(),
    });

    const friendlyReply =
      agentReply ??
      getFriendlyWhatsAppErrorReply(error);

    trace.mark("response_build_started", {
      fallback: "generic",
    });
    trace.mark("response_build_finished", {
      characters: friendlyReply.length,
      fallback: "generic",
    });

    if (remoteNumber) {
      try {
        trace.mark("response_send_started", {
          fallback: "generic",
        });
        presenceController?.stop("response_send_started");
        trace.mark("provider_send_request_started", {
          channel: "whatsapp",
          fallback: "generic",
        });
        await sendWhatsAppTextReply({
          config,
          remoteNumber,
          reply: friendlyReply,
        });
        trace.mark("provider_send_request_finished", {
          channel: "whatsapp",
          fallback: "generic",
        });
        trace.mark("response_send_finished", {
          fallback: "generic",
        });
      } catch (sendError) {
        presenceController?.stop("response_send_failed");
        trace.mark("provider_send_request_finished", {
          channel: "whatsapp",
          error: summarizeError(sendError),
          fallback: "generic",
          status: "failed",
        });
        trace.mark("response_send_finished", {
          error: summarizeError(sendError),
          fallback: "generic",
          status: "failed",
        });
        console.error("WhatsApp local channel also failed to send fallback reply.", sendError);
      }
    }

    await safeUpdateInboundEvent({
      conversationId,
      error: summarizeError(error),
      externalMessageId,
      instance: normalized.instance,
      messageText: agentInputText,
      remoteId: normalized.remoteJid,
      status: "failed",
      summary: "Falha ao processar a mensagem inbound do WhatsApp local.",
      userId: resolvedUserId,
    });

    trace.finish("failed", {
      error: summarizeError(error),
    });

    return {
      body: { ok: true, status: "failed" },
      status: 200,
    };
  }
}

function getInboundReceivedSummary(normalized: ReturnType<typeof normalizeEvolutionWebhookPayload>) {
  if (normalized.document) {
    const metadata = [
      normalized.document.fileName ? `arquivo=${normalized.document.fileName}` : null,
      normalized.document.mimeType ? `mime=${normalized.document.mimeType}` : null,
      typeof normalized.document.sizeBytes === "number" ? `tamanho=${normalized.document.sizeBytes}` : null,
    ].filter(Boolean);

    return `Evento inbound de arquivo recebido pelo canal local do WhatsApp${metadata.length > 0 ? ` (${metadata.join(", ")})` : ""}.`;
  }

  if (!normalized.audio) {
    return "Evento inbound de texto recebido pelo canal local do WhatsApp.";
  }

  const metadata = [
    normalized.audio.mimeType ? `mime=${normalized.audio.mimeType}` : null,
    typeof normalized.audio.seconds === "number" ? `duracao=${normalized.audio.seconds}s` : null,
    typeof normalized.audio.sizeBytes === "number" ? `tamanho=${normalized.audio.sizeBytes}` : null,
  ].filter(Boolean);

  return `Evento inbound de audio recebido pelo canal local do WhatsApp${metadata.length > 0 ? ` (${metadata.join(", ")})` : ""}.`;
}

async function handleWhatsAppExportTextIntent({
  canUseAdvancedHelena,
  config,
  messageText,
  remoteNumber,
  supabase,
  userId,
}: {
  canUseAdvancedHelena: boolean;
  config: ReturnType<typeof getWhatsAppChannelConfig>;
  messageText?: string | null;
  remoteNumber: string;
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
}): Promise<{
  reason: string;
  reply: string;
  status: "processed" | "discarded" | "failed";
  summary: string;
} | null> {
  const intent = getWhatsAppExportIntent(messageText);

  if (!intent) {
    return null;
  }

  if (intent.kind === "unsupported_pdf") {
    return {
      reason: "whatsapp_export_pdf_requested",
      reply: "Por enquanto consigo enviar CSV pelo WhatsApp. O PDF ainda precisa ser gerado pelo app em Relatorios.",
      status: "processed",
      summary: "Usuario solicitou exportacao em PDF pelo WhatsApp; formato ainda nao suportado.",
    };
  }

  if (intent.kind === "unsupported_xlsx") {
    return {
      reason: "whatsapp_export_xlsx_requested",
      reply: "Por enquanto envio CSV pelo WhatsApp. Voce pode abrir esse arquivo no Excel ou Google Sheets.",
      status: "processed",
      summary: "Usuario solicitou exportacao em XLSX pelo WhatsApp; formato ainda nao suportado.",
    };
  }

  if (!canUseAdvancedHelena) {
    return {
      reason: "whatsapp_export_requires_pro",
      reply: helenaProFeatureReply,
      status: "discarded",
      summary: "Exportacao CSV pelo WhatsApp bloqueada para plano Essencial.",
    };
  }

  try {
    const exportResult = await getTransactionCsvExport({
      period: intent.period,
      supabase,
      typeFilter: intent.typeFilter,
      userId,
    });
    const periodLabel = formatPeriodLabel(intent.period);
    const filterLabel = getExportTypeFilterLabel(intent.typeFilter);

    if (exportResult.movements.length === 0) {
      return {
        reason: "whatsapp_export_empty",
        reply: `Nao encontrei movimentacoes${filterLabel} em ${periodLabel} para exportar.`,
        status: "processed",
        summary: "Pedido de exportacao pelo WhatsApp sem movimentacoes no periodo.",
      };
    }

    await sendWhatsAppDocument({
      caption: `CSV FechouMEI - ${periodLabel}`,
      config,
      content: Buffer.from(withCsvBom(exportResult.csv), "utf8"),
      fileName: exportResult.fileName,
      mimeType: "text/csv",
      remoteNumber,
    });

    return {
      reason: "whatsapp_export_csv_sent",
      reply: [
        "Pronto.",
        `Enviei o CSV com ${exportResult.movements.length} movimentacao${exportResult.movements.length === 1 ? "" : "es"}${filterLabel} de ${periodLabel}.`,
        intent.defaultedToCurrentMonth ? "Usei o mes atual como periodo padrao." : null,
      ].filter(Boolean).join("\n"),
      status: "processed",
      summary: `CSV de movimentacoes exportado pelo WhatsApp (${exportResult.movements.length} linhas).`,
    };
  } catch (error) {
    console.warn("[FECHOUMEI_WHATSAPP_EXPORT_WARNING]", {
      error: summarizeError(error),
      provider: getEvolutionProviderName(),
    });

    return {
      reason: "whatsapp_export_failed",
      reply: "Tive um problema para gerar o arquivo agora. Tente novamente em instantes.",
      status: "failed",
      summary: "Falha ao exportar CSV de movimentacoes pelo WhatsApp.",
    };
  }
}

async function handleWhatsAppImportTextIntent({
  agentState,
  allowedIntents,
  canUseAdvancedHelena,
  messageText,
  remoteId,
  supabase,
  userId,
}: {
  agentState?: AgentConversationState | null;
  allowedIntents?: WhatsAppImportIntent[];
  canUseAdvancedHelena: boolean;
  messageText?: string | null;
  remoteId?: string | null;
  supabase: ReturnType<typeof createServiceRoleClient>;
  userId: string;
}): Promise<{
  reason: string;
  reply: string;
  status: "processed" | "discarded" | "failed";
  summary: string;
} | null> {
  const intent = getWhatsAppImportIntent(messageText);

  if (!intent) {
    return null;
  }

  if (allowedIntents && !allowedIntents.includes(intent)) {
    return null;
  }

  if (intent === "request_file" && !canUseAdvancedHelena) {
    return {
      reason: "whatsapp_import_requires_pro",
      reply: helenaProFeatureReply,
      status: "discarded",
      summary: "Fluxo de importacao por WhatsApp bloqueado para plano Essencial.",
    };
  }

  if (intent === "request_file") {
    return {
      reason: "whatsapp_import_file_requested",
      reply: "Claro. Me envie um arquivo CSV ou XLSX com suas movimentacoes que eu preparo a importacao para voce revisar ou confirmar.",
      status: "processed",
      summary: "Usuario solicitou importacao pelo WhatsApp sem anexar arquivo.",
    };
  }

  try {
    const shouldUsePendingImportSession = intent === "cancel" || intent === "confirm";
    const latestSession = shouldUsePendingImportSession
      ? await findLatestWhatsAppImportSession({
        channelRemoteId: remoteId,
        supabase,
        userId,
      })
      : null;

    if (shouldUsePendingImportSession) {
      const hasPendingImportSession = isPendingWhatsAppImportSession(latestSession?.session.status);

      if (!hasPendingImportSession) {
        return null;
      }

      if (shouldPrioritizeAgentDraftForImportControl(agentState, messageText)) {
        return null;
      }
    }

    if (intent === "cancel") {
      const result = await cancelWhatsAppImportSession({
        channelRemoteId: remoteId,
        supabase,
        userId,
      });

      return {
        reason: result.ok ? "whatsapp_import_cancelled" : "whatsapp_import_cancel_failed",
        reply: result.message,
        status: result.ok ? "processed" : "discarded",
        summary: result.ok ? "Sessao de importacao cancelada pelo WhatsApp." : "Cancelamento de importacao sem sessao pendente.",
      };
    }

    if (!canUseAdvancedHelena) {
      return {
        reason: "whatsapp_import_confirm_requires_pro",
        reply: helenaProFeatureReply,
        status: "discarded",
        summary: "Confirmacao de importacao por WhatsApp bloqueada para plano Essencial.",
      };
    }

    const result = await confirmWhatsAppImportSession({
      channelRemoteId: remoteId,
      supabase,
      userId,
    });

    return {
      reason: result.ok ? "whatsapp_import_confirmed" : "whatsapp_import_confirm_blocked",
      reply: buildWhatsAppImportConfirmationReply(result),
      status: result.ok ? "processed" : "discarded",
      summary: result.ok ? "Sessao de importacao confirmada pelo WhatsApp." : "Confirmacao de importacao bloqueada pelo WhatsApp.",
    };
  } catch (error) {
    return {
      reason: "whatsapp_import_confirm_failed",
      reply: error instanceof Error ? error.message : genericFallbackReply,
      status: "failed",
      summary: "Falha ao confirmar importacao pelo WhatsApp.",
    };
  }
}

function buildImportSessionReply(
  summary: {
    duplicateExistingCount: number;
    duplicateFileCount: number;
    errorCount: number;
    expenseAmount: number;
    expenseCount: number;
    incomeAmount: number;
    importableCount: number;
    incomeCount: number;
    totalRows: number;
  },
  reviewUrl: string | null,
) {
  const duplicateCount = summary.duplicateExistingCount + summary.duplicateFileCount;
  const newCount = summary.importableCount;

  if (summary.importableCount === 0 && duplicateCount > 0) {
    return [
      "Esse arquivo parece ja ter sido importado antes.",
      `Encontrei ${duplicateCount} movimentacao${duplicateCount === 1 ? "" : "es"}, mas todas parecem ja existir no FechouMEI.`,
      "Nao importei novamente para evitar duplicidade.",
      reviewUrl ? `Se quiser conferir a revisao, acesse:\n${reviewUrl}` : null,
    ].filter(Boolean).join("\n\n");
  }

  if (summary.importableCount === 0) {
    return [
      "Nao consegui encontrar movimentacoes validas nesse arquivo.",
      "Confira se ele tem data, descricao e valor.",
      reviewUrl && summary.totalRows > 0 ? `Voce pode revisar os detalhes aqui:\n${reviewUrl}` : null,
    ].filter(Boolean).join("\n\n");
  }

  if (summary.errorCount > 0) {
    return [
      "Recebi sua planilha, mas algumas linhas precisam de atencao.",
      "",
      "Encontrei:",
      `- ${newCount} movimentacao${newCount === 1 ? "" : "es"} nova${newCount === 1 ? "" : "s"}`,
      `- ${summary.incomeCount} entrada${summary.incomeCount === 1 ? "" : "s"} - ${formatCurrency(summary.incomeAmount)}`,
      `- ${summary.expenseCount} despesa${summary.expenseCount === 1 ? "" : "s"} - ${formatCurrency(summary.expenseAmount)}`,
      `- ${summary.errorCount} com erro`,
      `- ${duplicateCount} possivel${duplicateCount === 1 ? "" : "is"} duplicada${duplicateCount === 1 ? "" : "s"}`,
      "",
      reviewUrl
        ? `Para evitar importar errado, revise no app:\n${reviewUrl}`
        : "Para evitar importar errado, abra o app em Importar dados e revise antes de salvar.",
    ].filter(Boolean).join("\n");
  }

  if (duplicateCount > 0) {
    return [
      "Recebi sua planilha.",
      "",
      "Encontrei:",
      `- ${newCount} movimentacao${newCount === 1 ? "" : "es"} nova${newCount === 1 ? "" : "s"}`,
      `- ${duplicateCount} possivel${duplicateCount === 1 ? "" : "is"} duplicada${duplicateCount === 1 ? "" : "s"}`,
      `- ${summary.incomeCount} entrada${summary.incomeCount === 1 ? "" : "s"} - ${formatCurrency(summary.incomeAmount)}`,
      `- ${summary.expenseCount} despesa${summary.expenseCount === 1 ? "" : "s"} - ${formatCurrency(summary.expenseAmount)}`,
      "",
      "Posso importar apenas as novas? Responda: confirmar.",
      reviewUrl ? `Se preferir revisar linha por linha, acesse:\n${reviewUrl}` : null,
    ].filter(Boolean).join("\n");
  }

  return [
    "Recebi sua planilha.",
    "",
    `Encontrei ${summary.importableCount} movimentacao${summary.importableCount === 1 ? "" : "es"}:`,
    `- ${summary.incomeCount} entrada${summary.incomeCount === 1 ? "" : "s"} - ${formatCurrency(summary.incomeAmount)}`,
    `- ${summary.expenseCount} despesa${summary.expenseCount === 1 ? "" : "s"} - ${formatCurrency(summary.expenseAmount)}`,
    `- ${summary.errorCount} com erro`,
    `- ${duplicateCount} possivel${duplicateCount === 1 ? "" : "is"} duplicada${duplicateCount === 1 ? "" : "s"}`,
    "",
    "Para salvar direto no FechouMEI, responda: confirmar.",
    "Se preferir revisar linha por linha, abra o app em Importar dados.",
  ].join("\n");
}

function buildWhatsAppImportConfirmationReply(result: {
  importedCount?: number;
  importedExpenseAmount?: number;
  importedExpenseCount?: number;
  importedIncomeAmount?: number;
  importedIncomeCount?: number;
  message: string;
  ok: boolean;
  reviewUrl?: string;
  skippedDuplicateCount?: number;
}) {
  if (!result.ok) {
    if (result.reviewUrl) {
      const reviewUrl = buildAppUrl(result.reviewUrl);
      return [
        result.message,
        "",
        reviewUrl ?? "Abra o app em Importar dados para revisar.",
      ].join("\n");
    }

    return result.message;
  }

  if (!result.importedCount || result.importedCount <= 0) {
    return result.message;
  }

  return [
    "Pronto.",
    `Importei ${result.importedCount} movimentacao${result.importedCount === 1 ? "" : "es"} no FechouMEI:`,
    `- ${result.importedIncomeCount ?? 0} entrada${result.importedIncomeCount === 1 ? "" : "s"} - ${formatCurrency(result.importedIncomeAmount ?? 0)}`,
    `- ${result.importedExpenseCount ?? 0} despesa${result.importedExpenseCount === 1 ? "" : "s"} - ${formatCurrency(result.importedExpenseAmount ?? 0)}`,
    result.skippedDuplicateCount && result.skippedDuplicateCount > 0
      ? `- ${result.skippedDuplicateCount} duplicada${result.skippedDuplicateCount === 1 ? "" : "s"} ignorada${result.skippedDuplicateCount === 1 ? "" : "s"}`
      : null,
    "",
    "Voce pode conferir em Movimentacoes.",
  ].filter(Boolean).join("\n");
}

function getWhatsAppImportIntent(messageText?: string | null) {
  const normalized = normalizeIntentText(messageText);

  if (!normalized) {
    return null;
  }

  if (
    /^(cancelar|cancela|descartar)(?:\s+(?:a\s+)?(?:importacao|planilha|arquivo|csv|xlsx|extrato))?$/.test(normalized) ||
    /^(nao importar)$/.test(normalized)
  ) {
    return "cancel" as const;
  }

  if (
    /^(confirmar|confirma|pode importar|importar|salvar|sim|pode salvar)(?:\s+(?:a\s+)?(?:importacao|planilha|arquivo|csv|xlsx|extrato))?$/.test(normalized)
  ) {
    return "confirm" as const;
  }

  if (
    /\b(importa|importar|importacao)\b/.test(normalized) &&
    /\b(planilha|arquivo|csv|xlsx|extrato)\b/.test(normalized)
  ) {
    return "request_file" as const;
  }

  return null;
}

function isPendingWhatsAppImportSession(status?: string | null) {
  return status === "draft" || status === "reviewed";
}

function shouldPrioritizeAgentDraftForImportControl(
  agentState?: AgentConversationState | null,
  messageText?: string | null,
) {
  if (!agentState || agentState.status === "idle") {
    return false;
  }

  if (isExplicitWhatsAppImportControl(messageText)) {
    return false;
  }

  return Boolean(
    agentState.pendingAction === "register_income" ||
    agentState.pendingAction === "register_expense" ||
    agentState.pendingAction === "register_movements_batch" ||
    agentState.pendingAction === "edit_transaction" ||
    agentState.pendingAction === "delete_transaction" ||
    agentState.pendingAction === "set_initial_balance" ||
    agentState.pendingAction === "mark_obligation" ||
    agentState.pendingAction === "update_reminder_preferences",
  );
}

function isExplicitWhatsAppImportControl(messageText?: string | null) {
  const normalized = normalizeIntentText(messageText);

  return /\b(importa|importar|importacao|planilha|arquivo|csv|xlsx|extrato)\b/.test(normalized);
}

function getWhatsAppExportIntent(messageText?: string | null) {
  const normalized = normalizeIntentText(messageText);

  if (!normalized) {
    return null;
  }

  const asksPdf = /\b(pdf)\b/.test(normalized);
  const asksXlsx = /\b(xlsx|excel)\b/.test(normalized);
  const mentionsImport = /\b(importa|importar|importacao)\b/.test(normalized);
  const hasExportVerb = /\b(exporta|exportar|gera|gerar|manda|mandar|envia|enviar|baixar|baixa|download)\b/.test(normalized);
  const hasFileWord = /\b(csv|arquivo|relatorio|movimentacao|movimentacoes|entradas?|despesas?|dados)\b/.test(normalized);
  const wantsReport = /\b(quero|preciso|gostaria)\b/.test(normalized) && /\b(relatorio|csv|arquivo|movimentacao|movimentacoes)\b/.test(normalized);
  const parsedPeriod = parseWhatsAppExportPeriod(normalized);
  const looksLikeExport = /\bcsv\b/.test(normalized) || wantsReport || (hasExportVerb && (hasFileWord || parsedPeriod.explicit));

  if (mentionsImport && !/\b(exporta|exportar|csv|relatorio|baixar|download)\b/.test(normalized)) {
    return null;
  }

  if (!looksLikeExport && (asksPdf || asksXlsx)) {
    const hasReportContext = /\b(relatorio|movimentacao|movimentacoes|entradas?|despesas?)\b/.test(normalized);
    if (!hasReportContext) {
      return null;
    }
  }

  if (asksPdf && (looksLikeExport || hasExportVerb || /\b(relatorio)\b/.test(normalized))) {
    return { kind: "unsupported_pdf" as const };
  }

  if (asksXlsx && (looksLikeExport || hasExportVerb || /\b(relatorio|movimentacao|movimentacoes)\b/.test(normalized))) {
    return { kind: "unsupported_xlsx" as const };
  }

  if (!looksLikeExport) {
    return null;
  }

  return {
    defaultedToCurrentMonth: !parsedPeriod.explicit,
    kind: "csv" as const,
    period: parsedPeriod.period,
    typeFilter: getWhatsAppExportTypeFilter(normalized),
  };
}

function getWhatsAppExportTypeFilter(normalizedText: string): "entrada" | "despesa" | "todos" {
  const asksExpenses = /\b(despesa|despesas|gasto|gastos|saida|saidas)\b/.test(normalizedText);
  const asksIncomes = /\b(entrada|entradas|receita|receitas|faturamento)\b/.test(normalizedText);

  if (asksExpenses && !asksIncomes) {
    return "despesa";
  }

  if (asksIncomes && !asksExpenses) {
    return "entrada";
  }

  return "todos";
}

function parseWhatsAppExportPeriod(normalizedText: string) {
  const current = getCurrentSaoPauloYearMonth();

  if (/\b(mes passado|ultimo mes|m[eê]s passado)\b/.test(normalizedText)) {
    return {
      explicit: true,
      period: buildTransactionCsvPeriod(
        current.month === 1 ? current.year - 1 : current.year,
        current.month === 1 ? 12 : current.month - 1,
      ),
    };
  }

  if (/\b(esse mes|este mes|mes atual|deste mes|desse mes)\b/.test(normalizedText)) {
    return {
      explicit: true,
      period: buildTransactionCsvPeriod(current.year, current.month),
    };
  }

  const numericMonthYear = normalizedText.match(/\b(0?[1-9]|1[0-2])[\/.-](20\d{2})\b/);
  if (numericMonthYear) {
    return {
      explicit: true,
      period: buildTransactionCsvPeriod(Number(numericMonthYear[2]), Number(numericMonthYear[1])),
    };
  }

  const numericYearMonth = normalizedText.match(/\b(20\d{2})[\/.-](0?[1-9]|1[0-2])\b/);
  if (numericYearMonth) {
    return {
      explicit: true,
      period: buildTransactionCsvPeriod(Number(numericYearMonth[1]), Number(numericYearMonth[2])),
    };
  }

  for (const month of portugueseMonths) {
    const monthPattern = new RegExp(`\\b${month.normalized}\\b(?:\\s+de\\s+(20\\d{2}))?`);
    const monthMatch = normalizedText.match(monthPattern);

    if (monthMatch) {
      return {
        explicit: true,
        period: buildTransactionCsvPeriod(Number(monthMatch[1] ?? current.year), month.value),
      };
    }
  }

  return {
    explicit: false,
    period: buildTransactionCsvPeriod(current.year, current.month),
  };
}

function getCurrentSaoPauloYearMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date());

  return {
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    year: Number(parts.find((part) => part.type === "year")?.value ?? new Date().getFullYear()),
  };
}

const portugueseMonths = [
  { label: "janeiro", normalized: "janeiro", value: 1 },
  { label: "fevereiro", normalized: "fevereiro", value: 2 },
  { label: "marco", normalized: "marco", value: 3 },
  { label: "abril", normalized: "abril", value: 4 },
  { label: "maio", normalized: "maio", value: 5 },
  { label: "junho", normalized: "junho", value: 6 },
  { label: "julho", normalized: "julho", value: 7 },
  { label: "agosto", normalized: "agosto", value: 8 },
  { label: "setembro", normalized: "setembro", value: 9 },
  { label: "outubro", normalized: "outubro", value: 10 },
  { label: "novembro", normalized: "novembro", value: 11 },
  { label: "dezembro", normalized: "dezembro", value: 12 },
];

function formatPeriodLabel(period: { month: number; year: number }) {
  const month = portugueseMonths.find((candidate) => candidate.value === period.month)?.label ?? `mes ${period.month}`;

  return `${month} de ${period.year}`;
}

function getExportTypeFilterLabel(typeFilter: "entrada" | "despesa" | "todos") {
  if (typeFilter === "entrada") {
    return " de entradas";
  }

  if (typeFilter === "despesa") {
    return " de despesas";
  }

  return "";
}

function normalizeIntentText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(value);
}

async function replyAndFinishWhatsAppTurn({
  config,
  externalMessageId,
  instance,
  messageText,
  presenceController,
  reason,
  remoteId,
  remoteNumber,
  reply,
  status,
  summary,
  trace,
  userId,
}: {
  config: ReturnType<typeof getWhatsAppChannelConfig>;
  externalMessageId: string;
  instance?: string | null;
  messageText?: string | null;
  presenceController: WhatsAppPresenceController | null;
  reason: string;
  remoteId?: string | null;
  remoteNumber: string;
  reply: string;
  status: "processed" | "discarded" | "failed";
  summary: string;
  trace: WhatsAppLatencyTrace;
  userId?: string | null;
}) {
  let sendError: string | null = null;

  trace.mark("response_build_started", {
    reason,
  });
  trace.mark("response_build_finished", {
    characters: reply.length,
    reason,
  });
  trace.mark("response_send_started", {
    reason,
  });
  presenceController?.stop("response_send_started");

  try {
    trace.mark("provider_send_request_started", {
      channel: "whatsapp",
      reason,
    });
    await sendWhatsAppTextReply({
      config,
      remoteNumber,
      reply,
    });
    trace.mark("provider_send_request_finished", {
      channel: "whatsapp",
      reason,
    });
    trace.mark("response_send_finished", {
      reason,
    });
  } catch (error) {
    sendError = summarizeError(error);
    trace.mark("provider_send_request_finished", {
      channel: "whatsapp",
      error: sendError,
      reason,
      status: "failed",
    });
    trace.mark("response_send_finished", {
      error: sendError,
      reason,
      status: "failed",
    });
    console.error("WhatsApp channel failed to send activation/status reply.", {
      error,
      externalMessageId,
      reason,
    });
  }

  await safeUpdateInboundEvent({
    error: sendError,
    externalMessageId,
    instance,
    messageText,
    remoteId,
    status: sendError ? "failed" : status,
    summary,
    userId,
  });

  trace.finish(sendError ? "failed" : status, {
    reason,
  });
}

function getProcessedSummary(reply: string, audioWasTranscribed: boolean, transcript?: string | null) {
  const replySummary = summarizeReplyForChannelLog(reply);

  return audioWasTranscribed
    ? `stage=processed | audio transcrito; transcript=${summarizeReplyForChannelLog(transcript ?? "")}; resposta=${replySummary}`
    : replySummary;
}

function getAudioFailureSummary(error: unknown, stage: WhatsAppAudioPipelineStage | null) {
  const prefix = `stage=${stage ?? "unknown"}`;

  if (error instanceof WhatsAppUnsupportedAudioError) {
    return `${prefix} | Audio inbound descartado por limite ou tipo nao suportado.`;
  }

  if (error instanceof WhatsAppMediaDownloadError) {
    return `${prefix} | Falha ao baixar audio inbound do WhatsApp local.`;
  }

  if (error instanceof AudioTranscriptionError) {
    return `${prefix} | Falha ao transcrever audio inbound do WhatsApp local${error.transient ? " (transitorio)" : ""}.`;
  }

  return `${prefix} | Falha ao processar audio inbound do WhatsApp local.`;
}

async function sendAudioFallbackReply(
  config: ReturnType<typeof getWhatsAppChannelConfig>,
  remoteNumber: string,
  trace: WhatsAppLatencyTrace,
) {
  try {
    trace.mark("provider_send_request_started", {
      channel: "whatsapp",
      fallback: "audio",
    });
    await sendWhatsAppTextReply({
      config,
      remoteNumber,
      reply: audioFallbackReply,
    });
    trace.mark("provider_send_request_finished", {
      channel: "whatsapp",
      fallback: "audio",
    });
  } catch (error) {
    trace.mark("provider_send_request_finished", {
      channel: "whatsapp",
      error: summarizeError(error),
      fallback: "audio",
      status: "failed",
    });
    console.error("WhatsApp local channel failed to send audio fallback reply.", error);
  }
}

function getFriendlyWhatsAppErrorReply(error: unknown) {
  if (error instanceof WhatsAppChannelConfigError) {
    return "O canal local do WhatsApp ainda não está configurado direito.";
  }

  if (error instanceof AgentPersistenceSetupError) {
    return genericFallbackReply;
  }

  return genericFallbackReply;
}

function summarizeReplyForChannelLog(reply: string) {
  return reply.trim().replace(/\s+/g, " ").slice(0, 180);
}

function summarizeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 240) : "Erro inesperado no canal do WhatsApp.";
}

function summarizeAudioError(error: unknown, stage: WhatsAppAudioPipelineStage | null) {
  const summary = summarizeError(error);
  const timeout = error instanceof AudioTranscriptionError && error.timedOut ? " timeout=true" : "";
  return `stage=${stage ?? "unknown"}${timeout} | ${summary}`.slice(0, 240);
}

function getAudioFailureStage(error: unknown, currentStage: WhatsAppAudioPipelineStage | null): WhatsAppAudioPipelineStage {
  if (error instanceof WhatsAppUnsupportedAudioError || error instanceof WhatsAppMediaDownloadError) {
    return "media_download_failed";
  }

  if (error instanceof AudioTranscriptionError && error.stage) {
    return error.stage;
  }

  return currentStage ?? "transcript_parse_failed";
}

function getAudioMetadataSummary(audio: NonNullable<ReturnType<typeof normalizeEvolutionWebhookPayload>["audio"]>) {
  return [
    audio.mimeType ? `mime=${audio.mimeType}` : null,
    typeof audio.seconds === "number" ? `duration=${audio.seconds}s` : null,
    typeof audio.sizeBytes === "number" ? `bytes=${audio.sizeBytes}` : null,
  ].filter(Boolean).join("; ");
}

function formatTranscriptionStageMetadata(event: {
  attempt: number;
  apiKeySource?: "dedicated" | "fallback";
  durationMs?: number;
  error?: string;
  model?: string;
  nextRetryMs?: number;
  retry?: boolean;
  status?: number;
  summary?: string;
}) {
  return [
    `attempt=${event.attempt}`,
    event.apiKeySource ? `apiKeySource=${event.apiKeySource}` : null,
    event.model ? `model=${event.model}` : null,
    typeof event.status === "number" ? `status=${event.status}` : null,
    typeof event.retry === "boolean" ? `retry=${event.retry}` : null,
    typeof event.nextRetryMs === "number" ? `nextRetryMs=${event.nextRetryMs}` : null,
    typeof event.durationMs === "number" ? `durationMs=${event.durationMs}` : null,
    event.summary ? `summary=${event.summary}` : null,
    event.error ? `error=${event.error}` : null,
  ].filter(Boolean).join("; ");
}

function markTranscriptionLatencyStage(trace: WhatsAppLatencyTrace, event: AudioTranscriptionStageEvent) {
  trace.mark(event.stage, {
    attempt: event.attempt,
    durationMs: event.durationMs,
    error: event.error,
    model: event.model,
    nextRetryMs: event.nextRetryMs,
    retry: event.retry,
    status: event.status,
    summary: event.summary,
  });
}

async function logInboundStage({
  conversationId,
  error,
  externalMessageId,
  instance,
  messageText,
  metadata,
  remoteId,
  stage,
  userId,
}: {
  conversationId?: string | null;
  error?: string | null;
  externalMessageId: string;
  instance?: string | null;
  messageText?: string | null;
  metadata?: string | null;
  remoteId?: string | null;
  stage: WhatsAppAudioPipelineStage;
  userId?: string | null;
}) {
  const summary = `stage=${stage}${metadata ? ` | ${metadata}` : ""}`;
  console.info("WhatsApp audio pipeline stage", {
    conversationId,
    externalMessageId,
    metadata,
    provider: getEvolutionProviderName(),
    stage,
  });

  await safeUpdateInboundEvent({
    conversationId,
    error: error ?? null,
    externalMessageId,
    instance,
    messageText,
    remoteId,
    status: "received",
    summary,
    userId,
  });
}

async function safeUpdateInboundEvent(parameters: Parameters<typeof updateInboundWhatsAppEvent>[1]) {
  try {
    await updateInboundWhatsAppEvent(
      { supabase: createServiceRoleClient() },
      parameters,
    );
  } catch (error) {
    console.error("WhatsApp inbound event log could not be updated.", error);
  }
}

function getAudioCooldownKey(instanceName: string, remoteNumber: string) {
  return `${instanceName}:${remoteNumber}`;
}

async function enqueueAudioTranscription<T>(key: string, task: () => Promise<T>) {
  const previous = audioTranscriptionQueues.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(task);

  const cleanup = current
    .catch(() => undefined)
    .finally(() => {
      if (audioTranscriptionQueues.get(key) === cleanup) {
      audioTranscriptionQueues.delete(key);
      }
    });

  audioTranscriptionQueues.set(key, cleanup);

  return current;
}

async function waitForAudioCooldowns({
  externalMessageId,
  instance,
  messageText,
  onStage,
  remoteId,
  userId,
  userKey,
}: {
  externalMessageId: string;
  instance?: string | null;
  messageText?: string | null;
  onStage: (stage: WhatsAppAudioPipelineStage) => void;
  remoteId?: string | null;
  userId?: string | null;
  userKey: string;
}) {
  const cooldowns = [
    { label: "global", waitMs: getAudioCooldownWaitMs(globalAudioTranscriptionCooldownKey) },
    { label: "user", waitMs: getAudioCooldownWaitMs(userKey) },
  ].filter((cooldown) => cooldown.waitMs > 0);

  for (const cooldown of cooldowns) {
    onStage("audio_cooldown_wait_started");
    await logInboundStage({
      externalMessageId,
      instance,
      messageText,
      metadata: `scope=${cooldown.label}; waitMs=${cooldown.waitMs}`,
      remoteId,
      stage: "audio_cooldown_wait_started",
      userId,
    });

    await wait(cooldown.waitMs);

    onStage("audio_cooldown_wait_finished");
    await logInboundStage({
      externalMessageId,
      instance,
      messageText,
      metadata: `scope=${cooldown.label}; waitMs=${cooldown.waitMs}`,
      remoteId,
      stage: "audio_cooldown_wait_finished",
      userId,
    });
  }
}

function getAudioCooldownWaitMs(key: string) {
  const waitUntil = audioTranscriptionCooldowns.get(key) ?? 0;
  const waitMs = waitUntil - Date.now();

  if (waitMs <= 0) {
    audioTranscriptionCooldowns.delete(key);
    return 0;
  }

  return waitMs;
}

function setAudioCooldown(key: string, scope: "global" | "user") {
  audioTranscriptionCooldowns.set(key, Date.now() + audioTranscriptionCooldownMs);
  console.warn("[FECHOUMEI_AUDIO_COOLDOWN_SET]", {
    key,
    scope,
    waitMs: audioTranscriptionCooldownMs,
  });
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
