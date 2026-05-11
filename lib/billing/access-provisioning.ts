import type { User } from "@supabase/supabase-js";
import { buildAppUrl } from "@/lib/app-url";
import { getAsaasCustomerById } from "@/lib/billing/asaas-client";
import {
  extractAsaasCheckout,
  extractAsaasCustomer,
  extractAsaasPayment,
  extractAsaasSubscription,
} from "@/lib/billing/asaas-events";
import { asaasBillingTables } from "@/lib/billing/database";
import { getInternalAccessPlanForPaidCustomer } from "@/lib/billing/plans";
import type { ParsedAsaasWebhookEvent } from "@/lib/billing/asaas-webhook";
import type { Database, Json } from "@/types/database";

const provisioningEvents = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "CHECKOUT_PAID",
] as const;

type ProvisioningEvent = (typeof provisioningEvents)[number];
type ServiceRoleClient = ReturnType<typeof import("@/lib/supabase/admin").createServiceRoleClient>;
type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type AsaasCustomerInsert = Database["public"]["Tables"]["asaas_customers"]["Insert"];

export type AccessProvisioningResult =
  | {
      status: "skipped";
      reason: "event_does_not_grant_access";
      operations: string[];
    }
  | {
      status: "provisioned";
      userId: string;
      email: string;
      userCreated: boolean;
      inviteSent: boolean;
      operations: string[];
    }
  | {
      status: "pending";
      reason:
        | "buyer_email_not_found"
        | "asaas_customer_lookup_failed"
        | "buyer_email_invalid";
      operations: string[];
    };

export type PaidAccessSource = "asaas" | "cakto";

export type PaidCustomerAccessProvisioningResult = {
  userId: string;
  email: string;
  userCreated: boolean;
  inviteSent: boolean;
  operations: string[];
};

type ResolvedBuyer = {
  asaasCustomerId: string | null;
  email: string | null;
  emailSource: "payload" | "asaas_customers" | "asaas_api" | null;
  name: string | null;
};

type AuthUserResolution = {
  user: User;
  userCreated: boolean;
  inviteSent: boolean;
};

type BillingResourceIds = {
  asaasCheckoutId: string | null;
  asaasCustomerId: string | null;
  asaasPaymentId: string | null;
  asaasSubscriptionId: string | null;
  checkoutExternalReference: string | null;
};

export function shouldProvisionAccessForAsaasEvent(event: string): event is ProvisioningEvent {
  return (provisioningEvents as readonly string[]).includes(event);
}

export async function provisionAccessForPaidAsaasEvent(
  supabase: ServiceRoleClient,
  event: ParsedAsaasWebhookEvent,
): Promise<AccessProvisioningResult> {
  if (!shouldProvisionAccessForAsaasEvent(event.event)) {
    return {
      status: "skipped",
      reason: "event_does_not_grant_access",
      operations: [],
    };
  }

  if (!isRecord(event.payload)) {
    return {
      status: "pending",
      reason: "buyer_email_not_found",
      operations: [],
    };
  }

  console.info("[asaas-provisioning] Access provisioning started.", {
    asaasEventId: event.asaasEventId,
    event: event.event,
  });

  const buyer = await resolveBuyerForProvisioning(supabase, event.payload);

  if (!buyer.email) {
    console.warn("[asaas-provisioning] Buyer email was not resolved.", {
      asaasCustomerId: buyer.asaasCustomerId,
      event: event.event,
    });

    return {
      status: "pending",
      reason: buyer.asaasCustomerId ? "asaas_customer_lookup_failed" : "buyer_email_not_found",
      operations: [],
    };
  }

  if (!isValidEmail(buyer.email)) {
    console.warn("[asaas-provisioning] Buyer email is invalid.", {
      email: maskEmail(buyer.email),
      event: event.event,
    });

    return {
      status: "pending",
      reason: "buyer_email_invalid",
      operations: [],
    };
  }

  console.info("[asaas-provisioning] Buyer email resolved.", {
    email: maskEmail(buyer.email),
    source: buyer.emailSource,
  });

  const paidAccess = await provisionPaidCustomerAccess(supabase, {
    email: buyer.email,
    name: buyer.name,
    source: "asaas",
    logPrefix: "asaas-provisioning",
  });
  const operations = [...paidAccess.operations];

  const billingResourceIds = getBillingResourceIds(event.payload);
  await linkBillingRowsToUser(supabase, paidAccess.userId, billingResourceIds);
  operations.push("asaas_billing_user_links");

  console.info("[asaas-provisioning] Access activated.", {
    email: maskEmail(buyer.email),
    inviteSent: paidAccess.inviteSent,
    userCreated: paidAccess.userCreated,
    userId: paidAccess.userId,
  });

  return {
    status: "provisioned",
    userId: paidAccess.userId,
    email: buyer.email,
    userCreated: paidAccess.userCreated,
    inviteSent: paidAccess.inviteSent,
    operations,
  };
}

export async function provisionPaidCustomerAccess(
  supabase: ServiceRoleClient,
  {
    email,
    name,
    source,
    logPrefix,
  }: {
    email: string;
    name: string | null;
    source: PaidAccessSource;
    logPrefix: string;
  },
): Promise<PaidCustomerAccessProvisioningResult> {
  const authUser = await findOrInviteUserByEmail(supabase, email, name, source, logPrefix);
  const operations = [
    authUser.userCreated ? "supabase_auth_invite" : "supabase_auth_existing_user",
  ];

  await activateProfileAccess(supabase, authUser.user.id, {
    buyerName: name,
    isNewUser: authUser.userCreated,
  });
  operations.push("profiles");

  return {
    userId: authUser.user.id,
    email,
    userCreated: authUser.userCreated,
    inviteSent: authUser.inviteSent,
    operations,
  };
}

async function resolveBuyerForProvisioning(
  supabase: ServiceRoleClient,
  payload: Record<string, unknown>,
): Promise<ResolvedBuyer> {
  const customer = extractAsaasCustomer(payload);
  const asaasCustomerId = customer?.asaasCustomerId ?? getBillingResourceIds(payload).asaasCustomerId;
  const payloadEmail = extractBuyerEmailFromPayload(payload);
  const payloadName = extractBuyerNameFromPayload(payload) ?? customer?.name ?? null;

  if (payloadEmail) {
    return {
      asaasCustomerId,
      email: payloadEmail,
      emailSource: "payload",
      name: payloadName,
    };
  }

  if (asaasCustomerId) {
    const { data, error } = await supabase
      .from(asaasBillingTables.customers)
      .select("email, name")
      .eq("asaas_customer_id", asaasCustomerId)
      .maybeSingle();

    if (!error && data?.email) {
      return {
        asaasCustomerId,
        email: data.email,
        emailSource: "asaas_customers",
        name: data.name ?? payloadName,
      };
    }

    if (error) {
      console.warn("[asaas-provisioning] Failed to read Asaas customer from database.", {
        code: error.code,
        message: error.message,
      });
    }

    const asaasCustomer = await getAsaasCustomerById(asaasCustomerId);

    if (asaasCustomer.ok) {
      await upsertAsaasCustomerFromApi(supabase, asaasCustomer.customer);

      return {
        asaasCustomerId,
        email: asaasCustomer.customer.email,
        emailSource: asaasCustomer.customer.email ? "asaas_api" : null,
        name: asaasCustomer.customer.name ?? payloadName,
      };
    }

    console.warn("[asaas-provisioning] Failed to resolve Asaas customer through API.", {
      asaasCustomerId,
      reason: asaasCustomer.reason,
      error: asaasCustomer.error,
    });
  }

  return {
    asaasCustomerId,
    email: null,
    emailSource: null,
    name: payloadName,
  };
}

async function findOrInviteUserByEmail(
  supabase: ServiceRoleClient,
  email: string,
  fullName: string | null,
  source: PaidAccessSource,
  logPrefix: string,
): Promise<AuthUserResolution> {
  const existingUser = await findAuthUserByEmail(supabase, email);

  if (existingUser) {
    console.info(`[${logPrefix}] Existing auth user found.`, {
      email: maskEmail(email),
      userId: existingUser.id,
    });

    return {
      user: existingUser,
      userCreated: false,
      inviteSent: false,
    };
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      billing_source: source,
      full_name: fullName,
    },
    redirectTo: getInviteRedirectUrl(),
  });

  if (!error && data.user) {
    console.info(`[${logPrefix}] Auth invite sent for new user.`, {
      email: maskEmail(email),
      userId: data.user.id,
    });

    return {
      user: data.user,
      userCreated: true,
      inviteSent: true,
    };
  }

  const racedUser = await findAuthUserByEmail(supabase, email);

  if (racedUser) {
    console.info(`[${logPrefix}] Auth user found after invite conflict.`, {
      email: maskEmail(email),
      userId: racedUser.id,
    });

    return {
      user: racedUser,
      userCreated: false,
      inviteSent: false,
    };
  }

  throw new Error(`supabase_invite_failed: ${error?.message ?? "unknown error"}`);
}

async function findAuthUserByEmail(
  supabase: ServiceRoleClient,
  email: string,
): Promise<User | null> {
  const normalizedEmail = normalizeEmail(email);
  const perPage = 1000;
  const maxPages = 20;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`supabase_list_users_failed: ${error.message}`);
    }

    const match = data.users.find((user) => normalizeEmail(user.email) === normalizedEmail);

    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
}

async function activateProfileAccess(
  supabase: ServiceRoleClient,
  userId: string,
  {
    buyerName,
    isNewUser,
  }: {
    buyerName: string | null;
    isNewUser: boolean;
  },
) {
  const { data: existingProfile, error: readError } = await supabase
    .from("profiles")
    .select("id, full_name, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const now = new Date().toISOString();

  if (existingProfile) {
    const update: ProfileUpdate = {
      subscription_plan: getInternalAccessPlanForPaidCustomer(),
      subscription_status: "active",
      updated_at: now,
    };

    if (!existingProfile.full_name && buyerName) {
      update.full_name = buyerName;
    }

    if (isNewUser && existingProfile.onboarding_completed !== true) {
      update.onboarding_completed = false;
    }

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId);

    if (error) {
      throw error;
    }

    return;
  }

  const insert: ProfileInsert = {
    id: userId,
    full_name: buyerName,
    onboarding_completed: false,
    subscription_plan: getInternalAccessPlanForPaidCustomer(),
    subscription_status: "active",
    updated_at: now,
  };

  const { error } = await supabase
    .from("profiles")
    .insert(insert);

  if (error) {
    throw error;
  }
}

async function linkBillingRowsToUser(
  supabase: ServiceRoleClient,
  userId: string,
  resourceIds: BillingResourceIds,
) {
  if (resourceIds.asaasCustomerId) {
    await updateAsaasCustomerUserId(supabase, resourceIds.asaasCustomerId, userId);
    await updateAsaasPaymentsUserIdByColumn(
      supabase,
      "asaas_customer_id",
      resourceIds.asaasCustomerId,
      userId,
    );
    await updateAsaasSubscriptionsUserIdByColumn(
      supabase,
      "asaas_customer_id",
      resourceIds.asaasCustomerId,
      userId,
    );
  }

  if (resourceIds.asaasPaymentId) {
    await updateAsaasPaymentsUserIdByColumn(
      supabase,
      "asaas_payment_id",
      resourceIds.asaasPaymentId,
      userId,
    );
  }

  if (resourceIds.asaasSubscriptionId) {
    await updateAsaasSubscriptionsUserIdByColumn(
      supabase,
      "asaas_subscription_id",
      resourceIds.asaasSubscriptionId,
      userId,
    );
  }

  if (resourceIds.asaasCheckoutId) {
    await updateAsaasCheckoutsUserIdByColumn(
      supabase,
      "asaas_checkout_id",
      resourceIds.asaasCheckoutId,
      userId,
    );
  } else if (resourceIds.checkoutExternalReference) {
    await updateAsaasCheckoutsUserIdByColumn(
      supabase,
      "external_reference",
      resourceIds.checkoutExternalReference,
      userId,
    );
  }
}

async function updateAsaasCustomerUserId(
  supabase: ServiceRoleClient,
  asaasCustomerId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from(asaasBillingTables.customers)
    .update({ user_id: userId })
    .eq("asaas_customer_id", asaasCustomerId)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) {
    throw error;
  }
}

async function updateAsaasPaymentsUserIdByColumn(
  supabase: ServiceRoleClient,
  column: "asaas_customer_id" | "asaas_payment_id",
  value: string,
  userId: string,
) {
  const { error } = await supabase
    .from(asaasBillingTables.payments)
    .update({ user_id: userId })
    .eq(column, value)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) {
    throw error;
  }
}

async function updateAsaasSubscriptionsUserIdByColumn(
  supabase: ServiceRoleClient,
  column: "asaas_customer_id" | "asaas_subscription_id",
  value: string,
  userId: string,
) {
  const { error } = await supabase
    .from(asaasBillingTables.subscriptions)
    .update({ user_id: userId })
    .eq(column, value)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) {
    throw error;
  }
}

async function updateAsaasCheckoutsUserIdByColumn(
  supabase: ServiceRoleClient,
  column: "asaas_checkout_id" | "external_reference",
  value: string,
  userId: string,
) {
  const { error } = await supabase
    .from(asaasBillingTables.checkouts)
    .update({ user_id: userId })
    .eq(column, value)
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) {
    throw error;
  }
}

async function upsertAsaasCustomerFromApi(
  supabase: ServiceRoleClient,
  customer: {
    id: string;
    email: string | null;
    name: string | null;
    cpfCnpj: string | null;
    rawPayload: Json;
  },
) {
  const row: AsaasCustomerInsert = {
    asaas_customer_id: customer.id,
    email: customer.email,
    name: customer.name,
    cpf_cnpj: customer.cpfCnpj,
    raw_payload: customer.rawPayload,
  };

  const { error } = await supabase
    .from(asaasBillingTables.customers)
    .upsert(row, { onConflict: "asaas_customer_id" });

  if (error) {
    throw error;
  }
}

function getBillingResourceIds(payload: Record<string, unknown>): BillingResourceIds {
  const customer = extractAsaasCustomer(payload);
  const payment = extractAsaasPayment(payload, "PAYMENT_RECEIVED");
  const subscription = extractAsaasSubscription(payload, "SUBSCRIPTION_UPDATED");
  const checkout = extractAsaasCheckout(payload, "CHECKOUT_PAID");

  return {
    asaasCheckoutId: payment?.asaasCheckoutId ?? checkout?.asaasCheckoutId ?? null,
    asaasCustomerId:
      customer?.asaasCustomerId
      ?? payment?.asaasCustomerId
      ?? subscription?.asaasCustomerId
      ?? null,
    asaasPaymentId: payment?.asaasPaymentId ?? null,
    asaasSubscriptionId:
      payment?.asaasSubscriptionId
      ?? subscription?.asaasSubscriptionId
      ?? null,
    checkoutExternalReference: checkout?.externalReference ?? null,
  };
}

function extractBuyerEmailFromPayload(payload: Record<string, unknown>) {
  const prioritizedRecords = getBuyerCandidateRecords(payload);
  const prioritizedEmail = prioritizedRecords
    .map((record) => getString(record, ["email"]))
    .find((email) => email && isValidEmail(email));

  if (prioritizedEmail) {
    return normalizeEmail(prioritizedEmail);
  }

  const deepEmail = findEmailDeep(payload);
  return deepEmail ? normalizeEmail(deepEmail) : null;
}

function extractBuyerNameFromPayload(payload: Record<string, unknown>) {
  return getBuyerCandidateRecords(payload)
    .map((record) => getString(record, ["name", "fullName", "full_name"]))
    .find(Boolean) ?? null;
}

function getBuyerCandidateRecords(payload: Record<string, unknown>) {
  const payment = getRecord(payload.payment);
  const checkout = getRecord(payload.checkout);
  const subscription = getRecord(payload.subscription);

  return [
    getRecord(payment?.customer),
    getRecord(payment?.customerData),
    getRecord(payment?.customer_data),
    getRecord(checkout?.customer),
    getRecord(checkout?.customerData),
    getRecord(checkout?.customer_data),
    getRecord(subscription?.customer),
    getRecord(payload.customer),
    getRecord(payload.customerData),
    getRecord(payload.customer_data),
    payload,
  ].filter(isRecord);
}

function findEmailDeep(value: unknown, depth = 0): string | null {
  if (depth > 4 || !isRecord(value)) {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.toLowerCase().includes("email") && typeof nestedValue === "string" && isValidEmail(nestedValue)) {
      return nestedValue;
    }

    const nestedEmail = findEmailDeep(nestedValue, depth + 1);

    if (nestedEmail) {
      return nestedEmail;
    }
  }

  return null;
}

function getInviteRedirectUrl() {
  const redirectUrl = buildAppUrl("/auth/callback?next=/onboarding");

  if (!redirectUrl) {
    throw new Error("app_url_not_configured_for_invite_redirect");
  }

  return redirectUrl;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeEmail(email: string | null | undefined) {
  return String(email ?? "").trim().toLowerCase();
}

function maskEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return "***";
  }

  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
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

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
