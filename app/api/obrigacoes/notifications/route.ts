import { NextResponse } from "next/server";
import { getObligationNotificationsForUser } from "@/lib/obrigacoes/notifications";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
  year: "numeric",
});

function getCurrentMonthKey() {
  const parts = monthFormatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(new Date().getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ notifications: [] }, { status: 401 });
  }

  const notifications = await getObligationNotificationsForUser({
    monthKey: getCurrentMonthKey(),
    supabase,
    userId: user.id,
  });

  return NextResponse.json({ notifications });
}
