export function buildClientAppUrl(path: string, currentOrigin: string) {
  return new URL(path, getClientAppBaseUrl(currentOrigin)).toString();
}

function getClientAppBaseUrl(currentOrigin: string) {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicitUrl) {
    return normalizeBaseUrl(explicitUrl);
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();

  if (vercelUrl) {
    return normalizeBaseUrl(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`);
  }

  return normalizeBaseUrl(currentOrigin);
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}
