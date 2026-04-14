"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.user && data.session) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          full_name: fullName,
          onboarding_completed: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (profileError) {
        setMessage(profileError.message);
        setIsSubmitting(false);
        return;
      }

      router.replace("/onboarding");
      router.refresh();
      return;
    }

    setIsSuccess(true);
    setMessage("Conta criada. Confirme seu e-mail para liberar o primeiro acesso.");
    setIsSubmitting(false);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="fullName">Nome completo</Label>
        <Input
          id="fullName"
          autoComplete="name"
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Seu nome"
          required
          value={fullName}
        />
      </div>

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
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          autoComplete="new-password"
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Minimo de 6 caracteres"
          required
          type="password"
          value={password}
        />
      </div>

      {message ? (
        <div
          className={
            isSuccess
              ? "flex items-start gap-3 rounded-xl border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground"
              : "rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          }
        >
          {isSuccess && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
          <span>{message}</span>
        </div>
      ) : null}

      <Button className="w-full gap-2" disabled={isSubmitting || isSuccess} type="submit" size="lg">
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Criar conta
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
