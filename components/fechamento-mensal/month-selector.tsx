"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type MonthSelectorProps = {
  monthValue: string;
  yearValue: string;
  nextHref: string;
  previousHref: string;
};

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const monthParam = `${selectedYear}-${selectedMonth}`;
    router.push(`/app/fechamento-mensal?month=${monthParam}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:items-end">
      <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="monthValue">
            Mes
          </label>
          <select
            className="h-10 w-24 rounded-lg border border-input bg-card px-3 text-sm transition-colors hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-ring"
            id="monthValue"
            name="monthValue"
            onChange={(event) => setSelectedMonth(event.target.value)}
            value={selectedMonth}
          >
            {[
              "01",
              "02",
              "03",
              "04",
              "05",
              "06",
              "07",
              "08",
              "09",
              "10",
              "11",
              "12",
            ].map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="year">
            Ano
          </label>
          <select
            className="h-10 w-20 rounded-lg border border-input bg-card px-3 text-sm transition-colors hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-ring"
            id="year"
            name="year"
            onChange={(event) => setSelectedYear(event.target.value)}
            value={selectedYear}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <Button size="default" type="submit" variant="outline">
          Ver mes
        </Button>
      </form>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href={previousHref}>Mes anterior</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={nextHref}>Proximo mes</Link>
        </Button>
      </div>
    </div>
  );
}
