import { getAgentConversation } from "@/app/app/agente/actions";
import { AgentPlayground } from "@/components/agent/agent-playground";
import { Badge } from "@/components/ui/badge";

export default async function AgentePage() {
  const initialConversation = await getAgentConversation();

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="space-y-2">
          <Badge variant="success" className="w-fit">
            Teste interno
          </Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
              Agente FechouMEI
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Converse com o agente para validar registros, consultas e confirmações antes das próximas integrações.
            </p>
          </div>
        </div>
      </section>

      <AgentPlayground initialConversation={initialConversation} />
    </div>
  );
}
