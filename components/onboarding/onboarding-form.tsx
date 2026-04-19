"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthErrorMessage, getProfileErrorMessage } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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

type OnboardingStepId = "businessMode" | "workType" | "mainCategory" | "mainGoal";

const onboardingSteps: Array<{
  id: OnboardingStepId;
  label: string;
}> = [
  { id: "businessMode", label: "Atua com" },
  { id: "workType", label: "Tipo de trabalho" },
  { id: "mainCategory", label: "Categoria principal" },
  { id: "mainGoal", label: "Objetivo principal no app" },
];

export function OnboardingForm({ profile }: OnboardingFormProps) {
  const router = useRouter();
  const [fullName] = useState(profile?.full_name ?? "");
  const [workType, setWorkType] = useState(profile?.work_type ?? workTypeOptions[0]);
  const [businessMode, setBusinessMode] = useState(profile?.business_mode ?? "servico");
  const [mainCategory, setMainCategory] = useState(profile?.main_category ?? categoryOptions[0]);
  const [mainGoal, setMainGoal] = useState(profile?.main_goal ?? "");
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeStep = onboardingSteps[activeStepIndex];
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === onboardingSteps.length - 1;
  const progressValue = ((activeStepIndex + 1) / onboardingSteps.length) * 100;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!isLastStep) {
      handleNext();
      return;
    }

    if (!mainGoal) {
      setMessage("Escolha o objetivo principal para finalizar.");
      return;
    }

    setIsSubmitting(true);

    try {
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
          full_name: fullName.trim(),
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
        setMessage(getProfileErrorMessage());
        setIsSubmitting(false);
        return;
      }

      router.replace("/app/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(getAuthErrorMessage(error, "Não foi possível finalizar o onboarding agora."));
      setIsSubmitting(false);
    }
  }

  function getStepOptions(stepId: OnboardingStepId) {
    if (stepId === "businessMode") {
      return businessModeOptions;
    }

    if (stepId === "workType") {
      return workTypeOptions.map((option) => ({ label: option, value: option }));
    }

    if (stepId === "mainCategory") {
      return categoryOptions.map((option) => ({ label: option, value: option }));
    }

    return goalOptions.map((option) => ({ label: option, value: option }));
  }

  function getStepValue(stepId: OnboardingStepId) {
    if (stepId === "businessMode") {
      return businessMode;
    }

    if (stepId === "workType") {
      return workType;
    }

    if (stepId === "mainCategory") {
      return mainCategory;
    }

    return mainGoal;
  }

  function setStepValue(stepId: OnboardingStepId, value: string) {
    if (stepId === "businessMode") {
      setBusinessMode(value);
      return;
    }

    if (stepId === "workType") {
      setWorkType(value);
      return;
    }

    if (stepId === "mainCategory") {
      setMainCategory(value);
      return;
    }

    setMainGoal(value);
  }

  function goToStep(index: number) {
    setMessage(null);
    setActiveStepIndex(index);
  }

  function handleNext() {
    goToStep(Math.min(activeStepIndex + 1, onboardingSteps.length - 1));
  }

  function handleBack() {
    goToStep(Math.max(activeStepIndex - 1, 0));
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Card className="overflow-hidden border-neutral-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <CardContent className="p-0">
          <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden border-r border-neutral-200 bg-neutral-50/80 p-5 md:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Progresso
              </p>
              <div className="mt-5 space-y-3">
                {onboardingSteps.map((step, index) => {
                  const isDone = index < activeStepIndex;
                  const isActive = index === activeStepIndex;

                  return (
                    <button
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                        isActive
                          ? "border-emerald-200 bg-white text-emerald-800 shadow-sm"
                          : "border-transparent text-neutral-600 hover:border-neutral-200 hover:bg-white",
                      )}
                      key={step.id}
                      onClick={() => goToStep(index)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                          isDone
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : isActive
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-neutral-200 bg-white text-neutral-500",
                        )}
                      >
                        {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{step.label}</span>
                        {getStepValue(step.id) ? (
                          <span className="mt-0.5 block truncate text-xs text-neutral-500">
                            {getStepValue(step.id)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="flex min-h-[520px] flex-col">
              <div className="space-y-5 border-b border-neutral-200 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-emerald-700">
                    Etapa {activeStepIndex + 1} de {onboardingSteps.length}
                  </p>
                  <p className="text-sm font-medium text-neutral-500">{activeStep.label}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-md bg-neutral-100">
                  <div
                    className="h-full rounded-md bg-emerald-600 transition-all duration-300"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between gap-6 p-4 sm:p-6">
                <div className="space-y-5">
                  <h2 className="text-2xl font-semibold leading-tight text-neutral-950 sm:text-3xl">
                    {activeStep.label}
                  </h2>

                  <OptionGroup
                    name={activeStep.id}
                    onChange={(value) => setStepValue(activeStep.id, value)}
                    options={getStepOptions(activeStep.id)}
                    value={getStepValue(activeStep.id)}
                  />
                </div>

                <div className="space-y-4">
                  {message ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {message}
                    </p>
                  ) : null}

                  <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-6 text-neutral-600">
                    Essas respostas ajustam o painel inicial. Você poderá revisar depois.
                  </div>

                  <div className="grid grid-cols-[minmax(0,0.55fr)_minmax(0,1fr)] gap-3 sm:flex sm:justify-between">
                    <Button
                      className="min-h-11"
                      disabled={isFirstStep || isSubmitting}
                      onClick={handleBack}
                      type="button"
                      variant="outline"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Voltar
                    </Button>

                    {isLastStep ? (
                      <Button className="min-h-11 sm:min-w-48" disabled={isSubmitting || !mainGoal} type="submit">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Finalizar onboarding
                      </Button>
                    ) : (
                      <Button className="min-h-11 sm:min-w-40" disabled={isSubmitting} onClick={handleNext} type="button">
                        Continuar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
    <div className="grid gap-2.5 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "flex min-h-14 w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm font-semibold transition-colors sm:min-h-16",
              selected
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
            )}
            key={option.value}
            name={name}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <span>{option.label}</span>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-300",
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
