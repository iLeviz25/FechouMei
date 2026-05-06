import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { ImportProRequired } from "@/components/importar/import-pro-required";
import { ImportUpload } from "@/components/importar/import-upload";
import { getCurrentUserProfile } from "@/lib/profile";
import { getSubscriptionAccessFromProfile } from "@/lib/subscription/access";

export default async function ImportarPage() {
  const { profile, profileError } = await getCurrentUserProfile();

  if (profileError) {
    throw new Error(`Erro ao carregar acesso: ${profileError.message}`);
  }

  const access = getSubscriptionAccessFromProfile(profile);

  if (!access.canUseAppImport) {
    return <ImportProRequired />;
  }

  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando importação" />}>
      <ImportUpload />
    </Suspense>
  );
}
