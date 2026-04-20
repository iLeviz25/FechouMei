import { runAgentTurnForContext } from "@/lib/agent/orchestrator";
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
import {
  WhatsAppMediaDownloadError,
  WhatsAppUnsupportedAudioError,
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
  sendWhatsAppTypingIndicator,
  sendWhatsAppTextReply,
} from "@/lib/channels/whatsapp/evolution";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const genericFallbackReply = "Tive uma instabilidade agora para processar isso. Tente novamente em instantes.";
const audioFallbackReply = "Tive uma instabilidade para entender esse audio agora. Pode repetir o audio ou me mandar em texto?";
const audioTranscriptionCooldownMs = 45000;
const whatsappTypingPresenceDelayMs = 4000;
const whatsappTypingKeepaliveIntervalMs = 2500;
const whatsappTypingKeepaliveMaxMs = 28000;
const globalAudioTranscriptionCooldownKey = "global";
const audioTranscriptionCooldowns = new Map<string, number>();
const audioTranscriptionQueues = new Map<string, Promise<unknown>>();

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

    trace.mark("action_execution_started", {
      conversationId,
    });
    const result = await runAgentTurnForContext({
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
    trace.mark("orchestration_finished", {
      conversationId,
    });

    trace.mark("response_send_started");
    presenceController?.stop("response_send_started");
    trace.mark("provider_send_request_started", {
      channel: "whatsapp",
    });
    await sendWhatsAppTextReply({
      config,
      remoteNumber,
      reply: result.reply,
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
      summary: getProcessedSummary(result.reply, audioWasTranscribed, agentInputText),
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
