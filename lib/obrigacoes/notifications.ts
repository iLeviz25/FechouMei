import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ReminderPreferences } from "@/types/database";

export type ObligationNotificationStatus = "overdue" | "soon" | "pending";

export type ObligationNotification = {
  description: string;
  dueDateLabel: string;
  href: string;
  id: string;
  status: ObligationNotificationStatus;
  statusLabel: string;
  title: string;
};

type ChecklistItem = {
  done: boolean;
  key: string;
  label: string;
};

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const checklistTemplate = [
  { key: "conferir-entradas", label: "Conferir entradas do mes" },
  { key: "conferir-despesas", label: "Conferir despesas do mes" },
  { key: "revisar-fechamento", label: "Revisar o fechamento do mes" },
  { key: "pagar-das", label: "Pagar DAS mensal" },
  { key: "entregar-dasn", label: "Entregar DASN-SIMEI anual" },
  { key: "guardar-comprovantes", label: "Guardar comprovantes do mes" },
];

export async function getObligationNotificationsForUser({
  monthKey,
  supabase,
  userId,
}: {
  monthKey: string;
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  try {
    const [checklistResult, preferencesResult] = await Promise.all([
      supabase
        .from("obrigacoes_checklist")
        .select("item_key, done")
        .eq("user_id", userId)
        .eq("month", monthKey),
      supabase
        .from("reminder_preferences")
        .select("user_id, das_monthly_enabled, dasn_annual_enabled, monthly_review_enabled, receipts_enabled, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (checklistResult.error || preferencesResult.error) {
      console.warn("[obrigacoes.notifications] failed to load notifications", {
        checklistError: checklistResult.error?.message,
        preferencesError: preferencesResult.error?.message,
      });
      return [];
    }

    const checklist = checklistTemplate.map((item) => ({
      ...item,
      done: checklistResult.data?.find((row) => row.item_key === item.key)?.done ?? false,
    }));

    return deriveObligationNotifications({
      checklist,
      monthKey,
      preferences: preferencesResult.data ?? createDefaultReminderPreferences(userId),
    });
  } catch (error) {
    console.warn("[obrigacoes.notifications] unexpected failure", error);
    return [];
  }
}

export function deriveObligationNotifications({
  checklist,
  monthKey,
  preferences,
}: {
  checklist: ChecklistItem[];
  monthKey: string;
  preferences: ReminderPreferences;
}): ObligationNotification[] {
  const [year, month] = monthKey.split("-").map(Number);
  const monthIndex = month - 1;
  const monthEndDate = new Date(year, month, 0);
  const reviewDate = new Date(year, month, 3);
  const dasDueDate = new Date(year, monthIndex, 20);
  const dasnDueDate = new Date(year, 4, 31);
  const notifications: ObligationNotification[] = [];

  if (preferences.das_monthly_enabled && isPending(checklist, "pagar-das")) {
    notifications.push(
      createNotification({
        description: "O DAS mensal ainda esta pendente no checklist.",
        dueDate: dasDueDate,
        id: "pagar-das",
        title: "Pagar DAS mensal",
      }),
    );
  }

  if (preferences.dasn_annual_enabled && isPending(checklist, "entregar-dasn")) {
    notifications.push(
      createNotification({
        description: `A declaracao anual referente a ${year - 1} ainda esta pendente.`,
        dueDate: dasnDueDate,
        id: "entregar-dasn",
        title: "Entregar DASN-SIMEI",
      }),
    );
  }

  if (
    preferences.monthly_review_enabled &&
    (isPending(checklist, "conferir-entradas") ||
      isPending(checklist, "conferir-despesas") ||
      isPending(checklist, "revisar-fechamento"))
  ) {
    notifications.push(
      createNotification({
        description: "Revise entradas, despesas e fechamento antes de virar o mes.",
        dueDate: reviewDate,
        id: "revisao-mensal",
        title: "Revisao mensal pendente",
      }),
    );
  }

  if (preferences.receipts_enabled && isPending(checklist, "guardar-comprovantes")) {
    notifications.push(
      createNotification({
        description: "Separe notas, recibos e comprovantes do periodo.",
        dueDate: monthEndDate,
        id: "guardar-comprovantes",
        title: "Separar comprovantes",
      }),
    );
  }

  return notifications.sort((a, b) => statusWeight(a.status) - statusWeight(b.status));
}

function createNotification({
  description,
  dueDate,
  id,
  title,
}: {
  description: string;
  dueDate: Date;
  id: string;
  title: string;
}): ObligationNotification {
  const daysUntil = getDaysUntil(dueDate, new Date());
  const status: ObligationNotificationStatus =
    daysUntil < 0 ? "overdue" : daysUntil <= 5 ? "soon" : "pending";

  return {
    description,
    dueDateLabel: formatDueDate(dueDate),
    href: "/app/obrigacoes",
    id,
    status,
    statusLabel: getStatusLabel(status, daysUntil),
    title,
  };
}

function isPending(checklist: ChecklistItem[], key: string) {
  return !(checklist.find((item) => item.key === key)?.done ?? false);
}

function getDaysUntil(dueDate: Date, today: Date) {
  return Math.round((startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / DAY_IN_MS);
}

function getStatusLabel(status: ObligationNotificationStatus, daysUntil: number) {
  if (status === "overdue") {
    return "Vencida";
  }

  if (status === "soon") {
    return daysUntil === 0 ? "Vence hoje" : `Em ${daysUntil} dias`;
  }

  return "Pendente";
}

function statusWeight(status: ObligationNotificationStatus) {
  if (status === "overdue") {
    return 0;
  }

  if (status === "soon") {
    return 1;
  }

  return 2;
}

function formatDueDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(".", "");
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function createDefaultReminderPreferences(userId: string): ReminderPreferences {
  const timestamp = new Date().toISOString();

  return {
    created_at: timestamp,
    das_monthly_enabled: false,
    dasn_annual_enabled: false,
    monthly_review_enabled: false,
    receipts_enabled: false,
    updated_at: timestamp,
    user_id: userId,
  };
}
