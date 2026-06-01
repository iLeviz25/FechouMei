import { createClient } from "@/lib/supabase/server";

export type AdminLogSeverity = "all" | "info" | "warning" | "error" | "critical";
export type AdminLogOrigin = "all" | "helena" | "whatsapp" | "auth" | "app" | "supabase" | "sistema" | "admin";
export type AdminLogPeriod = "24h" | "7d" | "30d";
export type AdminLogFilters = {
  origin: AdminLogOrigin;
  page: number;
  period: AdminLogPeriod;
  query: string;
  severity: AdminLogSeverity;
};

export type AdminLogEntry = {
  id: string;
  createdAt: string | null;
  origin: Exclude<AdminLogOrigin, "all">;
  severity: Exclude<AdminLogSeverity, "all">;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  message: string;
  status: string;
  detail: string | null;
};

export type AdminLogsResult = {
  available: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  metrics: {
    errorsLast24Hours: number;
    errorsLast7Days: number;
    criticalEvents: number;
    latestError: AdminLogEntry | null;
  };
  logs: AdminLogEntry[];
};

const defaultPageSize = 50;

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

function getSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeAdminLogFilters(searchParams: Record<string, string | string[] | undefined>): AdminLogFilters {
  const pageParam = Number(getSingle(searchParams.page) ?? "1");
  const severity = getSingle(searchParams.severity);
  const origin = getSingle(searchParams.origin);
  const period = getSingle(searchParams.period);

  return {
    origin: isOrigin(origin) ? origin : "all",
    page: Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1,
    period: period === "24h" || period === "30d" ? period : "7d",
    query: getSingle(searchParams.q)?.trim() ?? "",
    severity: isSeverity(severity) ? severity : "all",
  };
}

function isSeverity(value: unknown): value is AdminLogSeverity {
  return value === "all" || value === "info" || value === "warning" || value === "error" || value === "critical";
}

function isOrigin(value: unknown): value is AdminLogOrigin {
  return (
    value === "all" ||
    value === "helena" ||
    value === "whatsapp" ||
    value === "auth" ||
    value === "app" ||
    value === "supabase" ||
    value === "sistema" ||
    value === "admin"
  );
}

function parseEntry(value: unknown): AdminLogEntry | null {
  const record = asRecord(value);
  const id = asString(record.id);
  const origin = asString(record.origin);
  const severity = asString(record.severity);
  const message = asString(record.message);

  if (!id || !origin || !severity || !message) {
    return null;
  }

  return {
    id,
    createdAt: asString(record.createdAt),
    origin: isOrigin(origin) && origin !== "all" ? origin : "sistema",
    severity: isSeverity(severity) && severity !== "all" ? severity : "info",
    userId: asString(record.userId),
    userName: asString(record.userName),
    userEmail: asString(record.userEmail),
    message,
    status: asString(record.status) ?? "recorded",
    detail: asString(record.detail),
  };
}

function parseEntries(value: unknown): AdminLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const entry = parseEntry(item);
    return entry ? [entry] : [];
  });
}

function emptyResult(page: number, error: string | null): AdminLogsResult {
  return {
    available: false,
    error,
    logs: [],
    metrics: {
      criticalEvents: 0,
      errorsLast24Hours: 0,
      errorsLast7Days: 0,
      latestError: null,
    },
    page,
    pageSize: defaultPageSize,
    total: 0,
    totalPages: 1,
  };
}

export async function getAdminLogs(filters: AdminLogFilters): Promise<AdminLogsResult> {
  const page = Math.max(filters.page, 1);
  const pageSize = defaultPageSize;
  const pageOffset = (page - 1) * pageSize;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_admin_logs", {
    origin_filter: filters.origin === "all" ? null : filters.origin,
    page_offset: pageOffset,
    page_size: pageSize,
    period_filter: filters.period,
    search_text: filters.query || null,
    severity_filter: filters.severity === "all" ? null : filters.severity,
  });

  if (error) {
    console.error("[admin-logs] Failed to load logs", error);
    return emptyResult(page, error.message);
  }

  const payload = asRecord(data);
  const metrics = asRecord(payload.metrics);
  const total = asNumber(payload.total);
  const parsedPageSize = asNumber(payload.pageSize) || pageSize;
  const latestError = parseEntry(metrics.latestError);

  return {
    available: true,
    error: null,
    logs: parseEntries(payload.logs),
    metrics: {
      criticalEvents: asNumber(metrics.criticalEvents),
      errorsLast24Hours: asNumber(metrics.errorsLast24Hours),
      errorsLast7Days: asNumber(metrics.errorsLast7Days),
      latestError,
    },
    page,
    pageSize: parsedPageSize,
    total,
    totalPages: Math.max(Math.ceil(total / parsedPageSize), 1),
  };
}
