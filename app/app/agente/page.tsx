import { Suspense } from "react";
import { getAgentConversation, getWhatsAppActivation } from "@/app/app/agente/actions";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { AgentPlayground } from "@/components/agent/agent-playground";
import { WhatsAppActivationPanel } from "@/components/agent/whatsapp-activation-panel";

export default function AgentePage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando Helena" />}>
      <AgenteData />
    </Suspense>
  );
}

async function AgenteData() {
  const [initialActivation, initialConversation] = await Promise.all([
    getWhatsAppActivation(),
    getAgentConversation(),
  ]);

  return (
    <div className="space-y-4 pb-8">
      <WhatsAppActivationPanel initialActivation={initialActivation} initialConversation={initialConversation} />
      <AgentPlayground initialConversation={initialConversation} />
    </div>
  );
}
