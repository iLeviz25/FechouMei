"use client";

import { type FormEvent, type ReactNode, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { deleteAccount } from "@/app/app/configuracoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

type ConfiguracoesFormProps = {
  profile: Pick<
    Profile,
    "full_name" | "work_type" | "business_mode" | "main_category" | "main_goal" | "initial_balance"
  > | null;
};

type ProfileValues = {
  fullName: string;
  workType: string;
  customWorkType: string;
  businessMode: string;
  mainCategory: string;
  customMainCategory: string;
  initialBalance: string;
  mainGoal: string;
};

const workTypeOptions = [
  "Prestador de servico",
  "Comercio",
  "Autonomo formalizado",
  "Criador ou profissional digital",
  "Outro",
];

const businessModeOptions = [
  { value: "servico", label: "Servico" },
  { value: "produto", label: "Produto" },
  { value: "ambos", label: "Ambos" },
];

const categoryOptions = [
  "Beleza e estetica",
  "Alimentacao",
  "Consultoria",
  "Educacao",
  "Manutencao e reparos",
  "Comercio varejista",
  "Marketing e conteudo",
  "Tecnologia",
  "Outro",
];

const goalOptions = [
  "organizar receitas e despesas",
  "fechar o mes sem planilha",
  "acompanhar limite do MEI",
];

export function ConfiguracoesForm({ profile }: ConfiguracoesFormProps) {
  const router = useRouter();
  const initialValues = useMemo(() => getInitialProfileValues(profile), [profile]);
  const [values, setValues] = useState(initialValues);
  const [draft, setDraft] = useState(initialValues);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSavingProfile, startProfileTransition] = useTransition();
  const [isUpdatingPassword, startPasswordTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const profileSnapshotItems = [
    { label: "Nome", value: values.fullName || "Nao informado" },
    { label: "Atua com", value: getBusinessModeLabel(values.businessMode) },
    { label: "Tipo", value: resolveOtherValue(values.workType, values.customWorkType) || "Nao informado" },
    {
      label: "Categoria",
      value: resolveOtherValue(values.mainCategory, values.customMainCategory) || "Nao informado",
    },
    { label: "Objetivo", value: values.mainGoal || "Nao informado" },
    { label: "Saldo inicial", value: formatInitialBalanceLabel(values.initialBalance) },
  ];

  function openProfileEditor() {
    setProfileMessage(null);
    setDraft(values);
    setIsEditingProfile(true);
  }

  function cancelProfileEditor() {
    setDraft(values);
    setIsEditingProfile(false);
    setProfileMessage(null);
  }

  function saveProfile() {
    setProfileMessage(null);
    const validationMessage = validateProfileDraft(draft);

    if (validationMessage) {
      setProfileMessage(validationMessage);
      return;
    }

    startProfileTransition(async () => {
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
          full_name: draft.fullName.trim(),
          work_type: resolveOtherValue(draft.workType, draft.customWorkType),
          business_mode: draft.businessMode,
          main_category: resolveOtherValue(draft.mainCategory, draft.customMainCategory),
          main_goal: draft.mainGoal,
          initial_balance: parseOptionalAmount(draft.initialBalance) ?? 0,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        setProfileMessage("Nao foi possivel salvar essas alteracoes agora.");
        return;
      }

      setValues(draft);
      setIsEditingProfile(false);
      setProfileMessage("Perfil atualizado.");
      router.refresh();
    });
  }

  function updateDraft(patch: Partial<ProfileValues>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (password.length < 6) {
      setPasswordMessage("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordMessage("As senhas nao conferem.");
      return;
    }

    startPasswordTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setPasswordMessage("Nao foi possivel atualizar a senha agora.");
        return;
      }

      setPasswordMessage("Senha atualizada com sucesso.");
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
    });
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function handleDeleteAccount() {
    setDeleteMessage(null);

    if (deleteConfirmation.trim().toUpperCase() !== "EXCLUIR") {
      setDeleteMessage("Digite EXCLUIR para confirmar a exclusao definitiva da conta.");
      return;
    }

    startDeleteTransition(async () => {
      const result = await deleteAccount({ confirmation: deleteConfirmation });

      if (!result.ok) {
        setDeleteMessage(result.message);
        return;
      }

      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login?accountDeleted=1");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 pb-6">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-hero p-5 text-primary-foreground shadow-elevated sm:p-6">
        <div className="absolute inset-0 grain opacity-40" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-secondary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-[hsl(var(--primary-glow)/0.28)] blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-white/10 text-lg font-extrabold backdrop-blur">
              {values.fullName
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((item) => item[0]?.toUpperCase())
                .join("") || "ME"}
            </div>
            <div className="min-w-0 space-y-2">
              <Badge className="w-fit border-white/10 bg-white/10 text-primary-foreground" variant="secondary">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Conta e preferencias
              </Badge>
              <div>
                <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {values.fullName || "Sua conta"}
                </h1>
                <p className="mt-1 text-sm leading-6 text-primary-foreground/80">
                  Ajuste seus dados, sua senha e as acoes da conta sem mexer na estrutura do app.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary-foreground/70">
              Saldo inicial
            </p>
            <p className="font-mono mt-1 text-lg font-extrabold tabular">
              {formatInitialBalanceLabel(values.initialBalance)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
        <Card>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Resumo do perfil</p>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Seus dados principais</h2>
              </div>
              <Button onClick={isEditingProfile ? cancelProfileEditor : openProfileEditor} size="sm" type="button" variant="outline">
                {isEditingProfile ? null : <Pencil className="h-4 w-4" />}
                {isEditingProfile ? "Cancelar" : "Editar"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {profileSnapshotItems.map((item) => (
                <ProfileSnapshotItem key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Conta</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Acoes rapidas</h2>
            </div>

            <ActionCard
              description="Volta voce para a tela de login e mantem seus dados salvos."
              icon={<LogOut className="h-4 w-4" />}
              label="Sair da conta"
              onClick={handleSignOut}
            />
            <ActionCard
              description="Area sensivel para excluir definitivamente o acesso e os dados."
              icon={<Trash2 className="h-4 w-4" />}
              label="Excluir conta"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteMessage(null);
                setDeleteConfirmation("");
              }}
              tone="danger"
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Editar perfil</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Preferencias da sua conta</h2>
          </div>

          {isEditingProfile ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  icon={<UserRound className="h-4 w-4" />}
                  label="Nome completo"
                  onChange={(value) => updateDraft({ fullName: value })}
                  placeholder="Seu nome completo"
                  value={draft.fullName}
                />

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Atua com
                  </Label>
                  <OptionGroup
                    onChange={(value) => updateDraft({ businessMode: value })}
                    options={businessModeOptions}
                    value={draft.businessMode}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Tipo de trabalho
                  </Label>
                  <OptionGroup
                    onChange={(value) =>
                      updateDraft({
                        customWorkType: value === "Outro" ? draft.customWorkType : "",
                        workType: value,
                      })
                    }
                    options={workTypeOptions.map((option) => ({ label: option, value: option }))}
                    value={draft.workType}
                  />
                  {draft.workType === "Outro" ? (
                    <Field
                      label="Escreva seu tipo de trabalho"
                      onChange={(value) => updateDraft({ customWorkType: value })}
                      placeholder="Ex.: fotografia, eventos, costura"
                      value={draft.customWorkType}
                    />
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Categoria principal
                  </Label>
                  <OptionGroup
                    onChange={(value) =>
                      updateDraft({
                        customMainCategory: value === "Outro" ? draft.customMainCategory : "",
                        mainCategory: value,
                      })
                    }
                    options={categoryOptions.map((option) => ({ label: option, value: option }))}
                    value={draft.mainCategory}
                  />
                  {draft.mainCategory === "Outro" ? (
                    <Field
                      label="Escreva sua categoria principal"
                      onChange={(value) => updateDraft({ customMainCategory: value })}
                      placeholder="Ex.: pet shop, artesanato, arquitetura"
                      value={draft.customMainCategory}
                    />
                  ) : null}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Objetivo principal
                  </Label>
                  <OptionGroup
                    onChange={(value) => updateDraft({ mainGoal: value })}
                    options={goalOptions.map((option) => ({ label: option, value: option }))}
                    value={draft.mainGoal}
                  />
                </div>

                <Field
                  icon={<Wallet className="h-4 w-4" />}
                  label="Saldo inicial"
                  onBlur={() =>
                    updateDraft({
                      initialBalance: formatOptionalAmount(parseOptionalAmount(draft.initialBalance)),
                    })
                  }
                  onChange={(value) => updateDraft({ initialBalance: normalizeAmountInput(value) })}
                  placeholder="Ex.: 2000,00"
                  value={draft.initialBalance}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button onClick={cancelProfileEditor} type="button" variant="outline">
                  Cancelar
                </Button>
                <Button disabled={isSavingProfile} onClick={saveProfile} type="button">
                  {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar alteracoes
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-border/70 bg-muted/30 p-5 text-sm leading-6 text-muted-foreground">
              Toque em editar para atualizar seu perfil, categoria, objetivo e saldo inicial.
            </div>
          )}

          {profileMessage ? (
            <p
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm leading-6",
                profileMessage === "Perfil atualizado."
                  ? "border-success/20 bg-success/10 text-success"
                  : "border-destructive/20 bg-destructive/10 text-destructive",
              )}
            >
              {profileMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Seguranca</p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-foreground">Senha de acesso</h2>
          </div>

          <form className="space-y-4" onSubmit={handleUpdatePassword}>
            <div className="grid gap-4 md:grid-cols-2">
              <PasswordField
                label="Nova senha"
                onChange={setPassword}
                showPassword={showPassword}
                togglePassword={() => setShowPassword((current) => !current)}
                value={password}
              />
              <PasswordField
                label="Confirmar nova senha"
                onChange={setConfirmPassword}
                showPassword={showPassword}
                togglePassword={() => setShowPassword((current) => !current)}
                value={confirmPassword}
              />
            </div>

            {passwordMessage ? (
              <p
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm leading-6",
                  passwordMessage === "Senha atualizada com sucesso."
                    ? "border-success/20 bg-success/10 text-success"
                    : "border-destructive/20 bg-destructive/10 text-destructive",
                )}
              >
                {passwordMessage}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button disabled={isUpdatingPassword} type="submit">
                {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Salvar nova senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {deleteOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-neutral-950/45 p-3 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4"
          role="dialog"
        >
          <div className="w-full rounded-[28px] border border-destructive/20 bg-card p-5 shadow-elevated sm:max-w-md">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-destructive/10 p-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-foreground">Excluir conta definitivamente</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Essa acao remove seu login, perfil, movimentacoes, checklist e preferencias salvas.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="deleteConfirmation">Digite EXCLUIR para confirmar</Label>
              <Input
                autoComplete="off"
                className="border-destructive/20 focus-visible:ring-destructive/10"
                id="deleteConfirmation"
                onChange={(event) => {
                  setDeleteMessage(null);
                  setDeleteConfirmation(event.target.value);
                }}
                placeholder="EXCLUIR"
                value={deleteConfirmation}
              />
            </div>

            {deleteMessage ? (
              <p className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                {deleteMessage}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirmation("");
                  setDeleteMessage(null);
                }}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}
                onClick={handleDeleteAccount}
                type="button"
                variant="destructive"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Option = {
  label: string;
  value: string;
};

function getInitialProfileValues(profile: ConfiguracoesFormProps["profile"]): ProfileValues {
  return {
    businessMode: profile?.business_mode ?? "servico",
    customMainCategory: getCustomValue(profile?.main_category, categoryOptions),
    customWorkType: getCustomValue(profile?.work_type, workTypeOptions),
    fullName: profile?.full_name ?? "",
    initialBalance: formatOptionalAmount(profile?.initial_balance),
    mainCategory: getKnownOrOther(profile?.main_category, categoryOptions, categoryOptions[0]),
    mainGoal: profile?.main_goal ?? goalOptions[0],
    workType: getKnownOrOther(profile?.work_type, workTypeOptions, workTypeOptions[0]),
  };
}

function validateProfileDraft(values: ProfileValues) {
  if (!values.fullName.trim()) {
    return "Informe seu nome para salvar.";
  }

  if (values.workType === "Outro" && !values.customWorkType.trim()) {
    return "Escreva qual e o seu tipo de trabalho.";
  }

  if (values.mainCategory === "Outro" && !values.customMainCategory.trim()) {
    return "Escreva qual e a sua categoria principal.";
  }

  if (parseOptionalAmount(values.initialBalance) === null) {
    return "Use um valor de saldo valido, como 2000 ou 1200,50.";
  }

  return null;
}

function ActionCard({
  description,
  icon,
  label,
  onClick,
  tone = "default",
}: {
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={cn(
        "flex w-full items-start gap-3 rounded-[24px] border p-4 text-left transition-all",
        tone === "danger"
          ? "border-destructive/20 bg-destructive/5 hover:border-destructive/30"
          : "border-border/70 bg-muted/30 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary-soft/20",
      )}
      onClick={onClick}
      type="button"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
          tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

function ProfileSnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[24px] border border-border/70 bg-muted/30 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-bold leading-6 text-foreground">{value}</p>
    </div>
  );
}

function Field({
  icon,
  label,
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  icon?: ReactNode;
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <div className="relative">
        {icon ? <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span> : null}
        <Input
          className={cn(icon ? "pl-10" : "")}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    </label>
  );
}

function PasswordField({
  label,
  onChange,
  showPassword,
  togglePassword,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  togglePassword: () => void;
  value: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <div className="relative">
        <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10 pr-11"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Minimo de 6 caracteres"
          type={showPassword ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={togglePassword}
          type="button"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function OptionGroup({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: Option[];
  value: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            aria-pressed={selected}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold transition-all",
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-glow"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {selected ? <Check className="h-3.5 w-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function getBusinessModeLabel(value: string) {
  return businessModeOptions.find((option) => option.value === value)?.label ?? value;
}

function getKnownOrOther(value: string | null | undefined, options: string[], fallback: string) {
  if (!value) {
    return fallback;
  }

  return options.includes(value) ? value : "Outro";
}

function getCustomValue(value: string | null | undefined, options: string[]) {
  return value && !options.includes(value) ? value : "";
}

function resolveOtherValue(value: string, customValue: string) {
  return value === "Outro" ? customValue.trim() : value;
}

function normalizeAmountInput(value: string) {
  const cleaned = value.replace(/[^\d,.]/g, "");
  const hasComma = cleaned.includes(",");
  const separator = hasComma ? "," : ".";
  const parts = cleaned.split(hasComma ? "," : ".");

  if (parts.length === 1) {
    return parts[0];
  }

  const integerPart = parts[0];
  const decimalPart = parts.slice(1).join("").slice(0, 2);
  return `${integerPart}${separator}${decimalPart}`;
}

function parseOptionalAmount(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return 0;
  }

  if (!/^\d+([,.]\d{1,2})?$/.test(trimmed)) {
    return null;
  }

  const amount = Number(trimmed.replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

function formatOptionalAmount(value: string | number | null | undefined) {
  const amount = parseOptionalAmount(value);

  if (!amount) {
    return "";
  }

  return amount.toFixed(2).replace(".", ",");
}

function formatInitialBalanceLabel(value: string) {
  const amount = parseOptionalAmount(value) ?? 0;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  }).format(amount);
}
