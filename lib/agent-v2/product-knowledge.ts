export type AgentV2KnowledgeTopicId =
  | "capabilities"
  | "dashboard"
  | "expense"
  | "export"
  | "fechoumei"
  | "import"
  | "income"
  | "monthly_closing"
  | "movements"
  | "obligations"
  | "personal_business_money"
  | "profit"
  | "register_expense"
  | "register_income"
  | "reports"
  | "scope_limits";

export type AgentV2KnowledgeTopic = {
  answer: string;
  id: AgentV2KnowledgeTopicId;
  keywords: string[];
  title: string;
};

export const agentV2KnowledgeTopics: AgentV2KnowledgeTopic[] = [
  {
    answer: [
      "O FechouMEI ajuda você a organizar o financeiro do seu MEI sem depender só de memória ou planilha.",
      "",
      "A ideia é registrar entradas, despesas, acompanhar resultado, ver relatórios e manter o mês mais claro para tomar decisões melhores.",
    ].join("\n"),
    id: "fechoumei",
    keywords: ["fechoumei", "fechou mei", "app", "sistema", "plataforma", "organizar mei", "meu mei"],
    title: "O que é o FechouMEI",
  },
  {
    answer: [
      "Eu posso te ajudar a entender e usar o FechouMEI pelo WhatsApp 😊",
      "",
      "Nesta versão de teste, consigo explicar entradas, despesas, lucro, relatórios, fechamento mensal, obrigações e organização do MEI.",
      "",
      "Também consigo preparar rascunhos de entradas e despesas e só salvo depois que você confirmar.",
      "",
      "Edição e exclusão continuam fora da v2 por enquanto.",
    ].join("\n"),
    id: "capabilities",
    keywords: ["o que voce faz", "o que você faz", "como voce ajuda", "como você ajuda", "pode me ajudar", "consegue fazer", "helena faz"],
    title: "O que a Helena consegue fazer",
  },
  {
    answer: [
      "Movimentações são os registros financeiros do seu MEI.",
      "",
      "Elas podem ser entradas, quando dinheiro entra, ou despesas, quando dinheiro sai. Com isso, o FechouMEI consegue mostrar resultado, relatórios e histórico do mês.",
    ].join("\n"),
    id: "movements",
    keywords: ["movimentacao", "movimentacoes", "movimentação", "movimentações", "lancamento", "lançamento", "historico", "histórico"],
    title: "Movimentações",
  },
  {
    answer: [
      "Entrada é todo dinheiro que entrou no seu MEI: venda, serviço, pix de cliente, recebimento ou outro faturamento.",
      "",
      "Registrar entradas ajuda você a acompanhar quanto faturou no mês.",
    ].join("\n"),
    id: "income",
    keywords: ["entrada", "entradas", "recebimento", "recebi", "entrou", "faturamento", "venda", "pix cliente"],
    title: "Entradas",
  },
  {
    answer: [
      "Despesa é o dinheiro que saiu do seu MEI: combustível, aluguel, internet, ferramenta, taxa, compra ou pagamento.",
      "",
      "Quando você registra as despesas, fica mais fácil entender para onde o dinheiro está indo.",
    ].join("\n"),
    id: "expense",
    keywords: ["despesa", "despesas", "gasto", "gastos", "paguei", "gastei", "compra", "custos"],
    title: "Despesas",
  },
  {
    answer: [
      "No FechouMEI, o resultado do mês é a diferença entre entradas e despesas.",
      "",
      "Se entrou mais do que saiu, o mês ficou positivo. Se saiu mais do que entrou, ficou negativo.",
    ].join("\n"),
    id: "profit",
    keywords: ["lucro", "lucrei", "resultado", "saldo", "ganhei", "como vejo meu lucro", "ver meu lucro"],
    title: "Lucro e resultado",
  },
  {
    answer: [
      "O relatório mostra um resumo de um período: entradas, despesas, resultado e movimentações registradas.",
      "",
      "Ele é útil para entender como foi o mês ou conferir um período específico antes de fechar as contas.",
    ].join("\n"),
    id: "reports",
    keywords: ["relatorio", "relatórios", "relatório", "resumo", "periodo", "período", "como foi meu mes", "como foi meu mês"],
    title: "Relatórios",
  },
  {
    answer: [
      "O fechamento mensal é a conferência do mês do seu MEI.",
      "",
      "Você olha quanto entrou, quanto saiu, qual foi o resultado e se ficou alguma pendência. Ele ajuda a encerrar o mês com mais clareza.",
    ].join("\n"),
    id: "monthly_closing",
    keywords: ["fechamento", "fechamento mensal", "fechar o mes", "fechar o mês", "encerrar o mes", "encerrar o mês"],
    title: "Fechamento mensal",
  },
  {
    answer: [
      "As obrigações ajudam você a acompanhar tarefas importantes do MEI, como conferências e lembretes do mês.",
      "",
      "A Helena pode explicar o que acompanhar, mas decisões fiscais específicas ainda devem ser validadas com um contador.",
    ].join("\n"),
    id: "obligations",
    keywords: ["obrigacao", "obrigacoes", "obrigação", "obrigações", "das", "dasn", "pendencia", "pendência", "checklist"],
    title: "Obrigações",
  },
  {
    answer: [
      "O dashboard é a visão geral do seu MEI no FechouMEI.",
      "",
      "Ele ajuda a enxergar entradas, despesas, resultado e outros indicadores sem precisar abrir cada movimentação uma por uma.",
    ].join("\n"),
    id: "dashboard",
    keywords: ["dashboard", "painel", "visao geral", "visão geral", "tela inicial", "indicadores"],
    title: "Dashboard",
  },
  {
    answer: [
      "A importação serve para trazer movimentações a partir de arquivo, quando esse recurso está disponível para o seu plano e formato.",
      "",
      "Ela ajuda quando você já tem dados em planilha ou extrato e quer revisar antes de jogar no controle.",
    ].join("\n"),
    id: "import",
    keywords: ["importar", "importacao", "importação", "planilha", "csv", "xlsx", "arquivo"],
    title: "Importação",
  },
  {
    answer: [
      "A exportação serve para baixar movimentações e analisar fora do FechouMEI, quando esse recurso está disponível.",
      "",
      "Ela é útil para conferência, backup ou envio de informações organizadas.",
    ].join("\n"),
    id: "export",
    keywords: ["exportar", "exportacao", "exportação", "baixar dados", "csv", "planilha"],
    title: "Exportação",
  },
  {
    answer: [
      "Uma boa prática é separar o dinheiro do MEI do dinheiro pessoal sempre que possível.",
      "",
      "Mesmo que use a mesma conta no começo, registre o que é do negócio e o que é pessoal. Isso evita confusão na hora de ver lucro, despesas e resultado do mês.",
    ].join("\n"),
    id: "personal_business_money",
    keywords: ["dinheiro pessoal", "dinheiro do mei", "misturar dinheiro", "separar dinheiro", "conta pessoal", "conta mei"],
    title: "Dinheiro pessoal e MEI",
  },
  {
    answer: [
      "Para registrar uma entrada, você informa o valor, uma descrição e a data.",
      "",
      "Exemplo: \"entrou 300 pix cliente João\". Eu preparo o rascunho e peço sua confirmação antes de salvar.",
    ].join("\n"),
    id: "register_income",
    keywords: [
      "registrar entrada",
      "registro entrada",
      "registro uma entrada",
      "registrar uma entrada",
      "como registro entrada",
      "como registrar entrada",
      "como eu registro uma entrada",
      "como eu registro entrada",
      "lançar entrada",
      "lancar entrada",
    ],
    title: "Como registrar entrada",
  },
  {
    answer: [
      "Para registrar uma despesa, você informa o valor, o motivo do gasto e a data.",
      "",
      "Exemplo: \"gastei 50 com gasolina\". Eu preparo o rascunho e peço sua confirmação antes de salvar.",
    ].join("\n"),
    id: "register_expense",
    keywords: [
      "registrar despesa",
      "registro despesa",
      "registro uma despesa",
      "registrar uma despesa",
      "como registro despesa",
      "como registrar despesa",
      "como eu registro uma despesa",
      "como eu registro despesa",
      "lançar despesa",
      "lancar despesa",
    ],
    title: "Como registrar despesa",
  },
  {
    answer: [
      "Eu não substituo um contador e não devo orientar sonegação, fraude ou decisões fiscais arriscadas.",
      "",
      "Também não invento dados financeiros: quando for preciso consultar valores reais, o app precisa buscar isso nas funções seguras do FechouMEI.",
    ].join("\n"),
    id: "scope_limits",
    keywords: ["contador", "imposto", "nota fria", "sonegar", "fraude", "fora do escopo", "limites"],
    title: "Limites da Helena",
  },
];

export function findAgentV2KnowledgeAnswer(message: string) {
  const normalized = normalizeKnowledgeText(message);
  const matches = agentV2KnowledgeTopics
    .map((candidate) => {
      const matchedKeyword = candidate.keywords
        .map((keyword) => normalizeKnowledgeText(keyword))
        .filter((keyword) => normalized.includes(keyword))
        .sort((a, b) => b.length - a.length)[0];

      return matchedKeyword
        ? {
            keywordLength: matchedKeyword.length,
            topic: candidate,
          }
        : null;
    })
    .filter((match): match is { keywordLength: number; topic: AgentV2KnowledgeTopic } => Boolean(match))
    .sort((a, b) => b.keywordLength - a.keywordLength);
  const topic = matches[0]?.topic;

  return topic
    ? {
        answer: topic.answer,
        topic,
      }
    : null;
}

export function getAgentV2KnowledgePromptText() {
  return agentV2KnowledgeTopics
    .map((topic) => [`## ${topic.title}`, topic.answer].join("\n"))
    .join("\n\n");
}

export function normalizeKnowledgeText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
