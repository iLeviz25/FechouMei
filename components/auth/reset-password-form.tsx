"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [canReset, setCanReset] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "danger">("danger");

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      const supabase = createClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (error || !user) {
        setCanReset(false);
        setMessageTone("danger");
        setMessage("Abra o link de recuperação enviado por e-mail para criar uma nova senha.");
      } else {
        setCanReset(true);
      }

      setIsCheckingSession(false);
    }

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!canReset) {
      setMessageTone("danger");
      setMessage("Solicite um novo link de recuperação antes de redefinir a senha.");
      return;
    }

    if (password.length < 6) {
      setMessageTone("danger");
      setMessage("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessageTone("danger");
      setMessage("As senhas não conferem.");
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setIsSubmitting(false);
      setMessageTone("danger");
      setMessage(error.message);
      return;
    }

    await supabase.auth.signOut();

    setPassword("");
    setConfirmPassword("");
    setIsSuccess(true);
    setIsSubmitting(false);
    setMessageTone("success");
    setMessage("Senha redefinida com sucesso. Entre novamente com a nova senha.");
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo de 6 caracteres"
              required
              type="password"
              value={password}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">Confirmar nova senha</Label>
            <Input
              id="confirmNewPassword"
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a nova senha"
              required
              type="password"
              value={confirmPassword}
            />
          </div>

          {message ? (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-sm leading-6",
                messageTone === "danger"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              )}
            >
              {message}
            </p>
          ) : null}

          <Button className="w-full" disabled={isCheckingSession || isSubmitting || isSuccess} type="submit">
            {isCheckingSession || isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar nova senha
          </Button>

          {isSuccess ? (
            <Button asChild className="w-full" type="button" variant="outline">
              <Link href="/login">Entrar com a nova senha</Link>
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
