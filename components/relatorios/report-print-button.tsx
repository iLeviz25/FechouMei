"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportPrintButton() {
  return (
    <Button
      aria-label="Salvar ou imprimir relatório"
      className="w-full sm:w-auto"
      onClick={() => window.print()}
      title="Use a opção de impressão do navegador para salvar o relatório em PDF."
      type="button"
    >
      <Printer className="h-4 w-4" />
      Salvar ou imprimir
    </Button>
  );
}
