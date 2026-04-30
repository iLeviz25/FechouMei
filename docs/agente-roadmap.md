# Roadmap curto do Agente Universal

## 2C.1 fechado

- Base local do canal WhatsApp via Evolution API.
- Webhook local, envio de resposta em texto e modo single-user.
- Deduplicacao minima e logs basicos do canal.

## 2C.2 fechado

- Descoberta de capacidades por texto.
- Tom mais natural para saudacoes, ajuda, fallback e retomada de contexto.
- Help com exemplos curtos compativeis com WhatsApp.

## 2C.3 concluido

- Consultas rapidas por periodo curto.
- Entradas, despesas, saldo e resumo de periodos simples.
- Melhor semana do mes em entradas e semana com maior despesa.

Regra de periodos:

- `essa semana`: semana calendario atual, de segunda a domingo.
- `semana passada`: semana calendario anterior, de segunda a domingo.
- `ultimos 3/7/14 dias`: hoje mais os dias anteriores necessarios.
- `este mes`: mes calendario atual.

## Proxima etapa sugerida

- Testar a 2C.3 no WhatsApp local com dados reais.
- Ajustar apenas ambiguidades observadas antes de avancar para audio, midia ou producao.
