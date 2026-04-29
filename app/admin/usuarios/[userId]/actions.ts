"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  updateAdminUserRole,
  updateAdminUserSubscription,
  type AdminRole,
  type AdminSubscriptionPlan,
  type AdminSubscriptionStatus,
} from "@/lib/admin/users";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildDetailPath(userId: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/admin/usuarios/${userId}?${query.toString()}`;
}

export async function changeAdminUserRoleAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const newRole = String(formData.get("newRole") ?? "");
  const confirmation = String(formData.get("confirmRoleChange") ?? "");

  if (!uuidPattern.test(userId)) {
    redirect("/admin/usuarios?roleError=invalid-user");
  }

  if (newRole !== "user" && newRole !== "admin") {
    redirect(buildDetailPath(userId, { roleError: "invalid-role" }));
  }

  if (confirmation !== "confirm") {
    redirect(buildDetailPath(userId, { roleError: "missing-confirmation" }));
  }

  const result = await updateAdminUserRole(userId, newRole as AdminRole);

  if (!result.ok) {
    redirect(buildDetailPath(userId, { roleError: result.error ?? "role-update-failed" }));
  }

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${userId}`);
  redirect(buildDetailPath(userId, { roleUpdated: newRole }));
}

export async function changeAdminUserSubscriptionAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const newPlan = String(formData.get("subscriptionPlan") ?? "");
  const newStatus = String(formData.get("subscriptionStatus") ?? "");
  const confirmation = String(formData.get("confirmSubscriptionChange") ?? "");

  if (!uuidPattern.test(userId)) {
    redirect("/admin/usuarios?subscriptionError=invalid-user");
  }

  if (newPlan !== "essential" && newPlan !== "pro") {
    redirect(buildDetailPath(userId, { subscriptionError: "invalid-plan" }));
  }

  if (
    newStatus !== "active" &&
    newStatus !== "pending_payment" &&
    newStatus !== "past_due" &&
    newStatus !== "canceled"
  ) {
    redirect(buildDetailPath(userId, { subscriptionError: "invalid-status" }));
  }

  if (confirmation !== "confirm") {
    redirect(buildDetailPath(userId, { subscriptionError: "missing-confirmation" }));
  }

  const result = await updateAdminUserSubscription(
    userId,
    newPlan as AdminSubscriptionPlan,
    newStatus as AdminSubscriptionStatus,
  );

  if (!result.ok) {
    redirect(buildDetailPath(userId, { subscriptionError: result.error ?? "subscription-update-failed" }));
  }

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${userId}`);
  redirect(buildDetailPath(userId, { subscriptionUpdated: "1" }));
}
