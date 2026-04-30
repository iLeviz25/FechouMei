const defaultTranscriptionModel = "gemini-2.5-flash";
const defaultUploadTimeoutMs = 4500;
const defaultPollingRequestTimeoutMs = 2500;
const defaultFileProcessingTimeoutMs = 5000;
const defaultPrimaryGenerateContentTimeoutMs = 5500;
const defaultFallbackGenerateContentTimeoutMs = 6500;
const defaultTranscriptionTotalBudgetMs = 14000;
const minimumRetryBudgetMs = 3000;
const filePollingAttempts = 8;
const defaultFilePollingIntervalMs = 1000;
const maxTranscriptionAttempts = 2;
const defaultRetryBaseDelayMs = 300;
const generateContentRateLimitRetryBaseDelayMs = 1200;
const retryJitterMs = 150;
const generateContentRateLimitJitterMs = 500;
const defaultInlineAudioMaxBytes = 2 * 1024 * 1024;

export type AudioTranscriptionStage =
  | "primary_timeout"
  | "fallback_started"
  | "fallback_finished"
  | "transcription_primary_attempt_started"
  | "transcription_primary_attempt_finished"
  | "transcription_fallback_attempt_started"
  | "transcription_fallback_attempt_finished"
  | "transcription_attempt_started"
  | "transcription_attempt_finished"
  | "transcription_attempt_aborted_timeout"
  | "transcription_retry_scheduled"
  | "transcription_stage_timeout"
  | "transcription_stage_failed"
  | "transcription_final_success"
  | "transcription_final_failed"
  | "file_upload_started"
  | "file_upload_failed"
  | "file_processing_poll_started"
  | "file_processing_poll_timeout"
  | "file_processing_poll_failed"
  | "generate_content_started"
  | "generate_content_failed"
  | "transcription_empty"
  | "transcription_succeeded";

export type AudioTranscriptionStageEvent = {
  attempt: number;
  apiKeySource?: "dedicated" | "fallback";
  durationMs?: number;
  error?: string;
  model?: string;
  nextRetryMs?: number;
  retry?: boolean;
  stage: AudioTranscriptionStage;
  status?: number;
  summary?: string;
};

type GeminiFileResponse = {
  file?: {
    mimeType?: string;
    name?: string;
    state?: string;
    uri?: string;
  };
  error?: {
    message?: string;
  };
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type TranscriptionAttemptKind = "primary" | "fallback";

export class AudioTranscriptionError extends Error {
  stage?: AudioTranscriptionStage;
  status?: number;
  timedOut?: boolean;
  transient: boolean;

  constructor(message: string, options: {
    stage?: AudioTranscriptionStage;
    status?: number;
    timedOut?: boolean;
    transient?: boolean;
  } = {}) {
    super(message);
    this.name = "AudioTranscriptionError";
    this.stage = options.stage;
    this.status = options.status;
    this.timedOut = options.timedOut;
    this.transient = options.transient ?? false;
  }
}

export async function transcribeAudioWithGemini({
  audio,
  mimeType,
  onStage,
}: {
  audio: Buffer;
  mimeType: string;
  onStage?: (event: AudioTranscriptionStageEvent) => Promise<void> | void;
}) {
  if (typeof window !== "undefined") {
    throw new AudioTranscriptionError("Transcricao de audio so pode rodar no servidor.", {
      stage: "generate_content_failed",
    });
  }

  const startedAt = Date.now();
  const credentials = getGeminiTranscriptionCredentials();
  const transcriptionModels = getGeminiTranscriptionModels();
  const totalBudgetMs = getTranscriptionTotalBudgetMs();

  if (!credentials.apiKey) {
    throw new AudioTranscriptionError("Faltando GEMINI_TRANSCRIPTION_API_KEY ou GEMINI_API_KEY no servidor.", {
      stage: "generate_content_failed",
    });
  }

  let currentModel = transcriptionModels.primary;
  let attemptKind: TranscriptionAttemptKind = "primary";

  for (let attempt = 1; attempt <= maxTranscriptionAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    const remainingBudgetMs = totalBudgetMs - (attemptStartedAt - startedAt);

    if (remainingBudgetMs <= minimumRetryBudgetMs) {
      const error = new AudioTranscriptionError("Tempo maximo de transcricao de audio atingido.", {
        stage: "generate_content_failed",
        timedOut: true,
        transient: false,
      });

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: Date.now() - startedAt,
        error: summarizeTranscriptionError(error),
        model: currentModel,
        retry: false,
        stage: "transcription_final_failed",
      });

      throw error;
    }

    await emitTranscriptionStage(onStage, {
      attempt,
      apiKeySource: credentials.source,
      durationMs: attemptStartedAt - startedAt,
      model: currentModel,
      stage: attemptKind === "primary"
        ? "transcription_primary_attempt_started"
        : "transcription_fallback_attempt_started",
      summary: `remainingBudgetMs=${remainingBudgetMs}`,
    });

    await emitTranscriptionStage(onStage, {
      attempt,
      apiKeySource: credentials.source,
      durationMs: attemptStartedAt - startedAt,
      model: currentModel,
      stage: "transcription_attempt_started",
      summary: `remainingBudgetMs=${remainingBudgetMs}`,
    });

    try {
      const transcription = await transcribeAudioOnce({
        apiKey: credentials.apiKey,
        apiKeySource: credentials.source,
        attempt,
        audio,
        mimeType,
        model: currentModel,
        onStage,
        attemptKind,
        transcriptionStartedAt: startedAt,
      });

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: Date.now() - attemptStartedAt,
        model: currentModel,
        stage: attemptKind === "primary"
          ? "transcription_primary_attempt_finished"
          : "transcription_fallback_attempt_finished",
        summary: "success",
      });

      if (attemptKind === "fallback") {
        await emitTranscriptionStage(onStage, {
          attempt,
          apiKeySource: credentials.source,
          durationMs: Date.now() - attemptStartedAt,
          model: currentModel,
          retry: false,
          stage: "fallback_finished",
          summary: "success",
        });
      }

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: Date.now() - attemptStartedAt,
        model: currentModel,
        stage: "transcription_attempt_finished",
        summary: "success",
      });

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: Date.now() - startedAt,
        model: currentModel,
        stage: "transcription_final_success",
      });

      return transcription;
    } catch (error) {
      const transcriptionError = normalizeAudioTranscriptionError(error);
      const attemptedMs = Date.now() - attemptStartedAt;
      const retryPlan = getNextTranscriptionAttemptPlan({
        attempt,
        attemptKind,
        currentModel,
        error: transcriptionError,
        fallbackModel: transcriptionModels.fallback,
        startedAt,
        totalBudgetMs,
      });

      if (transcriptionError.timedOut) {
        await emitTranscriptionStage(onStage, {
          attempt,
          apiKeySource: credentials.source,
          durationMs: attemptedMs,
          error: summarizeTranscriptionError(transcriptionError),
          model: currentModel,
          retry: false,
          stage: "transcription_attempt_aborted_timeout",
          status: transcriptionError.status,
        });

        if (attemptKind === "primary") {
          await emitTranscriptionStage(onStage, {
            attempt,
            apiKeySource: credentials.source,
            durationMs: attemptedMs,
            error: summarizeTranscriptionError(transcriptionError),
            model: currentModel,
            retry: retryPlan.shouldRetry,
            stage: "primary_timeout",
            status: transcriptionError.status,
            summary: retryPlan.shouldRetry
              ? `nextModel=${retryPlan.nextModel}`
              : retryPlan.reason,
          });
        }
      }

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: attemptedMs,
        error: summarizeTranscriptionError(transcriptionError),
        model: currentModel,
        retry: retryPlan.shouldRetry,
        stage: transcriptionError.timedOut ? "transcription_stage_timeout" : "transcription_stage_failed",
        status: transcriptionError.status,
        summary: `failedStage=${transcriptionError.stage ?? "unknown"}`,
      });

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: attemptedMs,
        error: summarizeTranscriptionError(transcriptionError),
        model: currentModel,
        retry: retryPlan.shouldRetry,
        stage: attemptKind === "primary"
          ? "transcription_primary_attempt_finished"
          : "transcription_fallback_attempt_finished",
        status: transcriptionError.status,
        summary: `failedStage=${transcriptionError.stage ?? "unknown"}`,
      });

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: attemptedMs,
        error: summarizeTranscriptionError(transcriptionError),
        model: currentModel,
        retry: retryPlan.shouldRetry,
        stage: "transcription_attempt_finished",
        status: transcriptionError.status,
      });

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: Date.now() - startedAt,
        error: summarizeTranscriptionError(transcriptionError),
        model: currentModel,
        nextRetryMs: retryPlan.shouldRetry ? retryPlan.nextRetryMs : undefined,
        retry: retryPlan.shouldRetry,
        stage: transcriptionError.stage ?? "generate_content_failed",
        status: transcriptionError.status,
      });

      if (attemptKind === "fallback") {
        await emitTranscriptionStage(onStage, {
          attempt,
          apiKeySource: credentials.source,
          durationMs: attemptedMs,
          error: summarizeTranscriptionError(transcriptionError),
          model: currentModel,
          retry: retryPlan.shouldRetry,
          stage: "fallback_finished",
          status: transcriptionError.status,
          summary: `failedStage=${transcriptionError.stage ?? "unknown"}`,
        });
      }

      if (!retryPlan.shouldRetry) {
        await emitTranscriptionStage(onStage, {
          attempt,
          apiKeySource: credentials.source,
          durationMs: Date.now() - startedAt,
          error: summarizeTranscriptionError(transcriptionError),
          model: currentModel,
          retry: false,
          stage: "transcription_final_failed",
          status: transcriptionError.status,
        });

        throw transcriptionError;
      }

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource: credentials.source,
        durationMs: Date.now() - startedAt,
        error: summarizeTranscriptionError(transcriptionError),
        model: currentModel,
        nextRetryMs: retryPlan.nextRetryMs,
        retry: true,
        stage: "transcription_retry_scheduled",
        status: transcriptionError.status,
        summary: retryPlan.reason,
      });

      if (retryPlan.nextAttemptKind === "fallback") {
        await emitTranscriptionStage(onStage, {
          attempt,
          apiKeySource: credentials.source,
          durationMs: Date.now() - startedAt,
          model: retryPlan.nextModel,
          retry: true,
          stage: "fallback_started",
          summary: `fromModel=${currentModel}; reason=${retryPlan.reason}`,
        });
      }

      currentModel = retryPlan.nextModel;
      attemptKind = retryPlan.nextAttemptKind;

      await wait(retryPlan.nextRetryMs);
    }
  }

  throw new AudioTranscriptionError("Falha inesperada na transcricao de audio.", {
    stage: "generate_content_failed",
  });
}

async function transcribeAudioOnce({
  apiKey,
  apiKeySource,
  attempt,
  attemptKind,
  audio,
  mimeType,
  model,
  onStage,
  transcriptionStartedAt,
}: {
  apiKey: string;
  apiKeySource: "dedicated" | "fallback";
  attempt: number;
  attemptKind: TranscriptionAttemptKind;
  audio: Buffer;
  mimeType: string;
  model: string;
  onStage?: (event: AudioTranscriptionStageEvent) => Promise<void> | void;
  transcriptionStartedAt: number;
}) {
  if (shouldUseInlineGeminiAudio(audio)) {
    try {
      return await transcribeInlineAudioOnce({
        apiKey,
        apiKeySource,
        attempt,
        attemptKind,
        audio,
        mimeType,
        model,
        onStage,
        transcriptionStartedAt,
      });
    } catch (error) {
      const transcriptionError = normalizeAudioTranscriptionError(error);

      if (!shouldFallbackInlineAudioToFileUpload(transcriptionError)) {
        throw error;
      }

      await emitTranscriptionStage(onStage, {
        attempt,
        apiKeySource,
        durationMs: Date.now() - transcriptionStartedAt,
        error: summarizeTranscriptionError(transcriptionError),
        model,
        retry: true,
        stage: "transcription_stage_failed",
        status: transcriptionError.status,
        summary: "inline_audio_fallback_to_file_upload",
      });
    }
  }

  return transcribeFileAudioOnce({
    apiKey,
    apiKeySource,
    attempt,
    attemptKind,
    audio,
    mimeType,
    model,
    onStage,
    transcriptionStartedAt,
  });
}

async function transcribeInlineAudioOnce({
  apiKey,
  apiKeySource,
  attempt,
  attemptKind,
  audio,
  mimeType,
  model,
  onStage,
  transcriptionStartedAt,
}: {
  apiKey: string;
  apiKeySource: "dedicated" | "fallback";
  attempt: number;
  attemptKind: TranscriptionAttemptKind;
  audio: Buffer;
  mimeType: string;
  model: string;
  onStage?: (event: AudioTranscriptionStageEvent) => Promise<void> | void;
  transcriptionStartedAt: number;
}) {
  await emitTranscriptionStage(onStage, {
    attempt,
    apiKeySource,
    model,
    stage: "generate_content_started",
    summary: `inlineAudio=true; mime=${mimeType}; bytes=${audio.length}; model=${model}`,
  });

  const transcription = await requestGeminiTranscription({
    apiKey,
    attemptKind,
    audioPart: {
      inlineData: {
        data: audio.toString("base64"),
        mimeType,
      },
    },
    model,
  });

  if (!transcription) {
    throw new AudioTranscriptionError("A transcricao voltou vazia.", {
      stage: "transcription_empty",
      transient: false,
    });
  }

  await emitTranscriptionStage(onStage, {
    attempt,
    apiKeySource,
    durationMs: Date.now() - transcriptionStartedAt,
    model,
    stage: "transcription_succeeded",
    summary: transcription.slice(0, 120),
  });

  return transcription;
}

async function transcribeFileAudioOnce({
  apiKey,
  apiKeySource,
  attempt,
  attemptKind,
  audio,
  mimeType,
  model,
  onStage,
  transcriptionStartedAt,
}: {
  apiKey: string;
  apiKeySource: "dedicated" | "fallback";
  attempt: number;
  attemptKind: TranscriptionAttemptKind;
  audio: Buffer;
  mimeType: string;
  model: string;
  onStage?: (event: AudioTranscriptionStageEvent) => Promise<void> | void;
  transcriptionStartedAt: number;
}) {
  await emitTranscriptionStage(onStage, {
    attempt,
    apiKeySource,
    model,
    stage: "file_upload_started",
    summary: `mime=${mimeType}; bytes=${audio.length}`,
  });

  const uploadedFile = await uploadGeminiFile({ apiKey, audio, mimeType });

  try {
    await emitTranscriptionStage(onStage, {
      attempt,
      apiKeySource,
      model,
      stage: "file_processing_poll_started",
      summary: uploadedFile.name,
    });

    const activeFile = await waitForGeminiFile({ apiKey, file: uploadedFile });
    await emitTranscriptionStage(onStage, {
      attempt,
      apiKeySource,
      model,
      stage: "generate_content_started",
      summary: `${activeFile.name}; model=${model}`,
    });

    const transcription = await requestGeminiTranscription({
      apiKey,
      attemptKind,
      audioPart: {
        fileData: {
          fileUri: activeFile.uri,
          mimeType: activeFile.mimeType || mimeType,
        },
      },
      model,
    });

    if (!transcription) {
      throw new AudioTranscriptionError("A transcricao voltou vazia.", {
        stage: "transcription_empty",
        transient: false,
      });
    }

    await emitTranscriptionStage(onStage, {
      attempt,
      apiKeySource,
      durationMs: Date.now() - transcriptionStartedAt,
      model,
      stage: "transcription_succeeded",
      summary: transcription.slice(0, 120),
    });

    return transcription;
  } finally {
    void deleteGeminiFile({ apiKey, name: uploadedFile.name });
  }
}

function getGeminiTranscriptionCredentials() {
  const dedicatedApiKey = process.env.GEMINI_TRANSCRIPTION_API_KEY?.trim();
  const fallbackApiKey = process.env.GEMINI_API_KEY?.trim();

  if (dedicatedApiKey) {
    return {
      apiKey: dedicatedApiKey,
      source: "dedicated" as const,
    };
  }

  return {
    apiKey: fallbackApiKey,
    source: "fallback" as const,
  };
}

function getGeminiTranscriptionModels() {
  const primary = process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || defaultTranscriptionModel;
  const fallback = process.env.GEMINI_TRANSCRIPTION_FALLBACK_MODEL?.trim();

  return {
    fallback: fallback && fallback !== primary ? fallback : null,
    primary,
  };
}

async function uploadGeminiFile({
  apiKey,
  audio,
  mimeType,
}: {
  apiKey: string;
  audio: Buffer;
  mimeType: string;
}) {
  const startResponse = await safeFetchTranscription(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
    body: JSON.stringify({
      file: {
        display_name: `fechoumei-whatsapp-audio-${Date.now()}`,
      },
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(audio.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "X-Goog-Upload-Protocol": "resumable",
    },
    method: "POST",
    signal: AbortSignal.timeout(getUploadTimeoutMs()),
    },
    "file_upload_failed",
  );

  if (!startResponse.ok) {
    throw new AudioTranscriptionError(`Gemini Files API falhou ao iniciar upload: ${startResponse.status}`, {
      stage: "file_upload_failed",
      status: startResponse.status,
      transient: isTransientStatus(startResponse.status),
    });
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");

  if (!uploadUrl) {
    throw new AudioTranscriptionError("Gemini Files API nao retornou URL de upload.", {
      stage: "file_upload_failed",
      transient: true,
    });
  }

  const uploadResponse = await safeFetchTranscription(uploadUrl, {
    body: audio,
    cache: "no-store",
    headers: {
      "Content-Length": String(audio.length),
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    method: "POST",
    signal: AbortSignal.timeout(getUploadTimeoutMs()),
  }, "file_upload_failed");

  const payload = (await safeReadJson(uploadResponse, "file_upload_failed")) as GeminiFileResponse;

  if (!uploadResponse.ok || !payload.file?.uri || !payload.file.name) {
    throw new AudioTranscriptionError(`Gemini Files API falhou ao finalizar upload: ${uploadResponse.status}`, {
      stage: "file_upload_failed",
      status: uploadResponse.status,
      transient: isTransientStatus(uploadResponse.status),
    });
  }

  return {
    mimeType: payload.file.mimeType,
    name: payload.file.name,
    state: payload.file.state,
    uri: payload.file.uri,
  };
}

async function waitForGeminiFile({
  apiKey,
  file,
}: {
  apiKey: string;
  file: {
    mimeType?: string;
    name: string;
    state?: string;
    uri: string;
  };
}) {
  if (!file.state || file.state === "ACTIVE") {
    return file;
  }

  let current = file;
  const pollingStartedAt = Date.now();

  for (let attempt = 0; attempt < filePollingAttempts; attempt += 1) {
    if (current.state === "ACTIVE") {
      return current;
    }

    if (Date.now() - pollingStartedAt >= getFileProcessingTimeoutMs()) {
      throw new AudioTranscriptionError("Arquivo de audio nao ficou pronto para transcricao a tempo.", {
        stage: "file_processing_poll_timeout",
        timedOut: true,
        transient: true,
      });
    }

    await wait(getFilePollingIntervalMs());

    const response = await safeFetchTranscription(`https://generativelanguage.googleapis.com/v1beta/${current.name}?key=${apiKey}`, {
      cache: "no-store",
      method: "GET",
      signal: AbortSignal.timeout(getPollingRequestTimeoutMs()),
    }, "file_processing_poll_failed");
    const payload = (await safeReadJson(response, "file_processing_poll_failed")) as GeminiFileResponse;

    if (!response.ok || !payload.file?.uri || !payload.file.name) {
      throw new AudioTranscriptionError(`Gemini Files API falhou ao consultar arquivo: ${response.status}`, {
        stage: "file_processing_poll_failed",
        status: response.status,
        transient: isTransientStatus(response.status),
      });
    }

    current = {
      mimeType: payload.file.mimeType,
      name: payload.file.name,
      state: payload.file.state,
      uri: payload.file.uri,
    };
  }

  throw new AudioTranscriptionError("Arquivo de audio nao ficou pronto para transcricao a tempo.", {
    stage: "file_processing_poll_timeout",
    timedOut: true,
    transient: true,
  });
}

async function requestGeminiTranscription({
  apiKey,
  attemptKind,
  audioPart,
  model,
}: {
  apiKey: string;
  attemptKind: TranscriptionAttemptKind;
  audioPart:
    | {
        fileData: {
          fileUri: string;
          mimeType: string;
        };
      }
    | {
        inlineData: {
          data: string;
          mimeType: string;
        };
      };
  model: string;
}) {
  const response = await safeFetchTranscription(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: [
                "Transcreva o audio em portugues do Brasil.",
                "Retorne somente o texto transcrito.",
                "Nao resuma, nao explique e nao adicione comentarios.",
                "Se uma parte estiver inaudivel, seja conservador e nao invente.",
              ].join(" "),
            },
            audioPart,
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
      },
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    method: "POST",
    signal: AbortSignal.timeout(getGenerateContentTimeoutMs(attemptKind)),
  }, "generate_content_failed");

  const payload = (await safeReadJson(response, "generate_content_failed")) as GeminiGenerateContentResponse;

  if (!response.ok) {
    throw new AudioTranscriptionError(`Gemini falhou ao transcrever audio: ${response.status}`, {
      stage: "generate_content_failed",
      status: response.status,
      transient: isTransientStatus(response.status),
    });
  }

  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim() ?? "";
}

async function deleteGeminiFile({
  apiKey,
  name,
}: {
  apiKey: string;
  name: string;
}) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`, {
      cache: "no-store",
      method: "DELETE",
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    console.error("Gemini audio file cleanup failed", error);
  }
}

async function safeReadJson(response: Response, stage: AudioTranscriptionStage) {
  try {
    return await response.json();
  } catch (error) {
    throw new AudioTranscriptionError(`Resposta invalida da Gemini: ${error instanceof Error ? error.message : "erro inesperado"}`, {
      stage,
      status: response.status,
      transient: true,
    });
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeFetchTranscription(
  input: RequestInfo | URL,
  init: RequestInit,
  stage: AudioTranscriptionStage,
) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const timedOut = isTimeoutError(error);
    throw new AudioTranscriptionError(
      timedOut
        ? "Timeout ao processar audio na Gemini."
        : `Falha de rede na transcricao: ${error instanceof Error ? error.message : "erro inesperado"}`,
      {
        stage: getTimeoutStage(stage),
        timedOut,
        transient: true,
      },
    );
  }
}

async function emitTranscriptionStage(
  onStage: ((event: AudioTranscriptionStageEvent) => Promise<void> | void) | undefined,
  event: AudioTranscriptionStageEvent,
) {
  try {
    await onStage?.(event);
  } catch (error) {
    console.error("Audio transcription stage hook failed", error);
  }
}

function normalizeAudioTranscriptionError(error: unknown) {
  if (error instanceof AudioTranscriptionError) {
    return error;
  }

  const timedOut = isTimeoutError(error);
  return new AudioTranscriptionError(
    timedOut ? "Timeout ao processar audio na Gemini." : error instanceof Error ? error.message : "Erro inesperado na transcricao.",
    {
      stage: timedOut ? "generate_content_failed" : "generate_content_failed",
      timedOut,
      transient: true,
    },
  );
}

function summarizeTranscriptionError(error: AudioTranscriptionError) {
  return error.message.replace(/\s+/g, " ").slice(0, 180);
}

function isTransientStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isTimeoutError(error: unknown) {
  return error instanceof DOMException && error.name === "TimeoutError";
}

function getTimeoutStage(stage: AudioTranscriptionStage): AudioTranscriptionStage {
  return stage === "file_processing_poll_failed" ? "file_processing_poll_timeout" : stage;
}

function getTranscriptionBackoffMs(attempt: number, error: AudioTranscriptionError) {
  const configuredBaseDelay = Number.parseInt(process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS?.trim() ?? "", 10);
  const isGenerateContentRateLimit = error.stage === "generate_content_failed" && error.status === 429;
  const defaultBaseDelay = isGenerateContentRateLimit
    ? generateContentRateLimitRetryBaseDelayMs
    : defaultRetryBaseDelayMs;
  const baseDelay = Number.isFinite(configuredBaseDelay) && configuredBaseDelay >= 0 ? configuredBaseDelay : defaultBaseDelay;
  const exponentialDelay = baseDelay * (2 ** (attempt - 1));
  const maxJitter = isGenerateContentRateLimit ? generateContentRateLimitJitterMs : retryJitterMs;
  const jitter = baseDelay === 0 ? 0 : Math.floor(Math.random() * maxJitter);

  return exponentialDelay + jitter;
}

function getNextTranscriptionAttemptPlan({
  attempt,
  attemptKind,
  currentModel,
  error,
  fallbackModel,
  startedAt,
  totalBudgetMs,
}: {
  attempt: number;
  attemptKind: TranscriptionAttemptKind;
  currentModel: string;
  error: AudioTranscriptionError;
  fallbackModel: string | null;
  startedAt: number;
  totalBudgetMs: number;
}) {
  if (!error.transient || attempt >= maxTranscriptionAttempts) {
    return {
      nextAttemptKind: attemptKind,
      nextModel: currentModel,
      nextRetryMs: 0,
      reason: "not_retryable",
      shouldRetry: false,
    };
  }

  const canUseFallbackModel = attemptKind === "primary" && fallbackModel && isFallbackModelEligible(error);
  const nextModel = canUseFallbackModel ? fallbackModel : currentModel;
  const nextAttemptKind = canUseFallbackModel ? "fallback" : attemptKind;
  const nextRetryMs = canUseFallbackModel
    ? getFallbackModelDelayMs(error)
    : getTranscriptionBackoffMs(attempt, error);

  if (error.status === 429 && !canUseFallbackModel) {
    return {
      nextAttemptKind,
      nextModel,
      nextRetryMs: 0,
      reason: "rate_limited_without_fallback_model",
      shouldRetry: false,
    };
  }

  if (error.timedOut && !canUseFallbackModel) {
    return {
      nextAttemptKind,
      nextModel,
      nextRetryMs: 0,
      reason: "timeout_without_fallback_model",
      shouldRetry: false,
    };
  }

  const remainingAfterDelayMs = totalBudgetMs - (Date.now() - startedAt) - nextRetryMs;

  return {
    nextAttemptKind,
    nextModel,
    nextRetryMs,
    reason: canUseFallbackModel ? "fallback_model" : "same_model_retry",
    shouldRetry: remainingAfterDelayMs >= minimumRetryBudgetMs,
  };
}

function isFallbackModelEligible(error: AudioTranscriptionError) {
  return error.timedOut || error.status === 429 || error.transient;
}

function getFallbackModelDelayMs(error: AudioTranscriptionError) {
  if (error.status === 429) {
    return 1500 + Math.floor(Math.random() * 750);
  }

  return 0;
}

function shouldUseInlineGeminiAudio(audio: Buffer) {
  return audio.length <= getInlineAudioMaxBytes();
}

function shouldFallbackInlineAudioToFileUpload(error: AudioTranscriptionError) {
  return error.stage === "generate_content_failed" && (error.status === 400 || error.status === 413);
}

function getInlineAudioMaxBytes() {
  const configuredMaxBytes = Number.parseInt(process.env.GEMINI_TRANSCRIPTION_INLINE_MAX_BYTES?.trim() ?? "", 10);

  return Number.isFinite(configuredMaxBytes) && configuredMaxBytes >= 0
    ? configuredMaxBytes
    : defaultInlineAudioMaxBytes;
}

function getFilePollingIntervalMs() {
  const configuredInterval = Number.parseInt(process.env.GEMINI_TRANSCRIPTION_POLL_INTERVAL_MS?.trim() ?? "", 10);

  return Number.isFinite(configuredInterval) && configuredInterval >= 0
    ? configuredInterval
    : defaultFilePollingIntervalMs;
}

function getUploadTimeoutMs() {
  const configuredTimeout = Number.parseInt(
    process.env.GEMINI_TRANSCRIPTION_UPLOAD_TIMEOUT_MS?.trim() ??
      process.env.GEMINI_TRANSCRIPTION_REQUEST_TIMEOUT_MS?.trim() ??
      "",
    10,
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout >= 3000
    ? configuredTimeout
    : defaultUploadTimeoutMs;
}

function getPollingRequestTimeoutMs() {
  const configuredTimeout = Number.parseInt(
    process.env.GEMINI_TRANSCRIPTION_POLL_REQUEST_TIMEOUT_MS?.trim() ??
      process.env.GEMINI_TRANSCRIPTION_REQUEST_TIMEOUT_MS?.trim() ??
      "",
    10,
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout >= 2000
    ? configuredTimeout
    : defaultPollingRequestTimeoutMs;
}

function getFileProcessingTimeoutMs() {
  const configuredTimeout = Number.parseInt(process.env.GEMINI_TRANSCRIPTION_FILE_PROCESSING_TIMEOUT_MS?.trim() ?? "", 10);

  return Number.isFinite(configuredTimeout) && configuredTimeout >= 4000
    ? configuredTimeout
    : defaultFileProcessingTimeoutMs;
}

function getGenerateContentTimeoutMs(attemptKind: TranscriptionAttemptKind) {
  const attemptSpecificTimeout =
    attemptKind === "primary"
      ? process.env.GEMINI_TRANSCRIPTION_PRIMARY_TIMEOUT_MS?.trim()
      : process.env.GEMINI_TRANSCRIPTION_FALLBACK_TIMEOUT_MS?.trim();
  const configuredTimeout = Number.parseInt(
    attemptSpecificTimeout ??
      process.env.GEMINI_TRANSCRIPTION_GENERATE_TIMEOUT_MS?.trim() ??
      process.env.GEMINI_TRANSCRIPTION_REQUEST_TIMEOUT_MS?.trim() ??
      "",
    10,
  );

  return Number.isFinite(configuredTimeout) && configuredTimeout >= 5000
    ? configuredTimeout
    : attemptKind === "primary"
      ? defaultPrimaryGenerateContentTimeoutMs
      : defaultFallbackGenerateContentTimeoutMs;
}

function getTranscriptionTotalBudgetMs() {
  const configuredTimeout = Number.parseInt(process.env.GEMINI_TRANSCRIPTION_TOTAL_TIMEOUT_MS?.trim() ?? "", 10);

  return Number.isFinite(configuredTimeout) && configuredTimeout >= 8000
    ? configuredTimeout
    : defaultTranscriptionTotalBudgetMs;
}
