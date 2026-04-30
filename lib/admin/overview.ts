import { createClient } from "@/lib/supabase/server";

export type RecentAdminUser = {
  id: string;
  fullName: string | null;
  role: string;
  createdAt: string | null;
};

export type RecentAdminMovement = {
  id: string;
  type: "entrada" | "despesa" | string;
  description: string;
  category: string;
  amount: number | null;
  occurredOn: string | null;
  createdAt: string | null;
  userName: string | null;
};

export type RecentAdminErrorEvent = {
  source: string;
  title: string;
  status: string;
  detail: string | null;
  createdAt: string | null;
};

type MetricSection = {
  available: boolean;
  reason?: string;
};

export type AdminOverviewMetrics = {
  generatedAt: string | null;
  users: MetricSection & {
    total: number | null;
    createdLast7Days: number | null;
    createdLast30Days: number | null;
    recent: RecentAdminUser[];
  };
  roles: MetricSection & {
    user: number | null;
    admin: number | null;
  };
  whatsapp: MetricSection & {
    linkedUsers: number | null;
    unlinkedUsers: number | null;
    totalLinks: number | null;
    activationPercentage: number | null;
  };
  movements: MetricSection & {
    total: number | null;
    entradas: number | null;
    despesas: number | null;
    createdLast7Days: number | null;
    recent: RecentAdminMovement[];
  };
  helena: MetricSection & {
    messagesTotal: number | null;
    messagesLast7Days: number | null;
  };
  errors: MetricSection & {
    recentTotal: number | null;
    recent: RecentAdminErrorEvent[];
  };
  health: MetricSection & {
    database: string;
    admin: string;
    whatsapp: string;
    helena: string;
    logs: string;
  };
};

const unavailableReason = "Metrica admin indisponivel no momento.";

function createUnavailableOverview(reason = unavailableReason): AdminOverviewMetrics {
  const section = { available: false, reason };

  return {
    generatedAt: null,
    users: {
      ...section,
      total: null,
      createdLast7Days: null,
      createdLast30Days: null,
      recent: [],
    },
    roles: {
      ...section,
      user: null,
      admin: null,
    },
    whatsapp: {
      ...section,
      linkedUsers: null,
      unlinkedUsers: null,
      totalLinks: null,
      activationPercentage: null,
    },
    movements: {
      ...section,
      total: null,
      entradas: null,
      despesas: null,
      createdLast7Days: null,
      recent: [],
    },
    helena: {
      ...section,
      messagesTotal: null,
      messagesLast7Days: null,
    },
    errors: {
      ...section,
      recentTotal: null,
      recent: [],
    },
    health: {
      ...section,
      database: "unavailable",
      admin: "unavailable",
      whatsapp: "unavailable",
      helena: "unavailable",
      logs: "unavailable",
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function parseRecentUsers(value: unknown): RecentAdminUser[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = asString(record.id);

    if (!id) {
      return [];
    }

    return [
      {
        id,
        fullName: asString(record.fullName),
        role: asString(record.role) ?? "user",
        createdAt: asString(record.createdAt),
      },
    ];
  });
}

function parseRecentMovements(value: unknown): RecentAdminMovement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = asString(record.id);
    const description = asString(record.description);

    if (!id || !description) {
      return [];
    }

    return [
      {
        id,
        type: asString(record.type) ?? "entrada",
        description,
        category: asString(record.category) ?? "Sem categoria",
        amount: asNumber(record.amount),
        occurredOn: asString(record.occurredOn),
        createdAt: asString(record.createdAt),
        userName: asString(record.userName),
      },
    ];
  });
}

function parseRecentErrors(value: unknown): RecentAdminErrorEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = asRecord(item);
    const source = asString(record.source);
    const title = asString(record.title);

    if (!source || !title) {
      return [];
    }

    return [
      {
        source,
        title,
        status: asString(record.status) ?? "failed",
        detail: asString(record.detail),
        createdAt: asString(record.createdAt),
      },
    ];
  });
}

function parseOverviewPayload(payload: unknown): AdminOverviewMetrics {
  const root = asRecord(payload);

  if (!Object.keys(root).length) {
    return createUnavailableOverview();
  }

  const users = asRecord(root.users);
  const roles = asRecord(root.roles);
  const whatsapp = asRecord(root.whatsapp);
  const movements = asRecord(root.movements);
  const helena = asRecord(root.helena);
  const errors = asRecord(root.errors);
  const health = asRecord(root.health);

  return {
    generatedAt: asString(root.generatedAt),
    users: {
      available: asBoolean(users.available),
      total: asNumber(users.total),
      createdLast7Days: asNumber(users.createdLast7Days),
      createdLast30Days: asNumber(users.createdLast30Days),
      recent: parseRecentUsers(users.recent),
    },
    roles: {
      available: asBoolean(roles.available),
      user: asNumber(roles.user),
      admin: asNumber(roles.admin),
    },
    whatsapp: {
      available: asBoolean(whatsapp.available),
      linkedUsers: asNumber(whatsapp.linkedUsers),
      unlinkedUsers: asNumber(whatsapp.unlinkedUsers),
      totalLinks: asNumber(whatsapp.totalLinks),
      activationPercentage: asNumber(whatsapp.activationPercentage),
    },
    movements: {
      available: asBoolean(movements.available),
      total: asNumber(movements.total),
      entradas: asNumber(movements.entradas),
      despesas: asNumber(movements.despesas),
      createdLast7Days: asNumber(movements.createdLast7Days),
      recent: parseRecentMovements(movements.recent),
    },
    helena: {
      available: asBoolean(helena.available),
      messagesTotal: asNumber(helena.messagesTotal),
      messagesLast7Days: asNumber(helena.messagesLast7Days),
    },
    errors: {
      available: asBoolean(errors.available),
      recentTotal: asNumber(errors.recentTotal),
      recent: parseRecentErrors(errors.recent),
    },
    health: {
      available: asBoolean(health.available),
      database: asString(health.database) ?? "unavailable",
      admin: asString(health.admin) ?? "unavailable",
      whatsapp: asString(health.whatsapp) ?? "unavailable",
      helena: asString(health.helena) ?? "unavailable",
      logs: asString(health.logs) ?? "unavailable",
    },
  };
}

export async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_overview_metrics");

  if (error) {
    console.error("[admin-overview] Failed to load metrics", error);
    return createUnavailableOverview(error.message);
  }

  return parseOverviewPayload(data);
}
