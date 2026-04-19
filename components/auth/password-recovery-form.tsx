"use client";

import { type FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function getRecoveryRedirectUrl() {
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  callbackUrl.searchParams.set("next", "/redefinir-senha");
  return callbackUrl.toString();
}

export function PasswordRecoveryForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "danger">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessageTone("danger");
      setMessage("Informe o e-mail da sua conta.");
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getRecoveryRedirectUrl(),
    });

    setIsSubmitting(false);

    if (error) {
      setMessageTone("danger");
      setMessage(error.message);
      return;
    }

    setMessageTone("success");
    setMessage("Enviamos um link de redefinição. Verifique sua caixa de entrada e o spam.");
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="recoveryEmail">E-mail da conta</Label>
            <Input
              id="recoveryEmail"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@empresa.com"
              required
              type="email"
              value={email}
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

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar link de redefinição
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
