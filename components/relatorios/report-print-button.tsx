"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportPrintButton() {
  return (
    <Button className="w-full sm:w-auto" onClick={() => window.print()} type="button">
      <Printer className="h-4 w-4" />
      Imprimir / salvar PDF
    </Button>
  );
}
