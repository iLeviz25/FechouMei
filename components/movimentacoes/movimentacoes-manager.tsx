"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createMovimentacao,
  deleteMovimentacao,
  updateMovimentacao,
  type MovementActionResult,
} from "@/app/app/movimentacoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Movimentacao } from "@/types/database";

type MovimentacoesManagerProps = {
  movements: MovementItem[];
};

type MovementItem = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_on" | "type"
>;

type FormState = {
  type: "entrada" | "despesa";
  description: string;
  amount: string;
  occurred_on: string;
  category: string;
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm: FormState = {
  type: "entrada",
  description: "",
  amount: "",
  occurred_on: today,
  category: "",
};

const categories = [
  "Cliente",
  "Serviço",
  "Venda",
  "Material",
  "Ferramenta",
  "Imposto",
  "Transporte",
  "Alimentação",
  "Outro",
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function toDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function toFormState(movement: MovementItem): FormState {
  return {
    type: movement.type,
    description: movement.description,
    amount: movement.amount.toFixed(2).replace(".", ","),
    occurred_on: movement.occurred_on,
    category: movement.category,
  };
}

function normalizeAmountInput(value: string) {
  const cleaned = value.replace(/[^\d,\.]/g, "");
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

function formatAmountForDisplay(value: string) {
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

function MovementFields({
  form,
  idPrefix,
  onChange,
}: {
  form: FormState;
  idPrefix: string;
  onChange: (field: keyof FormState, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>Tipo</Label>
        <input name="type" type="hidden" value={form.type} />
        <OptionGroup
          name={`${idPrefix}-type`}
          onChange={(value) => onChange("type", value as FormState["type"])}
          options={[
            { value: "entrada", label: "Entrada" },
            { value: "despesa", label: "Despesa" },
          ]}
          value={form.type}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-occurred-on`}>Data</Label>
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
        <Label htmlFor={`${idPrefix}-description`}>Descrição</Label>
        <Input
          id={`${idPrefix}-description`}
          name="description"
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Ex: serviço para cliente"
          required
          value={form.description}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-amount`}>Valor</Label>
        <Input
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          name="amount"
          onBlur={(event) => onChange("amount", formatAmountForDisplay(event.target.value))}
          onChange={(event) => onChange("amount", normalizeAmountInput(event.target.value))}
          pattern="[0-9]+([,.][0-9]{1,2})?"
          placeholder="Ex: R$ 120,50"
          required
          title="Use reais e centavos, como 120,50"
          type="text"
          value={form.amount}
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-category`}>Categoria</Label>
        <input name="category" type="hidden" value={form.category} />
        <OptionGroup
          name={`${idPrefix}-category`}
          onChange={(value) => onChange("category", value)}
          options={categories.map((category) => ({ value: category, label: category }))}
          required
          value={form.category}
        />
      </div>
    </div>
  );
}

export function MovimentacoesManager({ movements }: MovimentacoesManagerProps) {
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MovementActionResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MovementItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => {
    return movements.reduce(
      (acc, movement) => {
        if (movement.type === "entrada") {
          acc.income += movement.amount;
        } else {
          acc.expense += movement.amount;
        }
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }, [movements]);

  const balance = summary.income - summary.expense;

  function updateCreateField(field: keyof FormState, value: string) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field: keyof FormState, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  function startEdit(movement: MovementItem) {
    setFeedback(null);
    setPendingDelete(null);
    setEditingId(movement.id);
    setEditForm(toFormState(movement));
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createMovimentacao(formData);
      setFeedback(result);
      if (result.ok) {
        setCreateForm(emptyForm);
      }
    });
  }

  async function handleUpdate(id: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateMovimentacao(id, formData);
      setFeedback(result);
      if (result.ok) {
        cancelEdit();
      }
    });
  }

  function requestDelete(movement: MovementItem) {
    setFeedback(null);
    setPendingDelete(movement);
  }

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    const movement = pendingDelete;
    startTransition(async () => {
      const result = await deleteMovimentacao(movement.id);
      setFeedback(result);
      if (result.ok) {
        setPendingDelete(null);
        if (editingId === movement.id) {
          cancelEdit();
        }
      }
    });
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="space-y-2">
        <Badge variant="success" className="w-fit">
          Movimentações
        </Badge>
        <h1 className="text-2xl font-semibold text-neutral-950 sm:text-3xl">Entradas e despesas</h1>
        <p className="max-w-2xl text-sm leading-6 text-neutral-600">
          Registre o básico do mês para começar a acompanhar seu fluxo financeiro.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Entradas</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{toCurrency(summary.income)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Despesas</p>
            <p className="mt-1 text-xl font-semibold text-red-600">{toCurrency(summary.expense)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-neutral-500">Saldo</p>
            <p className="mt-1 text-xl font-semibold text-neutral-950">{toCurrency(balance)}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Nova movimentação</CardTitle>
          <CardDescription>Use uma descrição curta e uma categoria simples.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form className="space-y-4" onSubmit={handleCreate}>
            <MovementFields form={createForm} idPrefix="create" onChange={updateCreateField} />

            {feedback ? (
              <p
                className={
                  feedback.ok
                    ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                    : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                }
              >
                {feedback.message}
              </p>
            ) : null}

            <Button className="w-full sm:w-auto" disabled={isPending} type="submit">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Últimas movimentações</h2>
          <p className="text-sm text-neutral-500">{movements.length} registro(s)</p>
        </div>

        {movements.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm leading-6 text-neutral-600">
              Nenhuma movimentação registrada ainda. Adicione a primeira entrada ou despesa para começar.
            </CardContent>
          </Card>
        ) : (
          movements.map((movement) => {
            const isEditing = editingId === movement.id;
            return (
              <Card className={isEditing ? "border-emerald-300 bg-emerald-50/40" : undefined} key={movement.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={movement.type === "entrada" ? "success" : "secondary"}>
                          {movement.type === "entrada" ? "Entrada" : "Despesa"}
                        </Badge>
                        <span className="text-xs text-neutral-500">{toDate(movement.occurred_on)}</span>
                      </div>
                      <p className="mt-2 truncate font-medium text-neutral-950">{movement.description}</p>
                      <p className="mt-1 text-sm text-neutral-500">{movement.category}</p>
                    </div>
                    <p
                      className={
                        movement.type === "entrada"
                          ? "shrink-0 font-semibold text-emerald-700"
                          : "shrink-0 font-semibold text-red-600"
                      }
                    >
                      {toCurrency(movement.amount)}
                    </p>
                  </div>

                  {isEditing ? (
                    <form className="space-y-4 rounded-md border bg-white p-3" onSubmit={(event) => handleUpdate(movement.id, event)}>
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="success" className="w-fit">
                          Editando este registro
                        </Badge>
                        <Button onClick={cancelEdit} size="sm" type="button" variant="ghost">
                          <X className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </div>
                      <MovementFields form={editForm} idPrefix={`edit-${movement.id}`} onChange={updateEditField} />
                      <Button className="w-full sm:w-auto" disabled={isPending} type="submit">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                        Salvar edição
                      </Button>
                    </form>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => startEdit(movement)} size="sm" type="button" variant="outline">
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        disabled={isPending}
                        onClick={() => requestDelete(movement)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {pendingDelete ? (
        <div
          aria-labelledby="delete-movement-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 sm:items-center sm:justify-center sm:p-4"
          role="dialog"
        >
          <div className="w-full rounded-md bg-white p-4 shadow-lg sm:max-w-sm">
            <h2 className="text-base font-semibold text-neutral-950" id="delete-movement-title">
              Excluir movimentação?
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Você está excluindo "{pendingDelete.description}". Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                disabled={isPending}
                onClick={() => setPendingDelete(null)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isPending} onClick={confirmDelete} type="button" variant="destructive">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Option = {
  label: string;
  value: string;
};

function OptionGroup({
  name,
  onChange,
  options,
  required,
  value,
}: {
  name: string;
  onChange: (value: string) => void;
  options: Option[];
  required?: boolean;
  value: string;
}) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-pressed={selected}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
              }`}
              key={option.value}
              name={name}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {required && !value ? (
        <p className="text-xs text-neutral-500">Selecione uma opção para continuar.</p>
      ) : null}
    </>
  );
}
