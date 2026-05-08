"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckSquare,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  WalletCards,
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MovementCreateSheet } from "@/components/movimentacoes/movement-create-sheet";
import {
  createEmptyMovementForm,
  movementCategories,
  MovementFields,
  toMovementFormState,
  validateMovementForm,
  type MovementFormState,
  type MovementItem,
} from "@/components/movimentacoes/movement-form-fields";
import { getMovementVisualTone } from "@/lib/movement-visuals";
import { cn } from "@/lib/utils";

type MovimentacoesManagerProps = {
  initialBalance: number;
  movements: MovementItem[];
};

type PeriodFilter = "todos" | "este-mes" | "mes-anterior" | "ultimos-30-dias";
type TypeFilter = "todos" | "entrada" | "despesa";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function toCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function formatSignedCurrency(value: number) {
  if (value === 0) {
    return toCurrency(0);
  }

  return `${value > 0 ? "+" : "-"} ${toCurrency(Math.abs(value))}`;
}

export function MovimentacoesManager({ initialBalance, movements }: MovimentacoesManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createForm, setCreateForm] = useState<MovementFormState>(() => createEmptyMovementForm());
  const [createFeedback, setCreateFeedback] = useState<MovementActionResult | null>(null);
  const [editForm, setEditForm] = useState<MovementFormState>(() => createEmptyMovementForm());
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
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => {
    return movements.reduce(
      (acc, movement) => {
        if (movement.type === "entrada") {
          acc.income += movement.amount;
          acc.incomeCount += 1;
        } else {
          acc.expense += movement.amount;
          acc.expenseCount += 1;
        }

        return acc;
      },
      { income: 0, expense: 0, incomeCount: 0, expenseCount: 0 },
    );
  }, [movements]);

  const safeInitialBalance = Number.isFinite(initialBalance) ? initialBalance : 0;
  const balance = safeInitialBalance + summary.income - summary.expense;

  const categoryOptions = useMemo(() => {
    const knownCategories = new Set(movementCategories.map(normalizeSearchValue));
    const extraCategories = movements
      .map((movement) => movement.category)
      .filter((category) => category && !knownCategories.has(normalizeSearchValue(category)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    return [...movementCategories, ...extraCategories];
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

  const groupedMovements = useMemo(() => {
    const groups = new Map<string, MovementItem[]>();

    filteredMovements
      .slice()
      .sort((a, b) => {
        const aValue = a.occurred_at ?? `${a.occurred_on}T00:00:00`;
        const bValue = b.occurred_at ?? `${b.occurred_on}T00:00:00`;
        return bValue.localeCompare(aValue);
      })
      .forEach((movement) => {
        const key = movement.occurred_on;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(movement);
      });

    return Array.from(groups.entries());
  }, [filteredMovements]);

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
  const mobileListShouldScroll = filteredMovements.length > 4 && editingId === null;

  useEffect(() => {
    if (searchParams.get("nova") !== "1") {
      return;
    }

    setCreateFeedback(null);
    setMobileCreateOpen(true);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("nova");
    const nextQuery = nextParams.toString();

    router.replace(nextQuery ? `/app/movimentacoes?${nextQuery}` : "/app/movimentacoes", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => existingMovementIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [existingMovementIds]);

  function updateCreateField(field: keyof MovementFormState, value: string) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field: keyof MovementFormState, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(createEmptyMovementForm());
  }

  function startEdit(movement: MovementItem) {
    setFeedback(null);
    setPendingDelete(null);
    setEditingId(movement.id);
    setEditForm(toMovementFormState(movement));
  }

  function clearFilters() {
    setSearchTerm("");
    setTypeFilter("todos");
    setCategoryFilter("todas");
    setPeriodFilter("todos");
  }

  function openMobileCreate() {
    setMobileCreateOpen(true);
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
      setCreateFeedback({ ok: false, message: validationMessage });
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createMovimentacao(formData);
      setCreateFeedback(result.ok ? null : result);
      setFeedback(result.ok ? { ok: true, message: "Movimentação adicionada." } : null);

      if (result.ok) {
        setCreateForm(createEmptyMovementForm());
        setMobileCreateOpen(false);
        router.refresh();
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
      setFeedback(result.ok ? { ok: true, message: "Alterações salvas." } : result);

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
      setFeedback(result.ok ? { ok: true, message: "Movimentação excluída." } : result);

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
                  ? "Movimentação excluída."
                  : `${result.deletedCount ?? selectedCount} movimentações excluídas.`,
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
    <div className="mobile-section-gap">
      <header className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Histórico do MEI</p>
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Movimentações</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Registre e acompanhe o que entrou e saiu do seu MEI.
          </p>
        </div>
      </header>

      <section className="summary-shell rounded-[32px] p-3.5 sm:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <SummaryCard
            helper={formatCount(summary.incomeCount, "entrada registrada", "entradas registradas")}
            icon={<ArrowDownLeft className="h-4 w-4" />}
            label="Entradas"
            tone="success"
            value={toCurrency(summary.income)}
          />
          <SummaryCard
            helper={formatCount(summary.expenseCount, "despesa registrada", "despesas registradas")}
            icon={<ArrowUpRight className="h-4 w-4" />}
            label="Despesas"
            tone="danger"
            value={toCurrency(summary.expense)}
          />
          <SummaryCard
            className="col-span-2 lg:col-span-1"
            featured
            helper={safeInitialBalance !== 0 ? "Inclui saldo atual" : "Entradas menos despesas"}
            icon={<WalletCards className="h-4 w-4" />}
            iconTone={balance >= 0 ? "success" : "danger"}
            label="Saldo atual"
            tone="neutral"
            valueTone={balance >= 0 ? "success" : "danger"}
            value={toCurrency(balance)}
          />
        </div>
      </section>

      {feedback ? (
        <p
          aria-live="polite"
          className={cn(
            "rounded-[24px] border px-4 py-3 text-sm leading-6",
            feedback.ok ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="hidden xl:block">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Adicionar agora</p>
                  <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Adicionar movimentação</h2>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Plus className="h-4 w-4" />
                </div>
              </div>

              <form className="space-y-5" noValidate onSubmit={handleCreate}>
                <MovementFields form={createForm} idPrefix="create" onChange={updateCreateField} />

                {createFeedback ? (
                  <p
                    className={cn(
                      "rounded-[20px] border px-4 py-3 text-sm leading-6",
                      createFeedback.ok
                        ? "border-success/20 bg-success/10 text-success"
                        : "border-destructive/20 bg-destructive/10 text-destructive",
                    )}
                    role="status"
                  >
                    {createFeedback.message}
                  </p>
                ) : null}

                <Button className="w-full" disabled={isPending} type="submit">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Salvar movimentação
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <section className="min-w-0 space-y-4 overflow-x-hidden">
          <Card className="max-w-full overflow-hidden rounded-[30px]">
            <CardContent className="min-w-0 space-y-4 p-4 sm:p-6">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Busca e filtros
                </p>
                <h2 className="text-lg font-extrabold tracking-tight text-foreground">Encontre movimentações antigas</h2>
              </div>

              <div className="surface-panel-muted flex min-w-0 items-center gap-3 rounded-[24px] border border-border/60 px-3.5 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  className="h-10 min-w-0 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por descrição ou categoria"
                  value={searchTerm}
                />
              </div>

              <div className="grid min-w-0 gap-2.5">
                <OptionGroup
                  className="min-w-0"
                  name="type-filter"
                  onChange={(value) => setTypeFilter(value as TypeFilter)}
                  options={[
                    { value: "todos", label: "Todas" },
                    { value: "entrada", label: "Entradas" },
                    { value: "despesa", label: "Despesas" },
                  ]}
                  showCheckIcon={false}
                  value={typeFilter}
                />

                <div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  <div className="relative min-w-0">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Select
                      className="h-10 min-w-0 rounded-full border-border/70 bg-card/85 pl-9 pr-8 shadow-none"
                      onChange={(event) => setCategoryFilter(event.target.value)}
                      value={categoryFilter}
                    >
                      <option value="todas">Categoria</option>
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="relative min-w-0">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Select
                      className="h-10 min-w-0 rounded-full border-border/70 bg-card/85 pl-9 pr-8 shadow-none"
                      onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
                      value={periodFilter}
                    >
                      <option value="todos">Período</option>
                      <option value="este-mes">Este mês</option>
                      <option value="mes-anterior">Mês anterior</option>
                      <option value="ultimos-30-dias">Últimos 30 dias</option>
                    </Select>
                  </div>
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="surface-panel-muted flex flex-col gap-2 rounded-[24px] border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">Mostrando apenas o que combina com sua busca e filtros.</p>
                  <Button onClick={clearFilters} size="sm" type="button" variant="ghost">
                    <Filter className="h-4 w-4" />
                    Limpar filtros
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="surface-panel max-w-full overflow-hidden rounded-[30px] p-3.5 sm:p-5">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/75 px-3 py-1.5">
                    <span className="h-3 w-3 rounded-full border border-border/70 bg-card" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      {formatCount(filteredMovements.length, "movimentação", "movimentações")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-extrabold tracking-tight text-foreground">Histórico de movimentações</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {mobileListShouldScroll
                        ? "As mais recentes aparecem primeiro. Role para ver mais."
                        : "Confira entradas e despesas por data."}
                    </p>
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
                  <Button
                    className="min-w-0 w-full px-2.5 text-[11px] min-[360px]:text-xs sm:w-auto sm:px-3.5"
                    onClick={selectionMode ? exitSelectionMode : startSelectionMode}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                    {selectionMode ? "Cancelar" : "Selecionar"}
                  </Button>
                  <MovementsCsvExportButton
                    buttonClassName="h-9 min-w-0 w-full px-2.5 text-[11px] min-[360px]:text-xs sm:w-auto sm:px-3"
                    className="min-w-0 w-full sm:w-auto"
                    filename="fechoumei-movimentacoes.csv"
                    label="Exportar CSV"
                    movements={filteredMovements}
                  />
                </div>
              </div>
            </div>
          </div>

          {selectionMode ? (
            <div className="surface-panel rounded-[24px] border-primary/16 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {selectedCount === 0
                      ? "Selecione as movimentações que deseja excluir"
                      : formatCount(selectedCount, "movimentação selecionada", "movimentações selecionadas")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Toque em qualquer card para marcar ou desmarcar. A exclusão sempre pede confirmação.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={filteredMovementIds.length === 0}
                    onClick={allFilteredSelected ? clearSelectedMovements : selectAllFilteredMovements}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {allFilteredSelected ? "Desselecionar tudo" : "Selecionar tudo"}
                  </Button>
                  <Button
                    disabled={selectedCount === 0 || isPending}
                    onClick={() => setBulkDeleteOpen(true)}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir selecionadas
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {movements.length === 0 ? (
            <EmptyState
              actionLabel="Adicionar movimentação"
              description="Adicione uma entrada ou despesa para começar a acompanhar seu mês."
              onAction={openMobileCreate}
              title="Nenhuma movimentação registrada ainda."
            />
          ) : filteredMovements.length === 0 ? (
            <EmptyState
              actionLabel="Limpar filtros"
              description="Tente mudar o período, tipo ou termo de busca."
              onAction={clearFilters}
              title="Nada encontrado com esses filtros."
            />
          ) : (
            <div className="max-w-full overflow-hidden rounded-[28px] border border-border/70 bg-white/70 p-2.5 sm:p-3">
              <div
                className={cn(
                  "max-w-full space-y-4",
                  mobileListShouldScroll &&
                    "scroll-chain-y max-h-[31rem] overflow-y-auto pr-1 md:max-h-none md:overflow-visible md:pr-0",
                )}
              >
                {groupedMovements.map(([date, items]) => {
                  const dateBalance = items.reduce(
                    (total, item) => total + (item.type === "entrada" ? item.amount : item.amount * -1),
                    0,
                  );

                  return (
                    <div className="min-w-0 space-y-2.5" key={date}>
                      <div className="flex min-w-0 items-center gap-3 px-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{toDate(date)}</p>
                        <div className="h-px flex-1 bg-border/70" />
                        <p
                          className={cn(
                            "shrink-0 text-xs font-semibold tabular",
                            dateBalance > 0 && "text-primary",
                            dateBalance < 0 && "text-destructive",
                            dateBalance === 0 && "text-muted-foreground",
                          )}
                        >
                          {formatSignedCurrency(dateBalance)}
                        </p>
                      </div>

                      <div className="min-w-0 space-y-2.5">
                        {items.map((movement) => {
                          const editing = editingId === movement.id;
                          const income = movement.type === "entrada";
                          const tone = getMovementVisualTone(movement.type);
                          const selected = selectedIds.has(movement.id);

                          return (
                            <Card
                              className={cn(
                                "w-full max-w-full overflow-hidden rounded-[24px] border border-border/70 bg-white/90 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.35)] transition-[background-color,border-color,box-shadow,transform]",
                                selectionMode && "cursor-pointer active:scale-[0.995]",
                                selected && "border-success/25 bg-success/10",
                                editing && "border-primary/20 bg-primary-soft/20",
                              )}
                              aria-pressed={selectionMode ? selected : undefined}
                              key={movement.id}
                              onClick={
                                selectionMode && !editing
                                  ? () => toggleSelection(movement.id)
                                  : undefined
                              }
                              onKeyDown={
                                selectionMode && !editing
                                  ? (event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        toggleSelection(movement.id);
                                      }
                                    }
                                  : undefined
                              }
                              role={selectionMode && !editing ? "button" : undefined}
                              tabIndex={selectionMode && !editing ? 0 : undefined}
                            >
                              <CardContent className="min-w-0 space-y-3.5 p-3.5 sm:p-4">
                                <div
                                  className={cn(
                                    "grid min-w-0 items-start gap-3",
                                    selectionMode ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
                                  )}
                                >
                                  {selectionMode ? (
                                    <div
                                      aria-hidden="true"
                                      className={cn(
                                        "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors",
                                        selected
                                          ? "border-success bg-success text-success-foreground"
                                          : "border-border bg-card text-muted-foreground",
                                      )}
                                    >
                                      {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                    </div>
                                  ) : null}

                                  <div className="flex min-w-0 gap-3">
                                    <div
                                      className={cn(
                                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                                        tone.iconClass,
                                      )}
                                    >
                                      {income ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={tone.badgeClass} variant="outline">
                                          {tone.label}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          {movement.occurred_at ? toDateTime(movement.occurred_at) : toDate(movement.occurred_on)}
                                        </span>
                                      </div>
                                      <p className="mt-2 truncate text-sm font-bold leading-5 text-foreground">{movement.description}</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-muted/65 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                          {movement.category}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <p className={cn("pt-0.5 text-right font-mono text-[0.95rem] font-extrabold tabular sm:text-base", tone.amountClass)}>
                                    {income ? "+" : "-"} {toCurrency(movement.amount)}
                                  </p>
                                </div>

                                {editing ? (
                                  <form className="surface-panel-muted space-y-4 rounded-[24px] p-4" noValidate onSubmit={(event) => handleUpdate(movement.id, event)}>
                                    <div className="flex items-center justify-between gap-3">
                                      <Badge variant="success">Editando movimentação</Badge>
                                      <Button onClick={cancelEdit} size="sm" type="button" variant="ghost">
                                        <X className="h-4 w-4" />
                                        Cancelar
                                      </Button>
                                    </div>

                                    <MovementFields compact form={editForm} idPrefix={`edit-${movement.id}`} onChange={updateEditField} />

                                    <Button disabled={isPending} type="submit">
                                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                                      Salvar alterações
                                    </Button>
                                  </form>
                                ) : (
                                  <div className="flex flex-wrap justify-end gap-2 pt-0.5">
                                    <Button onClick={() => startEdit(movement)} size="sm" type="button" variant="outline">
                                      <Pencil className="h-4 w-4" />
                                      Editar
                                    </Button>
                                    <Button
                                      disabled={isPending}
                                      onClick={() => requestDelete(movement)}
                                      size="sm"
                                      type="button"
                                      variant="ghost"
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <MovementCreateSheet
        onCreated={() => setFeedback({ ok: true, message: "Movimentação adicionada." })}
        onOpenChange={setMobileCreateOpen}
        open={mobileCreateOpen}
        viewportClassName="xl:hidden"
      />

      {pendingDelete ? (
        <div
          aria-labelledby="delete-movement-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 sm:items-center sm:justify-center sm:p-4"
          role="dialog"
        >
          <div className="w-full rounded-[28px] bg-card p-5 shadow-elevated sm:max-w-sm">
            <h2 className="text-base font-extrabold text-foreground" id="delete-movement-title">
              Excluir movimentação?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Essa movimentação será removida do seu histórico. Essa ação não pode ser desfeita.
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
          <div className="w-full rounded-[28px] bg-card p-5 shadow-elevated sm:max-w-sm">
            <h2 className="text-base font-extrabold text-foreground" id="bulk-delete-movement-title">
              Excluir movimentações selecionadas?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              As movimentações selecionadas serão removidas do seu histórico. Essa ação não pode ser desfeita.
            </p>
            {selectedMovements.length > 0 ? (
              <div className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-[20px] border border-border/70 bg-muted/30 p-3">
                {selectedMovements.slice(0, 5).map((movement) => (
                  <p className="truncate text-xs font-semibold text-muted-foreground" key={movement.id}>
                    {movement.description} - {toCurrency(movement.amount)}
                  </p>
                ))}
                {selectedMovements.length > 5 ? (
                  <p className="text-xs font-semibold text-muted-foreground">
                    +{formatCount(selectedMovements.length - 5, "outra movimentação", "outras movimentações")}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button disabled={isPending} onClick={() => setBulkDeleteOpen(false)} type="button" variant="outline">
                Cancelar
              </Button>
              <Button disabled={isPending || selectedCount === 0} onClick={confirmBulkDelete} type="button" variant="destructive">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir selecionadas
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  className,
  featured,
  helper,
  icon,
  iconTone,
  label,
  tone,
  valueTone,
  value,
}: {
  className?: string;
  featured?: boolean;
  helper?: string;
  icon: ReactNode;
  iconTone?: "success" | "danger" | "neutral";
  label: string;
  tone: "success" | "danger" | "neutral";
  valueTone?: "success" | "danger" | "neutral";
  value: string;
}) {
  const resolvedValueTone = valueTone ?? tone;
  const resolvedIconTone = iconTone ?? tone;

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[26px] border shadow-none",
        tone === "success" &&
          "border-primary/14 bg-[linear-gradient(180deg,hsl(152_60%_96%)_0%,hsl(152_36%_92%)_100%)]",
        tone === "danger" &&
          "border-destructive/16 bg-[linear-gradient(180deg,hsl(0_100%_99%)_0%,hsl(0_82%_95%)_100%)]",
        tone === "neutral" &&
          "border-border/90 bg-[linear-gradient(180deg,hsl(0_0%_100%)_0%,hsl(150_16%_95%)_100%)]",
        featured && "min-h-[9.25rem]",
        className,
      )}
    >
      <CardContent className={cn(featured ? "p-4 sm:p-5" : "p-3.5 sm:p-4", featured && "flex h-full flex-col justify-between")}>
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-[0.1em] sm:text-[11px]",
              tone === "success" && "text-primary/80",
              tone === "danger" && "text-destructive/80",
              tone === "neutral" && "text-foreground/60",
            )}
          >
            {label}
          </p>
          <div
            className={cn(
              "icon-tile flex shrink-0 items-center justify-center rounded-2xl",
              featured ? "h-10 w-10" : "h-9 w-9",
              resolvedIconTone === "success" && "bg-white/70 text-primary",
              resolvedIconTone === "danger" && "bg-white/75 text-destructive",
              resolvedIconTone === "neutral" && "bg-white/80 text-foreground",
            )}
          >
            {icon}
          </div>
        </div>

        <div className={cn("min-w-0", featured ? "mt-4" : "mt-3")}>
          <p
            className={cn(
              "max-w-full pr-0.5 font-mono font-extrabold tabular leading-[1.02] tracking-tight",
              featured ? "text-[clamp(2rem,8vw,3rem)]" : "text-[clamp(0.95rem,3.9vw,1.52rem)]",
              resolvedValueTone === "success" && "text-primary",
              resolvedValueTone === "danger" && "text-destructive",
              resolvedValueTone === "neutral" && "text-foreground",
            )}
          >
            {value}
          </p>
          {helper ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{helper}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  actionLabel = "Adicionar movimentação",
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  description: string;
  onAction: () => void;
  title: string;
}) {
  return (
    <Card className="surface-panel-ghost border-dashed">
      <CardContent className="p-6 text-center">
        <div className="icon-tile mx-auto flex h-12 w-12 items-center justify-center rounded-[20px] bg-primary-soft text-primary">
          <Plus className="h-5 w-5" />
        </div>
        <p className="mt-4 text-base font-extrabold text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <Button className="mt-4" onClick={onAction} size="sm" type="button">
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

type Option = {
  label: string;
  value: string;
};

function OptionGroup({
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
  options: Option[];
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
