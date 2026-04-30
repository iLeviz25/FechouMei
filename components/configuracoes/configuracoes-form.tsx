"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { deleteAccount } from "@/app/app/configuracoes/actions";
import { useOnboardingTour } from "@/components/onboarding/onboarding-tour";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  getSubscriptionAccessFromProfile,
  type SubscriptionAccess,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/subscription/access";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

type ConfiguracoesFormProps = {
  profile: Pick<
    Profile,
    | "business_mode"
    | "full_name"
    | "initial_balance"
    | "main_category"
    | "main_goal"
    | "role"
    | "subscription_plan"
    | "subscription_status"
    | "work_type"
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
  const { openTour } = useOnboardingTour();
  const initialValues = useMemo(() => getInitialProfileValues(profile), [profile]);
  const [values, setValues] = useState(initialValues);
  const [draft, setDraft] = useState(initialValues);
  const [contactEmail, setContactEmail] = useState("");
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

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active || error) {
        return;
      }

      setContactEmail(data.user?.email ?? "");
    });

    return () => {
      active = false;
    };
  }, []);

  const resolvedWorkType = resolveOtherValue(values.workType, values.customWorkType) || "Nao informado";
  const resolvedCategory = resolveOtherValue(values.mainCategory, values.customMainCategory) || "Nao informado";
  const resolvedGoal = values.mainGoal || "Nao informado";
  const businessModeLabel = getBusinessModeLabel(values.businessMode);
  const profileTag = `${businessModeLabel} - ${resolvedCategory}`;
  const subscriptionAccess = getSubscriptionAccessFromProfile(profile);

  const profileSnapshotItems = [
    {
      icon: <BriefcaseBusiness className="h-4 w-4" />,
      label: "Atuacao",
      value: resolvedCategory,
    },
    {
      icon: <Building2 className="h-4 w-4" />,
      label: "Tipo de trabalho",
      value: resolvedWorkType,
    },
    {
      icon: <Target className="h-4 w-4" />,
      label: "Objetivo no app",
      value: resolvedGoal,
    },
    {
      icon: <Wallet className="h-4 w-4" />,
      label: "Saldo inicial",
      value: formatInitialBalanceLabel(values.initialBalance),
    },
  ];

  function openProfileEditor() {
    setProfileMessage(null);
    setDraft(values);
    setIsEditingProfile(true);
  }

  function cancelProfileEditor() {
    if (isSavingProfile) {
      return;
    }

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

  function openDeleteDialog() {
    setDeleteOpen(true);
    setDeleteMessage(null);
    setDeleteConfirmation("");
  }

  function closeDeleteDialog() {
    if (isDeleting) {
      return;
    }

    setDeleteOpen(false);
    setDeleteConfirmation("");
    setDeleteMessage(null);
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
    <div className="mobile-section-gap">
      <header className="space-y-3">
        <Badge className="w-fit" variant="success">
          <ShieldCheck className="mr-1 h-3 w-3" />
          Conta
        </Badge>
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Configuracoes</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Gerencie seu perfil, preferencias e acoes da conta. Tudo num lugar so.
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <div className="overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,hsl(155_62%_35%)_0%,hsl(160_70%_28%)_100%)] px-5 py-5 text-white shadow-elevated sm:px-6 sm:py-6">
          <div className="flex items-start gap-4">
            <div className="icon-tile flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-white/14 text-xl font-extrabold text-white">
              {values.fullName
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((item) => item[0]?.toUpperCase())
                .join("") || "ME"}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <h2 className="truncate text-[1.75rem] font-extrabold tracking-tight text-white">
                  {values.fullName || "Sua conta"}
                </h2>
                <p className="inline-flex items-center gap-2 text-sm font-medium text-white/82">
                  <Mail className="h-4 w-4" />
                  {contactEmail || "Conta conectada ao FechouMEI"}
                </p>
              </div>
              <Badge className="border-white/10 bg-white/14 text-white shadow-none" variant="outline">
                {profileTag}
              </Badge>
            </div>
          </div>
        </div>

        <SubscriptionSummaryCard access={subscriptionAccess} />

        <div className="grid gap-3 md:grid-cols-2">
          {profileSnapshotItems.map((item) => (
            <SettingsSummaryCard icon={item.icon} key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Badge className="w-fit" variant="secondary">
          <UserRound className="mr-1 h-3 w-3" />
          Perfil
        </Badge>
        <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">Editar informacoes</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Atualize seus dados de cadastro a qualquer momento.
            </p>
          </div>
          <Button onClick={openProfileEditor} size="sm" type="button" variant="outline">
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        </div>

        <Card className="overflow-hidden rounded-[30px]">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <InfoRow icon={<UserRound className="h-4 w-4" />} label="Nome completo" value={values.fullName || "Nao informado"} />
            <InfoRow icon={<BriefcaseBusiness className="h-4 w-4" />} label="Atuacao" value={resolvedCategory} />
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Tipo de trabalho" value={resolvedWorkType} />
            <InfoRow icon={<Sparkles className="h-4 w-4" />} label="Categoria principal" value={resolvedCategory} />
            <InfoRow icon={<Target className="h-4 w-4" />} label="Objetivo no app" value={resolvedGoal} />
            <InfoRow icon={<Wallet className="h-4 w-4" />} label="Saldo inicial" value={formatInitialBalanceLabel(values.initialBalance)} />

            {profileMessage === "Perfil atualizado." ? (
              <p className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm leading-6 text-success">
                {profileMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <Badge className="w-fit" variant="secondary">
          <Sparkles className="mr-1 h-3 w-3" />
          Guia
        </Badge>
        <ActionCard
          description="Reabra o tour rápido pelas áreas principais do FechouMEI."
          icon={<Sparkles className="h-4 w-4" />}
          label="Ver guia do app"
          onClick={openTour}
        />
      </section>

      <section className="space-y-3">
        <Badge className="w-fit" variant="secondary">
          <ShieldCheck className="mr-1 h-3 w-3" />
          Seguranca
        </Badge>
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">Acesso a conta</h2>
          <p className="text-sm leading-6 text-muted-foreground">Mantenha sua senha forte e atualizada.</p>
        </div>

        <Card className="overflow-hidden rounded-[30px]">
          <CardContent className="p-0">
            <div className="flex items-start gap-3 px-5 py-5 sm:px-6">
              <div className="icon-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <KeyRound className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold tracking-tight text-foreground">Alterar senha</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Recomendamos trocar a cada 90 dias.
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>

            <div className="border-t border-border/60 px-5 py-5 sm:px-6">
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
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <Badge className="w-fit" variant="secondary">
          <ShieldCheck className="mr-1 h-3 w-3" />
          Conta
        </Badge>
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">Acoes da conta</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Sair do app ou encerrar sua conta no FechouMEI.
          </p>
        </div>

        <ActionCard
          description="Voce precisara fazer login novamente."
          icon={<LogOut className="h-4 w-4" />}
          label="Sair da conta"
          onClick={handleSignOut}
        />

        <Card className="overflow-hidden rounded-[30px] border-destructive/20 bg-destructive/5">
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold tracking-tight text-destructive">
                  Excluir conta permanentemente
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Todos os seus dados, movimentacoes, fechamentos e historico serao removidos. Esta acao nao pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="flex justify-start">
              <Button onClick={openDeleteDialog} type="button" variant="destructive">
                <Trash2 className="h-4 w-4" />
                Excluir conta
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="pt-1 text-center text-xs leading-6 text-muted-foreground">
          FechouMEI. v1.0. Feito com cuidado para o MEI brasileiro.
        </p>
      </section>

      {isEditingProfile ? (
        <ResponsiveOverlay
          closeDisabled={isSavingProfile}
          description="Atualize seus dados sem poluir a tela principal. Se fechar sem salvar, nada sera alterado."
          icon={<Pencil className="h-4 w-4" />}
          maxWidthClass="sm:max-w-3xl"
          onClose={cancelProfileEditor}
          title="Editar perfil"
        >
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

            {profileMessage && profileMessage !== "Perfil atualizado." ? (
              <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                {profileMessage}
              </p>
            ) : null}

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
        </ResponsiveOverlay>
      ) : null}

      {deleteOpen ? (
        <ResponsiveOverlay
          closeDisabled={isDeleting}
          description="Essa acao remove seu login, perfil, movimentacoes, checklist e preferencias salvas."
          icon={<AlertTriangle className="h-4 w-4" />}
          maxWidthClass="sm:max-w-md"
          onClose={closeDeleteDialog}
          title="Excluir conta definitivamente"
          tone="danger"
        >
          <div className="space-y-4">
            <div className="space-y-2">
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
              <p className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                {deleteMessage}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={closeDeleteDialog} type="button" variant="outline">
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
        </ResponsiveOverlay>
      ) : null}
    </div>
  );
}

function SubscriptionSummaryCard({ access }: { access: SubscriptionAccess }) {
  const planLabel = access.isAdmin ? "Admin" : getSubscriptionPlanLabel(access.plan);
  const statusLabel = access.isAdmin ? "Admin" : getSubscriptionStatusLabel(access.status);
  const description = access.isAdmin ? "Acesso administrativo completo." : getSubscriptionPlanDescription(access.plan);
  const limitLabel = access.isAdmin ? "Sem limite bloqueante" : `${access.dailyHelenaLimit ?? 0} mensagens/dia`;

  return (
    <Card className="overflow-hidden rounded-[28px] border-primary/15 bg-primary-soft/30">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Plano da conta</p>
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">{planLabel}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2 min-[430px]:justify-end">
            <Badge variant={access.isAdmin || access.plan === "pro" ? "success" : "secondary"}>{planLabel}</Badge>
            <Badge variant={access.status === "active" || access.isAdmin ? "success" : access.status === "pending_payment" ? "secondary" : "danger"}>
              {statusLabel}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SubscriptionSummaryItem label="Plano atual" value={planLabel} />
          <SubscriptionSummaryItem label="Status da assinatura" value={statusLabel} />
          <SubscriptionSummaryItem label="Limite da Helena" value={limitLabel} />
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/85 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-extrabold leading-6 text-foreground">{value}</p>
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

function SettingsSummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="overflow-hidden rounded-[26px]">
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="text-sm font-bold leading-6 text-foreground sm:text-[0.95rem]">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold tracking-tight text-foreground">{label}</p>
      <div className="flex min-h-14 items-center gap-3 rounded-[22px] border border-border/70 bg-muted/30 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm">
          {icon}
        </div>
        <p className="min-w-0 break-words text-sm font-medium leading-6 text-foreground">{value}</p>
      </div>
    </div>
  );
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
        "flex w-full items-start gap-3 rounded-[28px] border p-4 text-left transition-[background-color,border-color,box-shadow,transform] sm:p-5",
        tone === "danger"
          ? "border-destructive/20 bg-destructive/5 hover:border-destructive/30"
          : "surface-panel hover:-translate-y-0.5 hover:border-primary/20 hover:bg-primary-soft/20",
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
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold tracking-tight text-foreground">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ResponsiveOverlay({
  children,
  closeDisabled = false,
  description,
  icon,
  maxWidthClass = "sm:max-w-2xl",
  onClose,
  title,
  tone = "default",
}: {
  children: ReactNode;
  closeDisabled?: boolean;
  description: string;
  icon: ReactNode;
  maxWidthClass?: string;
  onClose: () => void;
  title: string;
  tone?: "default" | "danger";
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabled) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div
      aria-modal="true"
            className="fixed inset-0 z-50 flex items-end bg-neutral-950/45 p-3 sm:items-center sm:justify-center sm:p-4"
      onClick={() => {
        if (!closeDisabled) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div
        className={cn(
          "w-full overflow-hidden rounded-[28px] border bg-card shadow-elevated",
          tone === "danger" ? "border-destructive/20" : "border-border/70",
          maxWidthClass,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
          <div
            className={cn(
              "rounded-2xl p-2",
              tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary",
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <button
            aria-label="Fechar"
            className="mt-0.5 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-8.5rem)] overflow-y-auto px-5 py-5 sm:max-h-[min(85vh,48rem)] sm:px-6">
          {children}
        </div>
      </div>
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
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold transition-[background-color,border-color,color,box-shadow]",
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-elevated"
                : "surface-panel-ghost text-muted-foreground hover:border-primary/30 hover:text-foreground",
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

function getSubscriptionPlanLabel(plan: SubscriptionPlan) {
  return plan === "pro" ? "Pro" : "Essencial";
}

function getSubscriptionPlanDescription(plan: SubscriptionPlan) {
  return plan === "pro"
    ? "Inclui recursos avancados da Helena, importacao e exportacao."
    : "Ideal para organizar seu MEI no dia a dia.";
}

function getSubscriptionStatusLabel(status: SubscriptionStatus) {
  const labels: Record<SubscriptionStatus, string> = {
    active: "Ativo",
    canceled: "Cancelado",
    past_due: "Pagamento pendente",
    pending_payment: "Aguardando pagamento",
  };

  return labels[status];
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
