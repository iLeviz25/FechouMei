import { getAgentConversation, getWhatsAppActivation } from "@/app/app/agente/actions";
import { AgentPlayground } from "@/components/agent/agent-playground";
import { WhatsAppActivationPanel } from "@/components/agent/whatsapp-activation-panel";

export default async function AgentePage() {
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
