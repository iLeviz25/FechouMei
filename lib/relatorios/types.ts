import type { MeiLimitInfo } from "@/lib/mei-limit";
import type { Movimentacao, Profile } from "@/types/database";

export type ReportMovement = Pick<
  Movimentacao,
  "amount" | "category" | "description" | "id" | "occurred_at" | "occurred_on" | "type"
>;

export type ReportCategorySummary = {
  category: string;
  count: number;
  percent: number;
  total: number;
  type: "entrada" | "despesa";
};

export type ReportObligationSummary = {
  done: boolean;
  key: "das" | "dasn" | "revisao" | "comprovantes";
  label: string;
  statusLabel: "Concluido" | "Pendente";
};

export type MonthlyReportData = {
  categories: {
    despesas: ReportCategorySummary[];
    entradas: ReportCategorySummary[];
  };
  identification: {
    businessMode: Profile["business_mode"] | null;
    email: string | null;
    fullName: Profile["full_name"] | null;
    mainCategory: Profile["main_category"] | null;
    monthLabel: string;
    monthValue: string;
    workType: Profile["work_type"] | null;
  };
  meiLimit: MeiLimitInfo & {
    limit: number;
  };
  movements: ReportMovement[];
  obligations: {
    items: ReportObligationSummary[];
    totalDone: number;
    totalPending: number;
  };
  summary: {
    balance: number;
    expenseCount: number;
    incomeCount: number;
    totalExpense: number;
    totalIncome: number;
    totalMovements: number;
  };
};
