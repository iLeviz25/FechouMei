"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CsvMovement = {
  amount: number;
  category: string;
  description: string;
  occurred_at?: string;
  occurred_on: string;
  type: string;
};

type MovementsCsvExportButtonProps = {
  className?: string;
  filename: string;
  label: string;
  movements: CsvMovement[];
};

const columns = [
  { header: "data", value: (movement: CsvMovement) => movement.occurred_on },
  { header: "data_hora", value: (movement: CsvMovement) => movement.occurred_at ?? "" },
  { header: "tipo", value: (movement: CsvMovement) => movement.type },
  { header: "descrição", value: (movement: CsvMovement) => movement.description },
  { header: "categoria", value: (movement: CsvMovement) => movement.category },
  {
    header: "valor",
    value: (movement: CsvMovement) => movement.amount.toFixed(2).replace(".", ","),
  },
];

function escapeCsvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function buildCsv(movements: CsvMovement[]) {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(";");
  const rows = movements.map((movement) =>
    columns.map((column) => escapeCsvCell(column.value(movement))).join(";"),
  );

  return [header, ...rows].join("\r\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
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

    downloadCsv(filename, buildCsv(movements));
    setMessage("Download do CSV iniciado.");
    window.setTimeout(() => setMessage(null), 3500);
  }

  return (
    <div className={cn("space-y-1", className)}>
      <Button
        className="w-full border-neutral-200 bg-white"
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
