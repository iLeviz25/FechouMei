import {
  provisionPaidCustomerAccess,
  type PaidCustomerAccessProvisioningResult,
} from "@/lib/billing/access-provisioning";
import type { ExtractedCaktoOrder } from "@/lib/billing/cakto-events";
import type { createServiceRoleClient } from "@/lib/supabase/admin";

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

export type CaktoAccessProvisioningResult =
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
      reason: "buyer_email_not_found";
      operations: string[];
    };

export async function provisionAccessForPaidCaktoOrder(
  supabase: ServiceRoleClient,
  order: ExtractedCaktoOrder,
): Promise<CaktoAccessProvisioningResult> {
  if (!order.customerEmail) {
    console.warn("[cakto-provisioning] Buyer email was not resolved.", {
      caktoOrderId: order.caktoOrderId,
      caktoOfferId: order.caktoOfferId,
    });

    return {
      status: "pending",
      reason: "buyer_email_not_found",
      operations: [],
    };
  }

  console.info("[cakto-provisioning] Access provisioning started.", {
    caktoOrderId: order.caktoOrderId,
    caktoOfferId: order.caktoOfferId,
    email: maskEmail(order.customerEmail),
  });

  const result: PaidCustomerAccessProvisioningResult = await provisionPaidCustomerAccess(supabase, {
    email: order.customerEmail,
    name: order.customerName,
    source: "cakto",
    logPrefix: "cakto-provisioning",
  });

  console.info("[cakto-provisioning] Access activated.", {
    caktoOrderId: order.caktoOrderId,
    email: maskEmail(order.customerEmail),
    inviteSent: result.inviteSent,
    userCreated: result.userCreated,
    userId: result.userId,
  });

  return {
    status: "provisioned",
    userId: result.userId,
    email: result.email,
    userCreated: result.userCreated,
    inviteSent: result.inviteSent,
    operations: result.operations,
  };
}

function maskEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return "***";
  }

  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
}
