# Checklist de lançamento da Helena v2

Use este checklist antes de liberar ou depois de qualquer ajuste no WhatsApp da Helena.

## 1. Produção na Vercel

- Confirme que o domínio público aponta para produção: `https://fechou-mei.vercel.app`.
- Confirme o commit em produção pelo endpoint seguro:
  - `GET /api/debug/deploy-info`
  - enviar o segredo configurado em `DEPLOY_DEBUG_SECRET`;
  - conferir `VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV=production` e `VERCEL_URL`.
- Não exponha o valor de `DEPLOY_DEBUG_SECRET` em print, log ou mensagem.

## 2. Envs obrigatórias

Na Vercel Production, conferir presença sem copiar valores:

- `WHATSAPP_CHANNEL_ENABLED=true`
- `WHATSAPP_WEBHOOK_SECRET` presente
- `EVOLUTION_API_BASE_URL` apontando para a URL pública da Evolution
- `EVOLUTION_API_KEY` presente
- `EVOLUTION_API_INSTANCE` com a instância real do WhatsApp
- `GEMINI_API_KEY` presente
- `GEMINI_TRANSCRIPTION_API_KEY` presente, se usar chave separada para áudio
- `HELENA_FORCE_V1` ausente ou `false`
- `HELENA_USE_V1_FALLBACK` ausente ou `false`

Rollback emergencial:

- Ativar v1: `HELENA_FORCE_V1=true` ou `HELENA_USE_V1_FALLBACK=true`
- Desativar rollback: remover a env ou voltar para `false`
- Depois de qualquer mudança de env, fazer redeploy da Production.

## 3. Webhook da Evolution

URL correta em produção:

`https://fechou-mei.vercel.app/api/channels/whatsapp/evolution?webhook_secret=<secret>`

Conferir na Evolution:

- webhook habilitado;
- evento `MESSAGES_UPSERT` ativo;
- instância correta conectada ao número real;
- URL apontando para `fechou-mei.vercel.app`;
- não usar `localhost`, `127.0.0.1`, `host.docker.internal` ou deployment preview em produção.

Teste rápido:

- chamada sem segredo deve falhar por autorização;
- chamada com segredo não deve retornar `whatsapp_webhook_secret_not_configured`.

## 4. Local

Para ligar localmente:

- executar `scripts/Ligar-Helena-WhatsApp.cmd` ou `scripts/start-whatsapp-local.ps1`;
- o script força v2 local e desativa rollback v1 no `.env.local`;
- o webhook local esperado é `http://host.docker.internal:3000/api/channels/whatsapp/evolution?...`.

Atenção:

- quando o script local configura a Evolution, essa instância passa a enviar mensagens para o PC;
- para voltar para produção, reconfigure a URL da Evolution para `https://fechou-mei.vercel.app/api/channels/whatsapp/evolution?...`.

## 5. Debug e reset

Comandos protegidos para admin/teste:

- `debug helena`
- `reset helena`

`debug helena` deve mostrar:

- ambiente;
- runtime;
- commit;
- versão chamada;
- se rollback v1 está ativo;
- origem texto ou áudio transcrito;
- estado da conversa;
- ação pendente.

`reset helena` deve:

- funcionar só para admin/teste;
- limpar apenas o estado conversacional;
- não apagar movimentações, relatórios, usuário ou dados financeiros.

## 6. Testes manuais no WhatsApp

Roteamento:

- `debug helena` deve mostrar v2, salvo rollback explícito.
- enviar texto comum deve gerar log com `selectedAgent: v2`.
- enviar áudio transcrito deve gerar log com `source: audio_transcript` e `selectedAgent: v2`.

Registro rápido:

- `gastei 50 gasolina`
- `entrou 300 pix cliente joão`
- `paguei 120 internet`

Coleta:

- `entrou dinheiro` -> `120` -> `internet`
- `lança 200` -> `despesa` -> `pix`

Consulta:

- `relatório de abril`
- `quanto lucrei mês passado?`
- `últimas movimentações`

Edição e exclusão:

- `apaga essa` deve pedir confirmação;
- `não` deve manter;
- `sim` deve excluir;
- `na verdade foi 60` deve pedir confirmação antes de editar;
- `muda a descrição para serviço mensal` deve pedir confirmação.

Segurança:

- assunto fora do escopo deve ser recusado com educação;
- usuário sem vínculo não deve processar a Helena;
- retries do mesmo evento da Evolution devem cair como duplicados.

Áudio:

- áudio dizendo `gastei 50 gasolina` deve entrar no mesmo fluxo de texto;
- áudio dizendo `entrou 300 pix cliente joão` deve entrar no mesmo fluxo de texto;
- se a transcrição falhar, os logs devem indicar o stage sem expor conteúdo sensível.

## 7. Logs esperados

Permitido nos logs:

- stage;
- v1/v2;
- ambiente;
- commit;
- número mascarado;
- user mascarado;
- status de envio;
- erro resumido.

Evitar:

- secrets;
- tokens;
- telefone completo;
- `user_id` completo;
- mensagem completa do usuário;
- dados financeiros completos.

Logs úteis:

- `[HELENA_V2_ROUTE]`
- `[HELENA_V2_TOOL]`
- `[FECHOUMEI_WHATSAPP_LATENCY]`
- `[FECHOUMEI_WHATSAPP_DEDUPE]`
- `[FECHOUMEI_AUDIO_STAGE]`
- `[HELENA_ADMIN_COMMAND]`

## 8. Regressão automatizada

Antes de deploy:

- `npm.cmd run test:agent-parser`
- `npm.cmd run test:whatsapp-audio`
- `npm.cmd run typecheck`

Critério mínimo:

- v2 padrão;
- v1 só com rollback explícito;
- registros rápidos funcionando;
- relatórios e consultas funcionando;
- edição/exclusão sempre com confirmação;
- dedupe do mesmo evento funcionando;
- debug/reset protegidos.
