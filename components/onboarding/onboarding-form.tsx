"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

type OnboardingFormProps = {
  profile: Profile | null;
};

const workTypeOptions = [
  "Prestador de serviço",
  "Comércio",
  "Autônomo formalizado",
  "Criador ou profissional digital",
  "Outro",
];

const businessModeOptions = [
  { value: "servico", label: "Serviço" },
  { value: "produto", label: "Produto" },
  { value: "ambos", label: "Ambos" },
];

const categoryOptions = [
  "Beleza e estética",
  "Alimentação",
  "Consultoria",
  "Educação",
  "Manutenção e reparos",
  "Comércio varejista",
  "Marketing e conteúdo",
  "Tecnologia",
  "Outro",
];

const goalOptions = [
  "organizar receitas e despesas",
  "fechar o mês sem planilha",
  "acompanhar limite do MEI",
];

export function OnboardingForm({ profile }: OnboardingFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [workType, setWorkType] = useState(profile?.work_type ?? workTypeOptions[0]);
  const [businessMode, setBusinessMode] = useState(profile?.business_mode ?? "servico");
  const [mainCategory, setMainCategory] = useState(profile?.main_category ?? categoryOptions[0]);
  const [mainGoal, setMainGoal] = useState(profile?.main_goal ?? goalOptions[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      router.refresh();
      return;
    }

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName,
        work_type: workType,
        business_mode: businessMode,
        main_category: mainCategory,
        main_goal: mainGoal,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    router.replace("/app/dashboard");
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card>
        <CardContent className="grid gap-5 p-5 sm:p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome</Label>
            <Input
              id="fullName"
              autoComplete="name"
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Como podemos te chamar?"
              required
              value={fullName}
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de trabalho</Label>
            <OptionGroup
              name="workType"
              onChange={setWorkType}
              options={workTypeOptions.map((option) => ({ label: option, value: option }))}
              value={workType}
            />
          </div>

          <div className="space-y-2">
            <Label>Atua com</Label>
            <OptionGroup
              name="businessMode"
              onChange={setBusinessMode}
              options={businessModeOptions}
              value={businessMode}
            />
          </div>

          <div className="space-y-2">
            <Label>Categoria principal</Label>
            <OptionGroup
              name="mainCategory"
              onChange={setMainCategory}
              options={categoryOptions.map((option) => ({ label: option, value: option }))}
              value={mainCategory}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Objetivo principal no app</Label>
            <OptionGroup
              name="mainGoal"
              onChange={setMainGoal}
              options={goalOptions.map((option) => ({ label: option, value: option }))}
              value={mainGoal}
            />
          </div>
        </CardContent>
      </Card>

      {message ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Essas respostas ajustam o painel inicial. Voce podera revisar depois.
        </p>
        <Button className="w-full gap-2 sm:w-auto" disabled={isSubmitting} size="lg" type="submit">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Finalizar onboarding
        </Button>
      </div>
    </form>
  );
}

type Option = {
  label: string;
  value: string;
};

function OptionGroup({
  name,
  onChange,
  options,
  value,
}: {
  name: string;
  onChange: (value: string) => void;
  options: Option[];
  value: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-pressed={selected}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              selected
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
            }`}
            key={option.value}
            name={name}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
