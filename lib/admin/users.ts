import { createClient } from "@/lib/supabase/server";

export type AdminRole = "user" | "admin";
export type AdminUserRoleFilter = "all" | AdminRole;
export type AdminWhatsappFilter = "all" | "linked" | "unlinked";

export type AdminUserListItem = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: AdminRole;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  whatsappStatus: string;
  whatsappLinkedAt: string | null;
  whatsappLastInboundAt: string | null;
  movementsCount: number;
  helenaMessagesCount: number;
};

export type AdminUsersResult = {
  available: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  users: AdminUserListItem[];
};

export type AdminUserDetailEvent = {
  source: string;
  kind: string;
  title: string;
  detail: string | null;
  createdAt: string | null;
};

export type AdminUserDetail = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: AdminRole;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  workType: string | null;
  businessMode: string | null;
  mainCategory: string | null;
  mainGoal: string | null;
  onboardingCompleted: boolean;
  whatsapp: {
    status: string;
    linkedAt: string | null;
    lastInboundAt: string | null;
  };
  metrics: {
    movementsTotal: number;
    entradasTotal: number;
    despesasTotal: number;
    helenaMessagesTotal: number;
    lastActivityAt: string | null;
  };
  recentEvents: AdminUserDetailEvent[];
};

export type AdminUserDetailResult = {
  available: boolean;
  error: string | null;
  user: AdminUserDetail | null;
};

const defaultPageSize = 20;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function parseRole(value: unknown): AdminRole {
  return value === "admin" ? "admin" : "user";
}

export function normalizeAdminUserFilters(searchParams: Record<string, string | string[] | undefined>) {
  const query = getSingle(searchParams.q)?.trim() ?? "";
  const roleParam = getSingle(searchParams.role);
  const whatsappParam = getSingle(searchParams.whatsapp);
  const pageParam = Number(getSingle(searchParams.page) ?? "1");

  return {
    page: Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1,
    query,
    role: roleParam === "user" || roleParam === "admin" ? roleParam : "all",
    whatsapp: whatsappParam === "linked" || whatsappParam === "unlinked" ? whatsappParam : "all",
  } satisfies {
    page: number;
    query: string;
    role: AdminUserRoleFilter;
    whatsapp: AdminWhatsappFilter;
  };
}

function getSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseUsers(value: unknown): AdminUserListItem[] {
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
        email: asString(record.email),
        role: parseRole(record.role),
        createdAt: asString(record.createdAt),
        updatedAt: asString(record.updatedAt),
        lastSignInAt: asString(record.lastSignInAt),
        lastActivityAt: asString(record.lastActivityAt),
        whatsappStatus: asString(record.whatsappStatus) ?? "none",
        whatsappLinkedAt: asString(record.whatsappLinkedAt),
        whatsappLastInboundAt: asString(record.whatsappLastInboundAt),
        movementsCount: asNumber(record.movementsCount),
        helenaMessagesCount: asNumber(record.helenaMessagesCount),
      },
    ];
  });
}

function emptyUsersResult(page: number, error: string | null): AdminUsersResult {
  return {
    available: false,
    error,
    page,
    pageSize: defaultPageSize,
    total: 0,
    totalPages: 1,
    users: [],
  };
}

export async function listAdminUsers(filters: {
  page: number;
  query: string;
  role: AdminUserRoleFilter;
  whatsapp: AdminWhatsappFilter;
}): Promise<AdminUsersResult> {
  const page = Math.max(filters.page, 1);
  const pageSize = defaultPageSize;
  const pageOffset = (page - 1) * pageSize;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_users", {
    page_offset: pageOffset,
    page_size: pageSize,
    role_filter: filters.role === "all" ? null : filters.role,
    search_text: filters.query || null,
    whatsapp_filter: filters.whatsapp === "all" ? null : filters.whatsapp,
  });

  if (error) {
    console.error("[admin-users] Failed to list users", error);
    return emptyUsersResult(page, error.message);
  }

  const payload = asRecord(data);
  const total = asNumber(payload.total);
  const parsedPageSize = asNumber(payload.pageSize) || pageSize;
  const totalPages = Math.max(Math.ceil(total / parsedPageSize), 1);

  return {
    available: true,
    error: null,
    page,
    pageSize: parsedPageSize,
    total,
    totalPages,
    users: parseUsers(payload.users),
  };
}

function parseEvents(value: unknown): AdminUserDetailEvent[] {
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
        kind: asString(record.kind) ?? "evento",
        title,
        detail: asString(record.detail),
        createdAt: asString(record.createdAt),
      },
    ];
  });
}

function parseUserDetail(value: unknown): AdminUserDetail | null {
  const record = asRecord(value);
  const id = asString(record.id);

  if (!id) {
    return null;
  }

  const whatsapp = asRecord(record.whatsapp);
  const metrics = asRecord(record.metrics);

  return {
    id,
    fullName: asString(record.fullName),
    email: asString(record.email),
    role: parseRole(record.role),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
    lastSignInAt: asString(record.lastSignInAt),
    workType: asString(record.workType),
    businessMode: asString(record.businessMode),
    mainCategory: asString(record.mainCategory),
    mainGoal: asString(record.mainGoal),
    onboardingCompleted: asBoolean(record.onboardingCompleted),
    whatsapp: {
      status: asString(whatsapp.status) ?? "none",
      linkedAt: asString(whatsapp.linkedAt),
      lastInboundAt: asString(whatsapp.lastInboundAt),
    },
    metrics: {
      movementsTotal: asNumber(metrics.movementsTotal),
      entradasTotal: asNumber(metrics.entradasTotal),
      despesasTotal: asNumber(metrics.despesasTotal),
      helenaMessagesTotal: asNumber(metrics.helenaMessagesTotal),
      lastActivityAt: asString(metrics.lastActivityAt),
    },
    recentEvents: parseEvents(record.recentEvents),
  };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetailResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_user_detail", {
    target_user_id: userId,
  });

  if (error) {
    console.error("[admin-users] Failed to load user detail", error);
    return {
      available: false,
      error: error.message,
      user: null,
    };
  }

  return {
    available: true,
    error: null,
    user: parseUserDetail(data),
  };
}

export async function updateAdminUserRole(targetUserId: string, newRole: AdminRole) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Sessao admin nao encontrada.",
      ok: false,
    };
  }

  if (targetUserId === user.id && newRole === "user") {
    return {
      error: "Voce nao pode remover seu proprio acesso admin.",
      ok: false,
    };
  }

  const { error } = await supabase.rpc("set_user_role", {
    new_role: newRole,
    target_user_id: targetUserId,
  });

  if (error) {
    console.error("[admin-users] Failed to update role", error);
    return {
      error: error.message,
      ok: false,
    };
  }

  return {
    error: null,
    ok: true,
  };
}
