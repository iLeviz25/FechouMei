"use client";

import { CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Movimentacao } from "@/types/database";

export type MovementFormState = {
  type: "entrada" | "despesa";
  description: string;
  amount: string;
  occurred_on: string;
  category: string;
};

export type MovementItem = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

export const movementCategories = [
  "CLIENTE",
  "SERVICO",
  "VENDA",
  "MATERIAL",
  "FERRAMENTA",
  "IMPOSTO",
  "TRANSPORTE",
  "ALIMENTACAO",
  "OUTRO",
];

export function createEmptyMovementForm(): MovementFormState {
  return {
    type: "entrada",
    description: "",
    amount: "",
    occurred_on: new Date().toISOString().slice(0, 10),
    category: "",
  };
}

export function toMovementFormState(movement: MovementItem): MovementFormState {
  return {
    type: movement.type,
    description: movement.description,
    amount: movement.amount.toFixed(2).replace(".", ","),
    occurred_on: movement.occurred_on,
    category: movement.category,
  };
}

export function normalizeAmountInput(value: string) {
  const cleaned = value.replace(/[^\d,.]/g, "");
  const hasComma = cleaned.includes(",");
  const separator = hasComma ? "," : ".";
  const parts = cleaned.split(hasComma ? "," : ".");

  if (parts.length === 1) {
    return parts[0];
  }

  const integerPart = parts[0];
  const decimalPart = parts.slice(1).join("").slice(0, 2);
  return `${integerPart}${separator}${decimalPart}`;
}

export function formatAmountForDisplay(value: string) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(",", ".");
  const numberValue = Number(normalized);

  if (!Number.isFinite(numberValue)) {
    return value;
  }

  return numberValue.toFixed(2).replace(".", ",");
}

export function validateMovementForm(form: MovementFormState) {
  const description = form.description.trim();
  const amount = form.amount.trim();

  if (!form.occurred_on) {
    return "Informe a data da movimentação.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.occurred_on)) {
    return "Use uma data válida para a movimentação.";
  }

  if (!amount) {
    return "Informe o valor da movimentação.";
  }

  if (!/^\d+([,.]\d{1,2})?$/.test(amount)) {
    return "Use um valor em reais, como 120,50.";
  }

  if (Number(amount.replace(",", ".")) <= 0) {
    return "Informe um valor maior que zero.";
  }

  if (!description) {
    return "Informe uma descrição curta para identificar o registro.";
  }

  if (!form.category) {
    return "Escolha uma categoria para continuar.";
  }

  return null;
}

export function MovementFields({
  compact = false,
  form,
  idPrefix,
  onChange,
}: {
  compact?: boolean;
  form: MovementFormState;
  idPrefix: string;
  onChange: (field: keyof MovementFormState, value: string) => void;
}) {
  return (
    <div className={cn("grid gap-4", compact ? "md:grid-cols-2" : "md:grid-cols-2")}>
      <div className="space-y-2 md:col-span-2">
        <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor={`${idPrefix}-type`}>
          Entrada ou despesa
        </Label>
        <input name="type" type="hidden" value={form.type} />
        <MovementTypeGroup
          name={`${idPrefix}-type`}
          onChange={(value) => onChange("type", value as MovementFormState["type"])}
          options={[
            { value: "entrada", label: "Entrada" },
            { value: "despesa", label: "Despesa" },
          ]}
          value={form.type}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor={`${idPrefix}-occurred-on`}>
          Data do registro
        </Label>
        <Input
          id={`${idPrefix}-occurred-on`}
          name="occurred_on"
          onChange={(event) => onChange("occurred_on", event.target.value)}
          required
          type="date"
          value={form.occurred_on}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor={`${idPrefix}-amount`}>
          Valor em reais
        </Label>
        <Input
          className={cn(form.type === "entrada" ? "text-primary" : "text-destructive")}
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          name="amount"
          onBlur={(event) => onChange("amount", formatAmountForDisplay(event.target.value))}
          onChange={(event) => onChange("amount", normalizeAmountInput(event.target.value))}
          pattern="[0-9]+([,.][0-9]{1,2})?"
          placeholder="120,50"
          required
          title="Use reais e centavos, como 120,50"
          type="text"
          value={form.amount}
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor={`${idPrefix}-description`}>
          Descrição curta
        </Label>
        <Input
          id={`${idPrefix}-description`}
          name="description"
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Ex.: serviço para cliente"
          required
          value={form.description}
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor={`${idPrefix}-category`}>
          Categoria
        </Label>
        <input name="category" type="hidden" value={form.category} />
        <Select id={`${idPrefix}-category`} onChange={(event) => onChange("category", event.target.value)} value={form.category}>
          <option value="">Escolha uma categoria</option>
          {movementCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

type MovementTypeOption = {
  label: string;
  value: string;
};

function MovementTypeGroup({
  className,
  compact = false,
  name,
  onChange,
  options,
  showCheckIcon = true,
  value,
}: {
  className?: string;
  compact?: boolean;
  name: string;
  onChange: (value: string) => void;
  options: MovementTypeOption[];
  showCheckIcon?: boolean;
  value: string;
}) {
  return (
    <div className={cn("flex gap-2", compact ? "flex-nowrap" : "flex-wrap", className)}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            aria-pressed={selected}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-full border font-bold transition-[background-color,border-color,color,box-shadow]",
              compact ? "h-10 whitespace-nowrap px-4 text-sm" : "min-h-11 px-4 py-2 text-sm",
              selected
                ? "border-primary/16 bg-primary text-primary-foreground"
                : "border-border/70 bg-card/80 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
            key={option.value}
            name={name}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {selected && showCheckIcon ? <CheckSquare className="h-3.5 w-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
