import { getAgentConversation, getWhatsAppActivation } from "@/app/app/agente/actions";
import { AgentPlayground } from "@/components/agent/agent-playground";
import { WhatsAppActivationPanel } from "@/components/agent/whatsapp-activation-panel";

export default async function AgentePage() {
  const [initialConversation, initialActivation] = await Promise.all([
    getAgentConversation(),
    getWhatsAppActivation(),
  ]);

  return (
    <div className="space-y-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:space-y-5 md:pb-8">
      <WhatsAppActivationPanel initialActivation={initialActivation} />
      <AgentPlayground initialConversation={initialConversation} />
    </div>
  );
}
