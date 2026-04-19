# Parte 2C - WhatsApp local com Evolution API

Esta primeira base da 2C foi pensada para teste local, com um único número de WhatsApp ligado a um único `user_id` real do FechouMEI.

## O que entra nesta rodada

- Evolution API local via Docker
- texto inbound do WhatsApp para o agente
- texto outbound do agente para o WhatsApp
- conversa persistida no Supabase reaproveitando o agente atual
- deduplicação mínima de inbound
- logs mínimos do canal

## O que fica fora do escopo agora

- produção
- múltiplos usuários reais
- login por WhatsApp
- onboarding por WhatsApp
- mídia, áudio, documentos e grupos
- Cloud API oficial

## 1. Variáveis do app

Preencha no seu `.env.local`:

```env
WHATSAPP_CHANNEL_ENABLED=true
WHATSAPP_TEST_USER_ID=seu-user-id-real-no-supabase
WHATSAPP_TEST_REMOTE_NUMBER=5511999999999
WHATSAPP_MAX_REPLY_LENGTH=900
EVOLUTION_API_BASE_URL=http://127.0.0.1:8080
EVOLUTION_API_KEY=change-me
EVOLUTION_API_INSTANCE=fechoumei-local
```

## 2. Variáveis da Evolution local

Copie `docker/evolution/.env.example` para `docker/evolution/.env` e ajuste os valores.

## 3. Subir a Evolution local

No PowerShell:

```powershell
cd C:\Users\andre\Documents\FechouMEI\docker\evolution
Copy-Item .env.example .env -ErrorAction SilentlyContinue
docker compose up -d
```

Isso sobe:

- `evolution-api` em `http://localhost:8080`
- `postgres`
- `redis`

## 4. Criar a instância local

```powershell
$headers = @{
  apikey = "change-me"
  "Content-Type" = "application/json"
}

$body = @{
  instanceName = "fechoumei-local"
  integration = "WHATSAPP-BAILEYS"
  qrcode = $true
  token = "change-me"
  rejectCall = $true
  groupsIgnore = $true
  alwaysOnline = $false
  readMessages = $false
  readStatus = $false
  syncFullHistory = $false
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8080/instance/create" `
  -Headers $headers `
  -Body $body
```

## 5. Apontar o webhook para o app

Com o app rodando localmente em `http://localhost:3000`:

```powershell
$webhookBody = @{
  url = "http://host.docker.internal:3000/api/channels/whatsapp/evolution"
  events = @("MESSAGES_UPSERT")
  webhook_by_events = $false
  webhook_base64 = $false
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8080/webhook/set/fechoumei-local" `
  -Headers $headers `
  -Body $webhookBody
```

## 6. Conectar seu WhatsApp

Você pode usar QR ou código de pareamento:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/instance/connect/fechoumei-local" `
  -Headers @{ apikey = "change-me" }
```

O retorno traz o material para conexão da instância. Depois, valide o estado:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:8080/instance/connectionState/fechoumei-local" `
  -Headers @{ apikey = "change-me" }
```

O esperado é o estado `open`.

## 7. Fluxo esperado do canal

1. Evolution envia `MESSAGES_UPSERT` para `app/api/channels/whatsapp/evolution/route.ts`
2. O adapter normaliza a mensagem
3. O número de teste é validado contra `WHATSAPP_TEST_REMOTE_NUMBER`
4. A conversa do agente é carregada no canal `whatsapp`
5. O agente atual processa a mensagem usando o mesmo orquestrador
6. A resposta é enviada de volta pela Evolution em texto simples
7. O evento inbound fica registrado para deduplicação e rastreabilidade mínima

## 8. Escopo do webhook nesta rodada

Aceita:

- texto simples inbound
- resposta de texto simples outbound

Descarta:

- mensagens enviadas por você mesmo
- grupos
- mídia
- números fora do teste local configurado
- eventos duplicados

## 9. Tabela nova do canal

A migration `20260417000000_add_whatsapp_channel_and_agent_channel_events.sql` faz duas coisas:

- libera `whatsapp` em `agent_conversations.channel`
- cria `agent_channel_events` para deduplicação e log mínimo do inbound

## 10. Checklist de teste manual

1. aplicar as migrations no Supabase
2. subir o app com `npm.cmd run dev`
3. subir a Evolution com `docker compose up -d`
4. criar a instância
5. configurar o webhook
6. conectar o WhatsApp
7. enviar `Como está meu mês?`
8. enviar `Paguei 120 de internet`
9. enviar uma confirmação, como `sim`, quando houver ação pendente
10. enviar uma correção, como `não, era 150`

## 11. O que observar no banco

- `agent_conversations` com `channel = whatsapp`
- `agent_messages` recebendo a conversa do canal
- `agent_action_events` registrando as ações do agente
- `agent_channel_events` registrando o inbound com status `processed`, `discarded` ou `failed`
