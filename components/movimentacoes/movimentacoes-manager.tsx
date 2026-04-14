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
      {/* Header */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Movimentacoes</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Entradas e despesas
        </h1>
        <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Registre o basico do mes para acompanhar seu fluxo financeiro.
        </p>
      </div>

      {/* Summary Cards */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Entradas</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-600">
              {toCurrency(summary.income)}
            </p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Despesas</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-red-600">
              {toCurrency(summary.expense)}
            </p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-card-hover">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Saldo</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${balance >= 0 ? "text-foreground" : "text-red-600"}`}>
              {toCurrency(balance)}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* New Movement Form */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Nova movimentacao</CardTitle>
          <CardDescription>Use uma descricao curta e uma categoria simples.</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          <form className="space-y-5" onSubmit={handleCreate}>
            <MovementFields form={createForm} idPrefix="create" onChange={updateCreateField} />

            {feedback ? (
              <div
                className={
                  feedback.ok
                    ? "rounded-xl border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground"
                    : "rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                }
              >
                {feedback.message}
              </div>
            ) : null}

            <Button className="w-full sm:w-auto gap-2" disabled={isPending} type="submit" size="lg">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar movimentacao
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Movements List */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Ultimas movimentacoes</h2>
          <p className="text-sm text-muted-foreground">{movements.length} registro(s)</p>
        </div>

        {movements.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="font-medium text-foreground">Nenhuma movimentacao registrada ainda.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adicione a primeira entrada ou despesa para comecar.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {movements.map((movement) => {
              const isEditing = editingId === movement.id;
              return (
                <Card
                  className={isEditing ? "border-primary/30 bg-accent/30" : "transition-shadow hover:shadow-card-hover"}
                  key={movement.id}
                >
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={movement.type === "entrada" ? "success" : "muted"}>
                            {movement.type === "entrada" ? "Entrada" : "Despesa"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{toDate(movement.occurred_on)}</span>
                        </div>
                        <p className="mt-2 truncate font-medium text-foreground">{movement.description}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{movement.category}</p>
                      </div>
                      <p
                        className={`shrink-0 text-lg font-semibold ${
                          movement.type === "entrada" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {toCurrency(movement.amount)}
                      </p>
                    </div>

                    {isEditing ? (
                      <form
                        className="space-y-4 rounded-xl border border-border bg-card p-4"
                        onSubmit={(event) => handleUpdate(movement.id, event)}
                      >
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
                        <Button className="w-full sm:w-auto gap-2" disabled={isPending} type="submit">
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                          Salvar edicao
                        </Button>
                      </form>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => startEdit(movement)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          className="flex-1"
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
            })}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {pendingDelete ? (
        <div
          aria-labelledby="delete-movement-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-foreground/50 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="dialog"
        >
          <div className="w-full rounded-2xl bg-card p-6 shadow-elevated sm:max-w-sm">
            <h2 className="text-lg font-semibold text-foreground" id="delete-movement-title">
              Excluir movimentacao?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Voce esta excluindo &quot;{pendingDelete.description}&quot;. Esta acao nao pode ser desfeita.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={() => setPendingDelete(null)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={confirmDelete}
                type="button"
                variant="destructive"
              >
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
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              aria-pressed={selected}
              className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                selected
                  ? "border-primary/30 bg-accent text-accent-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/50 hover:text-foreground"
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
        <p className="text-xs text-muted-foreground">Selecione uma opcao para continuar.</p>
      ) : null}
    </>
  );
}
