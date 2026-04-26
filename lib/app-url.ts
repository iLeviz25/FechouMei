export function getAppBaseUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();

  if (explicitUrl) {
    return normalizeBaseUrl(explicitUrl);
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();

  if (vercelUrl) {
    return normalizeBaseUrl(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`);
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return "http://localhost:3000";
}

export function buildAppUrl(path: string) {
  const baseUrl = getAppBaseUrl();
  return baseUrl ? new URL(path, baseUrl).toString() : null;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}
