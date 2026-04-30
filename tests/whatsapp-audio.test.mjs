import assert from "node:assert/strict";
import test from "node:test";
import {
  markWhatsAppMessageAsRead,
  normalizeEvolutionWebhookPayload,
  sendWhatsAppTypingIndicator,
} from "../lib/channels/whatsapp/evolution.ts";
import {
  WhatsAppMediaDownloadError,
  WhatsAppUnsupportedAudioError,
  downloadWhatsAppAudio,
} from "../lib/channels/whatsapp/media.ts";
import {
  AudioTranscriptionError,
  transcribeAudioWithGemini,
} from "../lib/agent/transcription.ts";
import { parseSpokenNumberPtBr } from "../lib/agent/spoken-number.ts";
import { normalizeSpokenAgentMessage } from "../lib/agent/spoken-text.ts";
import { inferSemanticTransactionType } from "../lib/agent/transaction-semantics.ts";
import {
  getReliableMovementMissingFields,
  isUsefulMovementDescription,
} from "../lib/agent/draft-sufficiency.ts";

const config = {
  allowedRemoteNumber: "5511999999999",
  enabled: true,
  evolutionApiKey: "test-key",
  evolutionApiUrl: "http://evolution.test",
  instanceName: "fechoumei-local",
  maxReplyLength: 900,
  testUserId: "user-id",
};

test("envia indicador de digitando pela Evolution", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });
      return new Response(null, { status: 200 });
    };

    await sendWhatsAppTypingIndicator({
      config,
      remoteNumber: "5511999999999",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://evolution.test/chat/sendPresence/fechoumei-local");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.apikey, "test-key");

    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.number, "5511999999999");
    assert.equal(body.presence, "composing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("marca mensagem inbound como lida pela Evolution", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });
      return new Response(null, { status: 200 });
    };

    await markWhatsAppMessageAsRead({
      config,
      externalMessageId: "message-1",
      remoteJid: "5511999999999@s.whatsapp.net",
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://evolution.test/chat/markMessageAsRead/fechoumei-local");
    assert.equal(calls[0].init.method, "POST");

    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.readMessages, [
      {
        fromMe: false,
        id: "message-1",
        remoteJid: "5511999999999@s.whatsapp.net",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizacao de fala preserva acoes compostas com conector claro", () => {
  const normalized = normalizeSpokenAgentMessage("tipo recebi 500 de venda também paguei 120 de internet pra mim");

  assert.equal(normalized, "recebi 500 de venda e paguei 120 de internet");
});

test("normalizacao de fala remove ruido leve sem apagar intencao", () => {
  const normalized = normalizeSpokenAgentMessage("olha tipo registra ai 90 reais de internet entendeu");

  assert.equal(normalized, "registra 90 reais de internet");
});

test("normalizacao de fala natural remove abertura sem apagar o nucleo", () => {
  assert.equal(
    normalizeSpokenAgentMessage("ó, me ajuda aí a lançar uma despesa de 120 de alimentação"),
    "lançar uma despesa de 120 de alimentação",
  );
  assert.equal(
    normalizeSpokenAgentMessage("olha, eu recebi 500 reais da minha cliente hoje"),
    "eu recebi 500 reais da minha cliente hoje",
  );
});

test("semantica identifica entrada por classes de verbo e contexto", () => {
  assert.equal(inferSemanticTransactionType("veio 500 do cliente Ana", { hasAmount: true }), "entrada");
  assert.equal(inferSemanticTransactionType("registrar 2500 reais em venda", { hasAmount: true }), "entrada");
  assert.equal(inferSemanticTransactionType("cadastra 800 de consultoria", { hasAmount: true }), "entrada");
  assert.equal(inferSemanticTransactionType("bota 350 da soso como entrada", { hasAmount: true }), "entrada");
  assert.equal(inferSemanticTransactionType("caiu 500 de uma venda", { hasAmount: true }), "entrada");
});

test("semantica identifica despesa por classes de verbo e contexto", () => {
  assert.equal(inferSemanticTransactionType("descontou 90 de internet", { hasAmount: true }), "despesa");
  assert.equal(inferSemanticTransactionType("lanca 350 de material", { hasAmount: true }), "despesa");
  assert.equal(inferSemanticTransactionType("coloca 120 telefone", { hasAmount: true }), "despesa");
  assert.equal(inferSemanticTransactionType("registra 89,90 de gasolina", { hasAmount: true }), "despesa");
  assert.equal(inferSemanticTransactionType("foi 90 de transporte", { hasAmount: true }), "despesa");
  assert.equal(inferSemanticTransactionType("comprei material e deu 350", { hasAmount: true }), "despesa");
});

test("semantica preserva casos aprovados e evita consulta sem valor", () => {
  assert.equal(inferSemanticTransactionType("recebi 500 do Joao", { hasAmount: true }), "entrada");
  assert.equal(inferSemanticTransactionType("paguei 120 de internet", { hasAmount: true }), "despesa");
  assert.equal(inferSemanticTransactionType("me mostra minhas entradas", { hasAmount: false }), null);
});

test("suficiencia de rascunho bloqueia descricao operacional ou vazia", () => {
  assert.equal(isUsefulMovementDescription("Pode uma de ?"), false);
  assert.equal(isUsefulMovementDescription("ontem"), false);
  assert.equal(isUsefulMovementDescription("hoje"), false);
  assert.equal(isUsefulMovementDescription("internet"), true);
  assert.deepEqual(
    getReliableMovementMissingFields({
      amount: 500,
      category: "Outro",
      description: "Pode uma de ?",
      occurred_on: "2026-04-19",
      type: "entrada",
    }),
    ["description"],
  );
});

test("suficiencia aceita rascunho com contexto util e categoria confiavel", () => {
  assert.deepEqual(
    getReliableMovementMissingFields({
      amount: 120,
      category: "Servico",
      description: "internet",
      occurred_on: "2026-04-19",
      type: "despesa",
    }),
    [],
  );
});

test("parser de numero falado entende valores comuns de audio", () => {
  assert.equal(parseSpokenNumberPtBr("quinhentos reais"), 500);
  assert.equal(parseSpokenNumberPtBr("cento e vinte de internet"), 120);
  assert.equal(parseSpokenNumberPtBr("trezentos e cinquenta com material"), 350);
  assert.equal(parseSpokenNumberPtBr("dois mil e quinhentos reais em venda"), 2500);
  assert.equal(parseSpokenNumberPtBr("recebi de um cliente"), null);
});

test("normaliza payload textual da Evolution sem marcar audio", () => {
  const normalized = normalizeEvolutionWebhookPayload({
    data: {
      key: {
        id: "text-1",
        remoteJid: "5511999999999@s.whatsapp.net",
      },
      message: {
        conversation: "Como esta meu mes?",
      },
      messageType: "conversation",
    },
    event: "messages.upsert",
    instance: "fechoumei-local",
  });

  assert.equal(normalized.externalMessageId, "text-1");
  assert.equal(normalized.messageType, "conversation");
  assert.equal(normalized.text, "Como esta meu mes?");
  assert.equal(normalized.audio, null);
});

test("reconhece payload de audio com metadata minima", () => {
  const normalized = normalizeEvolutionWebhookPayload({
    data: {
      key: {
        id: "audio-1",
        remoteJid: "5511999999999@s.whatsapp.net",
      },
      message: {
        audioMessage: {
          fileLength: "1234",
          mimetype: "audio/ogg; codecs=opus",
          seconds: 9,
        },
      },
      messageType: "audioMessage",
    },
    event: "messages.upsert",
    instance: "fechoumei-local",
  });

  assert.equal(normalized.text, null);
  assert.equal(normalized.audio?.externalMessageId, "audio-1");
  assert.equal(normalized.audio?.mimeType, "audio/ogg; codecs=opus");
  assert.equal(normalized.audio?.seconds, 9);
  assert.equal(normalized.audio?.sizeBytes, 1234);
  assert.equal(normalized.audio?.downloadPayload?.messageType, "audioMessage");
});

test("baixa audio quando o webhook ja traz base64", async () => {
  const downloaded = await downloadWhatsAppAudio({
    audio: {
      base64: Buffer.from("audio fake").toString("base64"),
      externalMessageId: "audio-2",
      mimeType: "audio/ogg",
      remoteJid: "5511999999999@s.whatsapp.net",
    },
    config,
  });

  assert.equal(downloaded.buffer.toString(), "audio fake");
  assert.equal(downloaded.mimeType, "audio/ogg");
});

test("falha de download da Evolution vira erro tipado", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("erro", { status: 500 });

  try {
    await assert.rejects(
      () =>
        downloadWhatsAppAudio({
          audio: {
            downloadPayload: {
              key: {
                id: "audio-3",
                remoteJid: "5511999999999@s.whatsapp.net",
              },
              message: {
                audioMessage: {
                  mimetype: "audio/ogg",
                },
              },
            },
            externalMessageId: "audio-3",
            mimeType: "audio/ogg",
            remoteJid: "5511999999999@s.whatsapp.net",
          },
          config,
        }),
      WhatsAppMediaDownloadError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mime type nao suportado de audio falha antes de baixar", async () => {
  await assert.rejects(
    () =>
      downloadWhatsAppAudio({
        audio: {
          base64: Buffer.from("fake").toString("base64"),
          externalMessageId: "audio-4",
          mimeType: "image/png",
          remoteJid: "5511999999999@s.whatsapp.net",
        },
        config,
      }),
    WhatsAppUnsupportedAudioError,
  );
});

test("transcricao com Gemini usa upload temporario e retorna texto limpo", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalTranscriptionApiKey = process.env.GEMINI_TRANSCRIPTION_API_KEY;
  const originalTextModel = process.env.GEMINI_MODEL;
  const originalTranscriptionModel = process.env.GEMINI_TRANSCRIPTION_MODEL;
  const calls = [];
  process.env.GEMINI_API_KEY = "gemini-text-key";
  process.env.GEMINI_TRANSCRIPTION_API_KEY = "gemini-audio-key";
  process.env.GEMINI_MODEL = "gemini-text-model";
  process.env.GEMINI_TRANSCRIPTION_MODEL = "gemini-3.1-flash-lite-preview";

  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });

      if (String(url).includes("/upload/v1beta/files")) {
        return new Response(null, {
          headers: {
            "x-goog-upload-url": "http://upload.test/file",
          },
          status: 200,
        });
      }

      if (String(url) === "http://upload.test/file") {
        return Response.json({
          file: {
            mimeType: "audio/ogg",
            name: "files/audio-test",
            state: "ACTIVE",
            uri: "gemini://files/audio-test",
          },
        });
      }

      if (String(url).includes(":generateContent")) {
        return Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: "paguei 120 de internet" }],
              },
            },
          ],
        });
      }

      return new Response(null, { status: 200 });
    };

    const text = await transcribeAudioWithGemini({
      audio: Buffer.from("audio fake"),
      mimeType: "audio/ogg",
    });

    assert.equal(text, "paguei 120 de internet");
    assert.equal(calls.some((call) => call.url.includes(":generateContent")), true);
    assert.equal(calls.some((call) => call.url.includes("/models/gemini-3.1-flash-lite-preview:generateContent")), true);
    assert.equal(calls.some((call) => call.url.includes("key=gemini-audio-key")), true);
    assert.equal(calls.some((call) => call.url.includes("key=gemini-text-key")), false);
    assert.equal(calls.some((call) => call.url.includes("/models/gemini-text-model:generateContent")), false);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_API_KEY = originalTranscriptionApiKey;
    process.env.GEMINI_MODEL = originalTextModel;
    process.env.GEMINI_TRANSCRIPTION_MODEL = originalTranscriptionModel;
  }
});

test("transcricao usa tentativa extra com modelo fallback em erro 429 no generateContent", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalRetryBase = process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS;
  const originalTranscriptionModel = process.env.GEMINI_TRANSCRIPTION_MODEL;
  const originalFallbackModel = process.env.GEMINI_TRANSCRIPTION_FALLBACK_MODEL;
  const calls = [];
  const stages = [];
  let generateAttempts = 0;
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = "0";
  process.env.GEMINI_TRANSCRIPTION_MODEL = "gemini-primary-test";
  process.env.GEMINI_TRANSCRIPTION_FALLBACK_MODEL = "gemini-fallback-test";

  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ init, url: String(url) });

      if (String(url).includes("/upload/v1beta/files")) {
        return new Response(null, {
          headers: {
            "x-goog-upload-url": `http://upload.test/file-${calls.length}`,
          },
          status: 200,
        });
      }

      if (String(url).startsWith("http://upload.test/file")) {
        return Response.json({
          file: {
            mimeType: "audio/ogg",
            name: `files/audio-test-${calls.length}`,
            state: "ACTIVE",
            uri: `gemini://files/audio-test-${calls.length}`,
          },
        });
      }

      if (String(url).includes(":generateContent")) {
        generateAttempts += 1;

        if (generateAttempts === 1) {
          return Response.json({ error: { message: "quota" } }, { status: 429 });
        }

        return Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: "registrar dois mil e quinhentos reais em venda" }],
              },
            },
          ],
        });
      }

      return new Response(null, { status: 200 });
    };

    const text = await transcribeAudioWithGemini({
      audio: Buffer.from("audio fake"),
      mimeType: "audio/ogg",
      onStage: (event) => {
        stages.push(event);
      },
    });

    assert.equal(text, "registrar dois mil e quinhentos reais em venda");
    assert.equal(generateAttempts, 2);
    assert.equal(calls.some((call) => call.url.includes("/models/gemini-primary-test:generateContent")), true);
    assert.equal(calls.some((call) => call.url.includes("/models/gemini-fallback-test:generateContent")), true);
    assert.equal(stages.filter((event) => event.stage === "generate_content_failed" && event.retry === true && event.status === 429).length, 1);
    assert.equal(stages.some((event) => event.stage === "transcription_fallback_attempt_started" && event.model === "gemini-fallback-test"), true);
    assert.equal(stages.some((event) => event.stage === "transcription_succeeded" && event.attempt === 2), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = originalRetryBase;
    process.env.GEMINI_TRANSCRIPTION_MODEL = originalTranscriptionModel;
    process.env.GEMINI_TRANSCRIPTION_FALLBACK_MODEL = originalFallbackModel;
  }
});

test("timeout na transcricao registra stage amigavel", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalRetryBase = process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS;
  const stages = [];
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = "0";

  try {
    globalThis.fetch = async () => {
      throw new DOMException("tempo esgotado", "TimeoutError");
    };

    await assert.rejects(
      () =>
        transcribeAudioWithGemini({
          audio: Buffer.from("audio fake"),
          mimeType: "audio/ogg",
          onStage: (event) => {
            stages.push(event);
          },
        }),
      (error) =>
        error instanceof AudioTranscriptionError &&
        error.stage === "file_upload_failed" &&
        error.timedOut === true,
    );

    assert.equal(stages.some((event) => event.stage === "file_upload_failed"), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = originalRetryBase;
  }
});

test("timeout no generateContent nao inicia retry caro", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalRetryBase = process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS;
  const stages = [];
  let generateAttempts = 0;
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = "0";

  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes("/upload/v1beta/files")) {
        return new Response(null, {
          headers: {
            "x-goog-upload-url": "http://upload.test/file",
          },
          status: 200,
        });
      }

      if (String(url) === "http://upload.test/file") {
        return Response.json({
          file: {
            mimeType: "audio/ogg",
            name: "files/audio-test",
            state: "ACTIVE",
            uri: "gemini://files/audio-test",
          },
        });
      }

      if (String(url).includes(":generateContent")) {
        generateAttempts += 1;
        throw new DOMException("tempo esgotado", "TimeoutError");
      }

      return new Response(null, { status: 200 });
    };

    await assert.rejects(
      () =>
        transcribeAudioWithGemini({
          audio: Buffer.from("audio fake"),
          mimeType: "audio/ogg",
          onStage: (event) => {
            stages.push(event);
          },
        }),
      (error) =>
        error instanceof AudioTranscriptionError &&
        error.stage === "generate_content_failed" &&
        error.timedOut === true,
    );

    assert.equal(generateAttempts, 1);
    assert.equal(stages.some((event) => event.stage === "transcription_attempt_aborted_timeout"), true);
    assert.equal(stages.some((event) => event.stage === "transcription_final_failed" && event.retry === false), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = originalRetryBase;
  }
});

test("transcricao tenta novamente em 429 no upload de arquivo", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalRetryBase = process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS;
  const stages = [];
  let uploadStartAttempts = 0;
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = "0";

  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/upload/v1beta/files")) {
        uploadStartAttempts += 1;

        if (uploadStartAttempts === 1) {
          return Response.json({ error: { message: "quota" } }, { status: 429 });
        }

        return new Response(null, {
          headers: {
            "x-goog-upload-url": "http://upload.test/file",
          },
          status: 200,
        });
      }

      if (String(url) === "http://upload.test/file") {
        return Response.json({
          file: {
            mimeType: "audio/ogg",
            name: "files/audio-test",
            state: "ACTIVE",
            uri: "gemini://files/audio-test",
          },
        });
      }

      if (String(url).includes(":generateContent")) {
        return Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: "registrar 2500 reais em venda" }],
              },
            },
          ],
        });
      }

      return new Response(null, { status: 200 });
    };

    const text = await transcribeAudioWithGemini({
      audio: Buffer.from("audio fake"),
      mimeType: "audio/ogg",
      onStage: (event) => {
        stages.push(event);
      },
    });

    assert.equal(text, "registrar 2500 reais em venda");
    assert.equal(uploadStartAttempts, 2);
    assert.equal(stages.some((event) => event.stage === "file_upload_failed" && event.status === 429 && event.retry === true), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = originalRetryBase;
  }
});

test("transcricao tenta novamente em 429 no polling do arquivo", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalRetryBase = process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS;
  const originalPollInterval = process.env.GEMINI_TRANSCRIPTION_POLL_INTERVAL_MS;
  const stages = [];
  let pollAttempts = 0;
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = "0";
  process.env.GEMINI_TRANSCRIPTION_POLL_INTERVAL_MS = "0";

  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/upload/v1beta/files")) {
        return new Response(null, {
          headers: {
            "x-goog-upload-url": "http://upload.test/file",
          },
          status: 200,
        });
      }

      if (String(url) === "http://upload.test/file") {
        return Response.json({
          file: {
            mimeType: "audio/ogg",
            name: "files/audio-test",
            state: pollAttempts === 0 ? "PROCESSING" : "ACTIVE",
            uri: "gemini://files/audio-test",
          },
        });
      }

      if (String(url).includes("/v1beta/files/audio-test") && init?.method === "GET") {
        pollAttempts += 1;

        if (pollAttempts === 1) {
          return Response.json({ error: { message: "quota" } }, { status: 429 });
        }

        return Response.json({
          file: {
            mimeType: "audio/ogg",
            name: "files/audio-test",
            state: "ACTIVE",
            uri: "gemini://files/audio-test",
          },
        });
      }

      if (String(url).includes(":generateContent")) {
        return Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: "registrar 2.500 reais em venda" }],
              },
            },
          ],
        });
      }

      return new Response(null, { status: 200 });
    };

    const text = await transcribeAudioWithGemini({
      audio: Buffer.from("audio fake"),
      mimeType: "audio/ogg",
      onStage: (event) => {
        stages.push(event);
      },
    });

    assert.equal(text, "registrar 2.500 reais em venda");
    assert.equal(pollAttempts, 1);
    assert.equal(stages.some((event) => event.stage === "file_processing_poll_failed" && event.status === 429 && event.retry === true), true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = originalRetryBase;
    process.env.GEMINI_TRANSCRIPTION_POLL_INTERVAL_MS = originalPollInterval;
  }
});

test("falha da Gemini na transcricao vira erro tipado", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalRetryBase = process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS;
  process.env.GEMINI_API_KEY = "gemini-test-key";
  process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = "0";

  try {
    globalThis.fetch = async () => Response.json({ error: { message: "quota" } }, { status: 429 });

    await assert.rejects(
      () =>
        transcribeAudioWithGemini({
          audio: Buffer.from("audio fake"),
          mimeType: "audio/ogg",
        }),
      AudioTranscriptionError,
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_TRANSCRIPTION_RETRY_BASE_MS = originalRetryBase;
  }
});
