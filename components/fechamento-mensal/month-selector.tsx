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
    <div className="rounded-md border border-neutral-200/80 bg-neutral-50/80 p-3 shadow-none">
      <p className="mb-2 text-[10px] font-semibold uppercase leading-none tracking-wide text-neutral-500">
        Mês do fechamento
      </p>
      <form className="grid grid-cols-[minmax(0,1fr)_84px_76px] gap-2" onSubmit={handleSubmit}>
        <label className="space-y-1.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-neutral-500">
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
        <label className="space-y-1.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-neutral-500">
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
        <Button className="h-9 self-end border-neutral-200 bg-white px-2 text-xs" size="sm" type="submit" variant="outline">
          Aplicar
        </Button>
      </form>

      <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-neutral-200/70 pt-2">
        <Button asChild className="h-8 bg-transparent px-1.5 text-xs font-medium text-neutral-500 hover:bg-white hover:text-neutral-700" size="sm" variant="ghost">
          <Link href={previousHref}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Mês anterior
          </Link>
        </Button>
        <Button asChild className="h-8 bg-transparent px-1.5 text-xs font-medium text-neutral-500 hover:bg-white hover:text-neutral-700" size="sm" variant="ghost">
          <Link href={nextHref}>
            Próximo mês
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
