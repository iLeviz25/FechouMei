"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);
  const [messageTone, setMessageTone] = useState<"success" | "danger">(initialTone);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        setMessage(getAuthErrorMessage(error, "Nao foi possivel entrar agora."));
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
      const destination = profile?.onboarding_completed ? safeRedirect ?? "/app/dashboard" : "/onboarding";

      router.replace(destination);
      router.refresh();
    } catch (error) {
      setMessage(getAuthErrorMessage(error, "Nao foi possivel entrar agora."));
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden border-border/70">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="rounded-2xl bg-muted/50 p-4">
          <p className="text-sm font-bold text-foreground">Seu mes organizado em poucos toques.</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Entre para acompanhar movimentacoes, fechamento, obrigacoes e a Helena no mesmo lugar.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor="email">
              E-mail
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoComplete="email"
                className="pl-10"
                id="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com"
                required
                type="email"
                value={email}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground" htmlFor="password">
                Senha
              </Label>
              <Link className="text-xs font-bold text-primary hover:underline" href="/recuperar-senha">
                Esqueci minha senha
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoComplete="current-password"
                className="pl-10 pr-11"
                id="password"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Sua senha"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {message ? (
            <p
              className={
                messageTone === "success"
                  ? "rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm leading-6 text-success"
                  : "rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
              }
            >
              {message}
            </p>
          ) : null}

          <Button className="group w-full" disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar no FechouMEI
            {!isSubmitting ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /> : null}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
