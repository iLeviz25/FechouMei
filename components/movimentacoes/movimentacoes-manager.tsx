"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CheckSquare,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  createMovimentacao,
  deleteMovimentacao,
  deleteMovimentacoes,
  updateMovimentacao,
  type MovementActionResult,
} from "@/app/app/movimentacoes/actions";
import { MovementsCsvExportButton } from "@/components/app/movements-csv-export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Movimentacao } from "@/types/database";

type MovimentacoesManagerProps = {
  initialBalance: number;
  movements: MovementItem[];
};

type MovementItem = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

type FormState = {
  type: "entrada" | "despesa";
  description: string;
  amount: string;
  occurred_on: string;
  category: string;
};

type PeriodFilter = "todos" | "este-mes" | "mes-anterior" | "ultimos-30-dias";
type TypeFilter = "todos" | "entrada" | "despesa";

const today = new Date().toISOString().slice(0, 10);

const emptyForm: FormState = {
  type: "entrada",
  description: "",
  amount: "",
  occurred_on: today,
  category: "",
};

const categories = [
  "CLIENTE",
  "SERVIÇO",
  "VENDA",
  "MATERIAL",
  "FERRAMENTA",
  "IMPOSTO",
  "TRANSPORTE",
  "ALIMENTAÇÃO",
  "OUTRO",
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

function toDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getPeriodRange(period: PeriodFilter) {
  if (period === "todos") {
    return null;
  }

  const now = new Date();

  if (period === "este-mes") {
    return {
      end: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      start: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    };
  }

  if (period === "mes-anterior") {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      end: toDateInputValue(new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0)),
      start: toDateInputValue(previousMonth),
    };
  }

  return {
    end: toDateInputValue(now),
    start: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)),
  };
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

function validateMovementForm(form: FormState) {
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

function MovementFields({
  compact = false,
  form,
  idPrefix,
  onChange,
}: {
  compact?: boolean;
  form: FormState;
  idPrefix: string;
  onChange: (field: keyof FormState, value: string) => void;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", compact ? "sm:grid-cols-2" : "md:grid-cols-2")}>
      <div className="col-span-2 space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" htmlFor={`${idPrefix}-type`}>
          Entrada ou despesa
        </Label>
        <input name="type" type="hidden" value={form.type} />
        <OptionGroup
          name={`${idPrefix}-type`}
          onChange={(value) => onChange("type", value as FormState["type"])}
          options={[
            { value: "entrada", label: "Entrada" },
            { value: "despesa", label: "Despesa" },
          ]}
          tone="type"
          value={form.type}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" htmlFor={`${idPrefix}-occurred-on`}>
          Data do registro
        </Label>
        <Input
          className="h-11 border-neutral-200 bg-white shadow-none focus-visible:ring-emerald-700"
          id={`${idPrefix}-occurred-on`}
          name="occurred_on"
          onChange={(event) => onChange("occurred_on", event.target.value)}
          required
          type="date"
          value={form.occurred_on}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" htmlFor={`${idPrefix}-amount`}>
          Valor em reais
        </Label>
        <Input
          className={cn(
            "h-11 border-neutral-200 bg-white text-base font-semibold shadow-none placeholder:font-normal focus-visible:ring-emerald-700",
            form.type === "entrada" ? "text-emerald-800" : "text-red-700",
          )}
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

      <div className="col-span-2 space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" htmlFor={`${idPrefix}-description`}>
          Descrição curta
        </Label>
        <Input
          className="h-11 border-neutral-200 bg-white shadow-none focus-visible:ring-emerald-700"
          id={`${idPrefix}-description`}
          name="description"
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Ex: serviço para cliente"
          required
          value={form.description}
        />
      </div>

      <div className="col-span-2 space-y-2">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" htmlFor={`${idPrefix}-category`}>
          Categoria
        </Label>
        <input name="category" type="hidden" value={form.category} />
        <Select
          className="h-11 border-neutral-200 bg-white shadow-none focus-visible:ring-emerald-700 md:hidden"
          id={`${idPrefix}-category`}
          onChange={(event) => onChange("category", event.target.value)}
          value={form.category}
        >
          <option value="">Escolha uma categoria</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        <div className="hidden md:block">
          <OptionGroup
            name={`${idPrefix}-category`}
            onChange={(value) => onChange("category", value)}
            options={categories.map((category) => ({ value: category, label: category }))}
            required
            tone="category"
            value={form.category}
          />
        </div>
        {!form.category ? <p className="text-xs text-neutral-500 md:hidden">Escolha uma categoria para continuar.</p> : null}
      </div>
    </div>
  );
}

export function MovimentacoesManager({ initialBalance, movements }: MovimentacoesManagerProps) {
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MovementActionResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MovementItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("todos");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
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

  const safeInitialBalance = Number.isFinite(initialBalance) ? initialBalance : 0;
  const balance = safeInitialBalance + summary.income - summary.expense;

  const categoryOptions = useMemo(() => {
    const knownCategories = new Set(categories.map(normalizeSearchValue));
    const extraCategories = movements
      .map((movement) => movement.category)
      .filter((category) => category && !knownCategories.has(normalizeSearchValue(category)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    return [...categories, ...extraCategories];
  }, [movements]);

  const filteredMovements = useMemo(() => {
    const search = normalizeSearchValue(searchTerm);
    const periodRange = getPeriodRange(periodFilter);

    return movements.filter((movement) => {
      if (typeFilter !== "todos" && movement.type !== typeFilter) {
        return false;
      }

      if (categoryFilter !== "todas" && movement.category !== categoryFilter) {
        return false;
      }

      if (periodRange && (movement.occurred_on < periodRange.start || movement.occurred_on > periodRange.end)) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchableText = normalizeSearchValue(`${movement.description} ${movement.category}`);
      return searchableText.includes(search);
    });
  }, [categoryFilter, movements, periodFilter, searchTerm, typeFilter]);

  const existingMovementIds = useMemo(() => new Set(movements.map((movement) => movement.id)), [movements]);
  const filteredMovementIds = useMemo(() => filteredMovements.map((movement) => movement.id), [filteredMovements]);
  const selectedMovements = useMemo(
    () => movements.filter((movement) => selectedIds.has(movement.id)),
    [movements, selectedIds],
  );

  const selectedCount = selectedIds.size;
  const allFilteredSelected =
    filteredMovementIds.length > 0 && filteredMovementIds.every((id) => selectedIds.has(id));
  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    typeFilter !== "todos" ||
    categoryFilter !== "todas" ||
    periodFilter !== "todos";

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => existingMovementIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [existingMovementIds]);

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

  function clearFilters() {
    setSearchTerm("");
    setTypeFilter("todos");
    setCategoryFilter("todas");
    setPeriodFilter("todos");
    setMobileToolsOpen(false);
  }

  function startSelectionMode() {
    setFeedback(null);
    setPendingDelete(null);
    cancelEdit();
    setSelectionMode(true);
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function selectAllFilteredMovements() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredMovementIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelectedMovements() {
    setSelectedIds(new Set());
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateMovementForm(createForm);

    if (validationMessage) {
      setFeedback({ ok: false, message: validationMessage });
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createMovimentacao(formData);
      setFeedback(result.ok ? { ok: true, message: "Movimentação salva com sucesso." } : result);

      if (result.ok) {
        setCreateForm(emptyForm);
      }
    });
  }

  async function handleUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validateMovementForm(editForm);

    if (validationMessage) {
      setFeedback({ ok: false, message: validationMessage });
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateMovimentacao(id, formData);
      setFeedback(result.ok ? { ok: true, message: "Alterações salvas com sucesso." } : result);

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
      setFeedback(result.ok ? { ok: true, message: "Movimentação excluída com sucesso." } : result);

      if (result.ok) {
        setPendingDelete(null);

        if (editingId === movement.id) {
          cancelEdit();
        }
      }
    });
  }

  function confirmBulkDelete() {
    if (selectedCount === 0) {
      return;
    }

    const ids = Array.from(selectedIds);

    startTransition(async () => {
      const result = await deleteMovimentacoes(ids);

      setFeedback(
        result.ok
          ? {
              ok: true,
              message:
                result.deletedCount === 1
                  ? "Movimentação excluída com sucesso."
                  : `${result.deletedCount ?? selectedCount} movimentações excluídas com sucesso.`,
            }
          : result,
      );

      if (result.ok) {
        exitSelectionMode();
      } else {
        setBulkDeleteOpen(false);
      }
    });
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="space-y-2">
        <Badge variant="success" className="w-fit border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
          Entradas e despesas
        </Badge>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">Lançar movimentação</h1>
          <p className="max-w-2xl text-sm leading-6 text-neutral-600">
            Registre o que entrou ou saiu e consulte o histórico sem perder tempo no celular.
          </p>
        </div>
      </header>

      <section aria-label="Resumo financeiro" className="grid grid-cols-3 gap-2">
        <SummaryCard icon={<ArrowUpRight className="h-4 w-4" />} label="Entradas" tone="income" value={toCurrency(summary.income)} />
        <SummaryCard icon={<ArrowDownLeft className="h-4 w-4" />} label="Despesas" tone="expense" value={toCurrency(summary.expense)} />
        <SummaryCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Saldo"
          tone={balance >= 0 ? "balance" : "expense"}
          value={toCurrency(balance)}
        />
      </section>

      {feedback ? (
        <p
          aria-live="polite"
          className={cn(
            "rounded-md border px-3 py-2 text-sm leading-6",
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700",
          )}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start">
        <Card className="overflow-hidden border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-neutral-100 bg-white/80 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base text-neutral-950">Lançar agora</CardTitle>
                <CardDescription className="mt-1 leading-6">Preencha os campos abaixo e salve a movimentação.</CardDescription>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-700">
                <Plus className="h-4 w-4" />
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form className="space-y-4" noValidate onSubmit={handleCreate}>
              <MovementFields form={createForm} idPrefix="create" onChange={updateCreateField} />

              <Button className="h-11 w-full shadow-sm" disabled={isPending} type="submit">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Salvar movimentação
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-neutral-950 sm:text-lg">Histórico de lançamentos</h2>
                <p className="text-sm text-neutral-500">
                  {hasActiveFilters
                    ? `${filteredMovements.length} de ${movements.length} registro(s)`
                    : `${movements.length} registro(s)`}
                </p>
              </div>

              <div className="hidden gap-2 sm:flex sm:items-center">
                {movements.length > 0 ? (
                  <Button
                    className="h-9"
                    onClick={selectionMode ? exitSelectionMode : startSelectionMode}
                    type="button"
                    variant={selectionMode ? "secondary" : "outline"}
                  >
                    {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                    {selectionMode ? "Cancelar seleção" : "Selecionar"}
                  </Button>
                ) : null}
                <MovementsCsvExportButton
                  buttonClassName="w-auto"
                  className="w-auto"
                  filename="fechoumei-movimentacoes.csv"
                  label="Exportar CSV"
                  movements={movements}
                />
              </div>
            </div>

            {movements.length > 0 ? (
              <>
                <div className="flex gap-2 sm:hidden">
                  <Button
                    className="h-9 flex-1"
                    onClick={() => setMobileToolsOpen((current) => !current)}
                    type="button"
                    variant={mobileToolsOpen || hasActiveFilters ? "secondary" : "outline"}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filtros e ações
                    <ChevronDown className={cn("h-4 w-4 transition-transform", mobileToolsOpen && "rotate-180")} />
                  </Button>
                  <MovementsCsvExportButton
                    buttonClassName="h-9 w-auto px-3 text-xs"
                    className="w-auto shrink-0"
                    filename="fechoumei-movimentacoes.csv"
                    label="CSV"
                    movements={movements}
                  />
                  <Button
                    className="h-9"
                    disabled={movements.length === 0}
                    onClick={selectionMode ? exitSelectionMode : startSelectionMode}
                    type="button"
                    variant={selectionMode ? "secondary" : "outline"}
                  >
                    {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                    <span className="sr-only">{selectionMode ? "Cancelar seleção" : "Selecionar registros"}</span>
                  </Button>
                </div>

                <div className={cn("hidden sm:block", mobileToolsOpen && "block sm:block")}>
                  <div className="rounded-md border border-neutral-200 bg-neutral-50/70 p-3">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_0.8fr_0.9fr_0.9fr]">
                      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">
                        Buscar
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                          <Input
                            className="h-10 border-neutral-200 bg-white pl-9 shadow-none focus-visible:ring-emerald-700"
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Descrição ou categoria"
                            type="search"
                            value={searchTerm}
                          />
                        </div>
                      </label>

                      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">
                        Tipo
                        <Select
                          className="h-10 border-neutral-200 bg-white shadow-none focus-visible:ring-emerald-700"
                          onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                          value={typeFilter}
                        >
                          <option value="todos">Todos</option>
                          <option value="entrada">Entradas</option>
                          <option value="despesa">Despesas</option>
                        </Select>
                      </label>

                      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">
                        Categoria
                        <Select
                          className="h-10 border-neutral-200 bg-white shadow-none focus-visible:ring-emerald-700"
                          onChange={(event) => setCategoryFilter(event.target.value)}
                          value={categoryFilter}
                        >
                          <option value="todas">Todas</option>
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </Select>
                      </label>

                      <label className="space-y-1.5 text-xs font-semibold text-neutral-600">
                        Período
                        <Select
                          className="h-10 border-neutral-200 bg-white shadow-none focus-visible:ring-emerald-700"
                          onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
                          value={periodFilter}
                        >
                          <option value="todos">Todos</option>
                          <option value="este-mes">Este mês</option>
                          <option value="mes-anterior">Mês anterior</option>
                          <option value="ultimos-30-dias">Últimos 30 dias</option>
                        </Select>
                      </label>
                    </div>

                    {hasActiveFilters ? (
                      <div className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-medium text-neutral-500">
                          Mostrando apenas os registros que combinam com a busca e os filtros.
                        </p>
                        <Button className="h-8 w-full sm:w-auto" onClick={clearFilters} size="sm" type="button" variant="ghost">
                          Limpar filtros
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {selectionMode ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/80 p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    {selectedCount === 0
                      ? "Selecione os registros que deseja excluir"
                      : `${selectedCount} registro(s) selecionado(s)`}
                  </p>
                  <p className="text-xs leading-5 text-emerald-800">
                    A exclusão em massa pede confirmação antes de remover.
                  </p>
                </div>
                <div className="grid gap-2 sm:flex sm:items-center">
                  <Button
                    className="h-9 w-full sm:w-auto"
                    disabled={filteredMovementIds.length === 0}
                    onClick={allFilteredSelected ? clearSelectedMovements : selectAllFilteredMovements}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {allFilteredSelected ? "Desselecionar tudo" : "Selecionar tudo"}
                  </Button>
                  <Button
                    className="h-9 w-full sm:w-auto"
                    disabled={selectedCount === 0 || isPending}
                    onClick={() => setBulkDeleteOpen(true)}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir selecionados
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {movements.length === 0 ? (
            <Card className="border-dashed border-neutral-300 bg-neutral-50/70 shadow-none">
              <CardContent className="p-5 text-sm leading-6 text-neutral-600">
                <p className="font-medium text-neutral-950">Nenhuma movimentação registrada ainda.</p>
                <p className="mt-1">Use o formulário acima para lançar sua primeira entrada recebida ou despesa paga.</p>
                <p className="mt-1 text-xs font-medium text-neutral-500">
                  Depois disso, os filtros, a busca e a exportação em CSV ficam disponíveis aqui.
                </p>
              </CardContent>
            </Card>
          ) : filteredMovements.length === 0 ? (
            <Card className="border-dashed border-neutral-300 bg-neutral-50/70 shadow-none">
              <CardContent className="p-5 text-sm leading-6 text-neutral-600">
                <p className="font-medium text-neutral-950">Nenhum registro encontrado.</p>
                <p className="mt-1">Ajuste a busca, o tipo, a categoria ou o período para ver outros registros.</p>
                <Button className="mt-3 h-9 w-full sm:w-auto" onClick={clearFilters} size="sm" type="button" variant="outline">
                  Limpar filtros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[19rem] space-y-2 overflow-y-auto overflow-x-hidden pr-1 overscroll-contain md:max-h-[32rem] lg:max-h-[34rem]">
              {filteredMovements.map((movement) => {
                const isEditing = editingId === movement.id;
                const isIncome = movement.type === "entrada";
                const isSelected = selectedIds.has(movement.id);

                return (
                  <Card
                    className={cn(
                      "relative overflow-hidden border-neutral-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition-colors",
                      isIncome ? "before:bg-emerald-500" : "before:bg-red-400",
                      "before:absolute before:inset-y-0 before:left-0 before:w-1",
                      isEditing && "border-emerald-300 bg-emerald-50/20 shadow-[0_10px_30px_rgba(16,185,129,0.12)]",
                      isSelected && "border-emerald-300 bg-emerald-50/40 shadow-[0_10px_30px_rgba(16,185,129,0.14)]",
                    )}
                    key={movement.id}
                  >
                    <CardContent className="space-y-2.5 p-3 pl-4 sm:p-4 sm:pl-5">
                      <div className={cn("grid gap-2.5", selectionMode ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]")}>
                        {selectionMode ? (
                          <button
                            aria-label={isSelected ? "Remover registro da seleção" : "Selecionar registro"}
                            aria-pressed={isSelected}
                            className={cn(
                              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition-colors",
                              isSelected
                                ? "border-emerald-300 text-emerald-700"
                                : "border-neutral-200 text-neutral-400 hover:border-emerald-200 hover:text-emerald-700",
                            )}
                            onClick={() => toggleSelection(movement.id)}
                            type="button"
                          >
                            {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                        ) : null}

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={isIncome ? "success" : "danger"}
                              className={cn(
                                "px-2 py-0.5 text-[11px]",
                                isIncome
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-red-200 bg-red-50 text-red-700",
                              )}
                            >
                              {isIncome ? "Entrada" : "Despesa"}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold leading-5 text-neutral-950 sm:text-base">
                            {movement.description}
                          </p>
                          <p className="mt-1 inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                            {movement.category}
                          </p>
                        </div>

                        <p
                          className={cn(
                            "shrink-0 pt-0.5 text-right text-sm font-bold tabular-nums sm:text-base",
                            isIncome ? "text-emerald-700" : "text-red-600",
                          )}
                        >
                          {toCurrency(movement.amount)}
                        </p>
                      </div>

                      {isEditing ? (
                        <form
                          className="space-y-4 rounded-md border border-emerald-200 bg-white p-3 shadow-sm"
                          noValidate
                          onSubmit={(event) => handleUpdate(movement.id, event)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <Badge variant="success" className="w-fit">
                              Editando este registro
                            </Badge>
                            <Button onClick={cancelEdit} size="sm" type="button" variant="ghost">
                              <X className="h-4 w-4" />
                              Cancelar edição
                            </Button>
                          </div>

                          <MovementFields compact form={editForm} idPrefix={`edit-${movement.id}`} onChange={updateEditField} />

                          <Button className="h-10 w-full sm:w-auto" disabled={isPending} type="submit">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                            Salvar alterações
                          </Button>
                        </form>
                      ) : selectionMode ? (
                        <div className="flex items-center justify-end border-t border-neutral-100 pt-2">
                          <Button
                            className="h-8 rounded-md px-2.5 text-xs font-semibold"
                            onClick={() => toggleSelection(movement.id)}
                            size="sm"
                            type="button"
                            variant={isSelected ? "secondary" : "ghost"}
                          >
                            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            {isSelected ? "Selecionado" : "Selecionar"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 border-t border-neutral-100 pt-2">
                          <Button
                            className="h-8 rounded-md px-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
                            onClick={() => startEdit(movement)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only">Editar</span>
                          </Button>
                          <Button
                            className="h-8 rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50 hover:text-red-700"
                            disabled={isPending}
                            onClick={() => requestDelete(movement)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only sm:not-sr-only">Excluir</span>
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
      </div>

      {pendingDelete ? (
        <div
          aria-labelledby="delete-movement-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 sm:items-center sm:justify-center sm:p-4"
          role="dialog"
        >
          <div className="w-full rounded-lg bg-white p-4 shadow-lg sm:max-w-sm">
            <h2 className="text-base font-semibold text-neutral-950" id="delete-movement-title">
              Excluir este registro?
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Você está prestes a excluir "{pendingDelete.description}". Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button disabled={isPending} onClick={() => setPendingDelete(null)} type="button" variant="outline">
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

      {bulkDeleteOpen ? (
        <div
          aria-labelledby="bulk-delete-movement-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 sm:items-center sm:justify-center sm:p-4"
          role="dialog"
        >
          <div className="w-full rounded-lg bg-white p-4 shadow-lg sm:max-w-sm">
            <h2 className="text-base font-semibold text-neutral-950" id="bulk-delete-movement-title">
              Excluir registros selecionados?
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Você está prestes a excluir {selectedCount} registro(s). Essa ação não pode ser desfeita.
            </p>
            {selectedMovements.length > 0 ? (
              <div className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-2">
                {selectedMovements.slice(0, 5).map((movement) => (
                  <p className="truncate text-xs font-medium text-neutral-600" key={movement.id}>
                    {movement.description} · {toCurrency(movement.amount)}
                  </p>
                ))}
                {selectedMovements.length > 5 ? (
                  <p className="text-xs font-medium text-neutral-500">+{selectedMovements.length - 5} outro(s) registro(s)</p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button disabled={isPending} onClick={() => setBulkDeleteOpen(false)} type="button" variant="outline">
                Cancelar
              </Button>
              <Button disabled={isPending || selectedCount === 0} onClick={confirmBulkDelete} type="button" variant="destructive">
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

function SummaryCard({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: "income" | "expense" | "balance";
  value: string;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-neutral-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7f7f7_100%)] shadow-[0_8px_20px_rgba(15,23,42,0.06)]",
        "after:absolute after:inset-x-0 after:top-0 after:h-1",
        tone === "income" && "after:bg-emerald-500",
        tone === "expense" && "after:bg-red-400",
        tone === "balance" && "after:bg-neutral-800",
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-[11px]">{label}</p>
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm",
              tone === "income" && "border-emerald-100 text-emerald-700",
              tone === "expense" && "border-red-100 text-red-600",
              tone === "balance" && "border-neutral-200 text-neutral-700",
            )}
          >
            {icon}
          </span>
        </div>
        <div className="mt-2 min-w-0">
          <p
            className={cn(
              "truncate text-sm font-bold tabular-nums text-neutral-950 sm:text-xl",
              tone === "income" && "text-emerald-700",
              tone === "expense" && "text-red-600",
            )}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
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
  tone = "category",
  value,
}: {
  name: string;
  onChange: (value: string) => void;
  options: Option[];
  required?: boolean;
  tone?: "type" | "category";
  value: string;
}) {
  return (
    <>
      <div
        className={cn(
          tone === "type"
            ? "grid grid-cols-2 rounded-md border border-neutral-200 bg-neutral-100 p-1"
            : "flex flex-wrap gap-2",
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const isExpense = option.value === "despesa";

          return (
            <button
              aria-pressed={selected}
              className={cn(
                "rounded-md text-sm font-semibold transition-colors",
                tone === "type" && "min-h-10 border border-transparent px-3 py-1.5 text-center",
                tone === "category" && "min-h-8 border px-2.5 py-1.5 text-xs",
                selected &&
                  (tone === "type" && isExpense
                    ? "bg-white text-red-700 shadow-sm"
                    : tone === "type"
                      ? "bg-white text-emerald-800 shadow-sm"
                      : isExpense
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"),
                !selected &&
                  (tone === "type"
                    ? "text-neutral-600 hover:bg-white/70 hover:text-neutral-950"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"),
              )}
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
      {required && !value ? <p className="text-xs text-neutral-500">Escolha uma categoria para continuar.</p> : null}
    </>
  );
}
