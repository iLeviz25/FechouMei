# Agente Universal - checklist do core transacional

Use este checklist no playground interno e no canal WhatsApp local para validar o mesmo core do agente.

## Escrita em lote

1. Envie: `recebi 500 do Joao e paguei 120 de internet`
2. Esperado: o agente nao grava direto e pede uma confirmacao unica com os 2 itens.
3. Responda: `sim`
4. Esperado: os 2 registros aparecem em Movimentacoes.

Repita com:

- `recebi 500 do Joao, paguei 120 de internet e recebi 350 da Sofia`
- `recebi 500 do Joao, paguei 120 de internet, paguei 80 de gasolina e recebi 300 da Maria`
- `recebi 500 do Joao, paguei 120 de internet e como esta meu mes?`

No ultimo caso, o agente deve responder a consulta e manter a confirmacao do lote pendente.

## Correcao contextual

Depois de uma escrita pendente ou recem-executada, valide:

- `nao, era 150`
- `nao foi Joao, foi Juliano`
- `e foi ontem`

Esperado:

- corrigir o item elegivel sem criar outro registro;
- manter os outros campos ja conhecidos;
- persistir data/valor/descricao antes de responder sucesso.

## Regressao rapida

Valide que continuam funcionando:

- `qual meu limite do MEI?`
- `como esta meu mes?`
- `mano caiu 500 conto do joaozinho aqui`
- `bota ai 350 da soso como entrada`
- `resgitra ai 500 do juao`
- `pode excluir a ultima movimentacao?`

