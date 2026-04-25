import { Suspense } from "react";
import { RouteTransitionPending } from "@/components/app/route-transition-pending";
import { MonthlyReport } from "@/components/relatorios/monthly-report";
import { getMonthlyReportData } from "@/lib/relatorios/monthly-report";

type RelatoriosPageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

export default function RelatoriosPage({ searchParams }: RelatoriosPageProps) {
  return (
    <Suspense fallback={<RouteTransitionPending label="Carregando relatorio" />}>
      <RelatoriosData searchParams={searchParams} />
    </Suspense>
  );
}

async function RelatoriosData({ searchParams }: RelatoriosPageProps) {
  const resolvedSearchParams = await searchParams;
  const report = await getMonthlyReportData(resolvedSearchParams?.month);

  return <MonthlyReport report={report} />;
}
