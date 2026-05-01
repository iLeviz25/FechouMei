import type { Json } from "@/types/database";

const defaultAsaasApiBaseUrl = "https://api-sandbox.asaas.com/v3";

export type AsaasCustomerFromApi = {
  id: string;
  email: string | null;
  name: string | null;
  cpfCnpj: string | null;
  rawPayload: Json;
};

export type GetAsaasCustomerResult =
  | {
      ok: true;
      customer: AsaasCustomerFromApi;
    }
  | {
      ok: false;
      reason:
        | "asaas_api_not_configured"
        | "asaas_customer_not_found"
        | "asaas_customer_invalid_response"
        | "asaas_customer_request_failed";
      error?: string;
    };

export async function getAsaasCustomerById(customerId: string): Promise<GetAsaasCustomerResult> {
  const apiKey = process.env.ASAAS_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: false,
      reason: "asaas_api_not_configured",
    };
  }

  const baseUrl = getAsaasApiBaseUrl();
  const url = `${baseUrl}/customers/${encodeURIComponent(customerId)}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        access_token: apiKey,
      },
      method: "GET",
    });

    if (response.status === 404) {
      return {
        ok: false,
        reason: "asaas_customer_not_found",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: "asaas_customer_request_failed",
        error: `HTTP ${response.status}`,
      };
    }

    const payload = await response.json();

    if (!isRecord(payload)) {
      return {
        ok: false,
        reason: "asaas_customer_invalid_response",
      };
    }

    const id = getString(payload, ["id"]);

    if (!id) {
      return {
        ok: false,
        reason: "asaas_customer_invalid_response",
      };
    }

    return {
      ok: true,
      customer: {
        id,
        email: getString(payload, ["email"]),
        name: getString(payload, ["name"]),
        cpfCnpj: getString(payload, ["cpfCnpj", "cpf_cnpj", "cpfCNPJ"]),
        rawPayload: payload as Json,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "asaas_customer_request_failed",
      error: sanitizeAsaasClientError(error),
    };
  }
}

function getAsaasApiBaseUrl() {
  const configuredBaseUrl = process.env.ASAAS_API_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || defaultAsaasApiBaseUrl;
  return baseUrl.replace(/\/+$/, "");
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeAsaasClientError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 300);
  }

  return "Unknown Asaas client error";
}
