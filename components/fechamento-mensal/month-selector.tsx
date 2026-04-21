"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type MonthSelectorProps = {
  monthValue: string;
  yearValue: string;
  nextHref: string;
  previousHref: string;
};

const monthOptions = [
  { label: "Janeiro", value: "01" },
  { label: "Fevereiro", value: "02" },
  { label: "Março", value: "03" },
  { label: "Abril", value: "04" },
  { label: "Maio", value: "05" },
  { label: "Junho", value: "06" },
  { label: "Julho", value: "07" },
  { label: "Agosto", value: "08" },
  { label: "Setembro", value: "09" },
  { label: "Outubro", value: "10" },
  { label: "Novembro", value: "11" },
  { label: "Dezembro", value: "12" },
];

export function MonthSelector({ monthValue, yearValue, nextHref, previousHref }: MonthSelectorProps) {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(monthValue);
  const [selectedYear, setSelectedYear] = useState(yearValue);
  const yearOptions = useMemo(
    () => Array.from({ length: 7 }, (_, index) => String(Number(yearValue) - 3 + index)),
    [yearValue],
  );

  useEffect(() => {
    setSelectedMonth(monthValue);
    setSelectedYear(yearValue);
  }, [monthValue, yearValue]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthParam = `${selectedYear}-${selectedMonth}`;
    router.push(`/app/fechamento-mensal?month=${monthParam}`);
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white/90 p-3 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Período</p>
          <p className="mt-1 text-sm font-semibold text-neutral-950">Escolha o mês do fechamento</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            asChild
            className="h-8 w-8 border-neutral-200 bg-white p-0 text-neutral-600 hover:text-neutral-950 sm:h-8 sm:w-auto sm:px-2.5"
            size="sm"
            variant="outline"
          >
            <Link aria-label="Mês anterior" href={previousHref}>
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Anterior</span>
            </Link>
          </Button>
          <Button
            asChild
            className="h-8 w-8 border-neutral-200 bg-white p-0 text-neutral-600 hover:text-neutral-950 sm:h-8 sm:w-auto sm:px-2.5"
            size="sm"
            variant="outline"
          >
            <Link aria-label="Próximo mês" href={nextHref}>
              <span className="hidden sm:inline">Próximo</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <form
        className="mt-3 grid grid-cols-[minmax(0,1fr)_104px] gap-2 sm:grid-cols-[minmax(0,1fr)_96px_86px]"
        onSubmit={handleSubmit}
      >
        <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Mês
          <Select
            className="h-9 border-neutral-200 bg-white px-2.5 py-1.5 text-sm leading-5 shadow-none focus-visible:ring-emerald-200"
            name="monthValue"
            onChange={(event) => setSelectedMonth(event.target.value)}
            value={selectedMonth}
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
          Ano
          <Select
            className="h-9 border-neutral-200 bg-white px-2.5 py-1.5 text-sm leading-5 shadow-none focus-visible:ring-emerald-200"
            name="year"
            onChange={(event) => setSelectedYear(event.target.value)}
            value={selectedYear}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </Select>
        </label>

        <Button
          className="col-span-2 h-9 px-3 text-xs sm:col-span-1 sm:self-end"
          size="sm"
          type="submit"
          variant="outline"
        >
          Ver mês
        </Button>
      </form>
    </div>
  );
}
