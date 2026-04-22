"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    router.push(`/app/fechamento-mensal?month=${selectedYear}-${selectedMonth}`);
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Periodo</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Escolha o mes do fechamento</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="icon" variant="outline">
              <Link aria-label="Mes anterior" href={previousHref}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="icon" variant="outline">
              <Link aria-label="Proximo mes" href={nextHref}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]" onSubmit={handleSubmit}>
          <label className="space-y-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Mes
            <Select onChange={(event) => setSelectedMonth(event.target.value)} value={selectedMonth}>
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Ano
            <Select onChange={(event) => setSelectedYear(event.target.value)} value={selectedYear}>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </label>

          <Button className="sm:col-span-2" type="submit" variant="outline">
            Ver fechamento
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
