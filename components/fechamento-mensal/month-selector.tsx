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
      <form className="flex flex-wrap gap-2" onSubmit={handleSubmit}>
        <label className="text-xs text-neutral-500">
          Mês
          <select
            className="mt-1 w-28 rounded-md border border-input bg-background px-2 py-1 text-sm"
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
        </label>
        <label className="text-xs text-neutral-500">
          Ano
          <select
            className="mt-1 w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
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
        </label>
        <Button size="sm" type="submit" variant="outline">
          Ver mês
        </Button>
      </form>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={previousHref}>Mês anterior</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={nextHref}>Próximo mês</Link>
        </Button>
      </div>
    </div>
  );
}
