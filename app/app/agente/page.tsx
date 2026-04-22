import { getAgentConversation, getWhatsAppActivation } from "@/app/app/agente/actions";
import { AgentPlayground } from "@/components/agent/agent-playground";
import { WhatsAppActivationPanel } from "@/components/agent/whatsapp-activation-panel";

export default async function AgentePage() {
  const [initialConversation, initialActivation] = await Promise.all([
    getAgentConversation(),
    getWhatsAppActivation(),
  ]);

  return (
    <div className="grid gap-5 pb-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-5">
        <WhatsAppActivationPanel initialActivation={initialActivation} />
      </div>
      <AgentPlayground initialConversation={initialConversation} />
    </div>
  );
}
