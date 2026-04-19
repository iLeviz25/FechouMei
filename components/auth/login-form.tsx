"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthErrorMessage, getProfileErrorMessage, normalizeAuthEmail } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  initialMessage?: string;
  initialTone?: "success" | "danger";
  redirectedFrom?: string;
};

export function LoginForm({ initialMessage, initialTone = "danger", redirectedFrom }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);
  const [messageTone, setMessageTone] = useState<"success" | "danger">(initialTone);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setMessageTone("danger");
    setIsSubmitting(true);

    const normalizedEmail = normalizeAuthEmail(email);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        setMessage(getAuthErrorMessage(error, "Não foi possível entrar agora."));
        setIsSubmitting(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        setMessage(getProfileErrorMessage());
        setIsSubmitting(false);
        return;
      }

      if (!profile) {
        const { error: createProfileError } = await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            full_name:
              typeof data.user.user_metadata?.full_name === "string"
                ? data.user.user_metadata.full_name
                : null,
            onboarding_completed: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );

        if (createProfileError) {
          setMessage(getProfileErrorMessage());
          setIsSubmitting(false);
          return;
        }
      }

      const safeRedirect = redirectedFrom?.startsWith("/app/") ? redirectedFrom : null;
      const destination =
        profile?.onboarding_completed ? safeRedirect ?? "/app/dashboard" : "/onboarding";

      router.replace(destination);
      router.refresh();
    } catch (error) {
      setMessage(getAuthErrorMessage(error, "Não foi possível entrar agora."));
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@empresa.com"
              required
              type="email"
              value={email}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Senha</Label>
              <Link className="text-xs font-semibold text-emerald-700 hover:text-emerald-800" href="/recuperar-senha">
                Esqueci minha senha
              </Link>
            </div>
            <Input
              id="password"
              autoComplete="current-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Sua senha"
              required
              type="password"
              value={password}
            />
          </div>

          {message ? (
            <p
              className={
                messageTone === "success"
                  ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-700"
                  : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700"
              }
            >
              {message}
            </p>
          ) : null}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
