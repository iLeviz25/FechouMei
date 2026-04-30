import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const filePath = resolve(args.file ?? "tests/fixtures/whatsapp-import-sample.csv");
const webhookUrl = args.url ?? "http://localhost:3000/api/channels/whatsapp/evolution";
const remoteJid = args.remote ?? process.env.WHATSAPP_SIM_REMOTE_JID;
const instance = args.instance ?? process.env.EVOLUTION_API_INSTANCE ?? "local";
const textMessage = args.text;

if (!remoteJid) {
  console.error("Informe --remote 5511999999999@s.whatsapp.net ou defina WHATSAPP_SIM_REMOTE_JID.");
  process.exit(1);
}

const payload = {
  data: {
    key: {
      fromMe: false,
      id: `simulate-${Date.now()}`,
      remoteJid,
    },
    message: textMessage ? { conversation: textMessage } : await buildDocumentMessage(filePath),
    messageType: textMessage ? "conversation" : "documentMessage",
  },
  event: "messages.upsert",
  instance,
};

const response = await fetch(webhookUrl, {
  body: JSON.stringify(payload),
  headers: {
    "Content-Type": "application/json",
  },
  method: "POST",
});

const body = await response.text();
console.log(`POST ${webhookUrl}`);
console.log(`Status: ${response.status}`);
console.log(body);

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!value.startsWith("--")) {
      continue;
    }

    result[value.slice(2)] = values[index + 1];
    index += 1;
  }

  return result;
}

function getMimeType(fileName) {
  const extension = extname(fileName).toLowerCase();

  if (extension === ".csv") {
    return "text/csv";
  }

  if (extension === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return "application/octet-stream";
}

async function buildDocumentMessage(path) {
  const fileName = basename(path);
  const mimeType = getMimeType(fileName);
  const bytes = await readFile(path);

  return {
    documentMessage: {
      base64: bytes.toString("base64"),
      fileLength: bytes.length,
      fileName,
      mimetype: mimeType,
    },
  };
}
