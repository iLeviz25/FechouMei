import { getWhatsAppActivation } from "@/app/app/agente/actions";
import { WhatsAppActivationPanel } from "@/components/agent/whatsapp-activation-panel";

export default async function AgentePage() {
  const initialActivation = await getWhatsAppActivation();

  return (
    <div className="pb-8">
      <WhatsAppActivationPanel initialActivation={initialActivation} />
    </div>
  );
}
