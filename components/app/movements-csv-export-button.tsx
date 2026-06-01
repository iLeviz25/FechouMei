"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildTransactionsCsv,
  type TransactionCsvMovement,
  withCsvBom,
} from "@/lib/export/transactions-csv";
import { cn } from "@/lib/utils";

export type CsvMovement = TransactionCsvMovement;

type MovementsCsvExportButtonProps = {
  buttonClassName?: string;
  className?: string;
  filename: string;
  label: string;
  movements: CsvMovement[];
};

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([withCsvBom(content)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function MovementsCsvExportButton({
  buttonClassName,
  className,
  filename,
  label,
  movements,
}: MovementsCsvExportButtonProps) {
  const disabled = movements.length === 0;
  const [message, setMessage] = useState<string | null>(null);

  function handleExport() {
    if (disabled) {
      return;
    }

    downloadCsv(filename, buildTransactionsCsv(movements));
    setMessage("Download do CSV iniciado.");
    window.setTimeout(() => setMessage(null), 3500);
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Button
        className={cn("w-full border-neutral-200 bg-white", buttonClassName)}
        disabled={disabled}
        onClick={handleExport}
        size="sm"
        type="button"
        variant="outline"
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>
      {message ? (
        <p aria-live="polite" className="text-xs font-medium text-emerald-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
