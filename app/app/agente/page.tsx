import { getAgentConversation, getWhatsAppActivation } from "@/app/app/agente/actions";
import { WhatsAppActivationPanel } from "@/components/agent/whatsapp-activation-panel";

export default async function AgentePage() {
  const [initialActivation, initialConversation] = await Promise.all([
    getWhatsAppActivation(),
    getAgentConversation(),
  ]);

  return (
    <div className="pb-8">
      <WhatsAppActivationPanel initialActivation={initialActivation} initialConversation={initialConversation} />
    </div>
  );
}
