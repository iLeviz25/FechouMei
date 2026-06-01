import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(".env.local");
loadEnvFile(".env");

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/grant-admin.mjs email@example.com");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let user;

try {
  user = await findUserByEmail(email);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not find Supabase auth user.");
  process.exit(1);
}

if (!user) {
  console.error(`No Supabase auth user found for ${email}.`);
  process.exit(1);
}

const { data: profile, error: updateError } = await supabase
  .from("profiles")
  .update({ role: "admin" })
  .eq("id", user.id)
  .select("id, role")
  .maybeSingle();

if (updateError) {
  if (updateError.message.includes("'role' column") || updateError.message.includes("schema cache")) {
    console.error(
      "Could not update profile role because the admin roles migration has not been applied to this Supabase project yet.",
    );
    console.error("Run the latest migration first, then rerun this script.");
    process.exit(1);
  }

  console.error(`Could not update profile role: ${updateError.message}`);
  process.exit(1);
}

if (!profile) {
  console.error(`No profile found for ${email} (${user.id}).`);
  process.exit(1);
}

console.log(`Granted admin role to ${email}.`);

async function findUserByEmail(targetEmail) {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Could not list users: ${error.message}`);
    }

    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === targetEmail);

    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
