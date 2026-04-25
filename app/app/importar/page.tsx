import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { ImportUpload } from "@/components/importar/import-upload";

export default function ImportarPage() {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando importacao" />}>
      <ImportUpload />
    </Suspense>
  );
}
