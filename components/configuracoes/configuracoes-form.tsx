"use client";

import { type FormEvent, type ReactNode, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { deleteAccount } from "@/app/app/configuracoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type EditableField =
  | "fullName"
  | "businessMode"
  | "workType"
  | "mainCategory"
  | "mainGoal"
  | "initialBalance";

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

export function ConfiguracoesForm({ profile }: ConfiguracoesFormProps) {
  const router = useRouter();
  const initialValues = useMemo(() => getInitialProfileValues(profile), [profile]);
  const [values, setValues] = useState(initialValues);
  const [draft, setDraft] = useState(initialValues);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [isSavingProfile, startProfileTransition] = useTransition();
  const [isUpdatingPassword, startPasswordTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  function beginEdit(field: EditableField) {
    setProfileMessage(null);
    setDraft(values);
    setEditingField(field);
  }

  function cancelEdit() {
    setDraft(values);
    setEditingField(null);
    setProfileMessage(null);
  }

  function saveProfileField(field: EditableField) {
    setProfileMessage(null);

    const validationMessage = validateProfileDraft(draft, field);

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
        setProfileMessage("Não foi possível salvar essa alteração agora.");
        return;
      }

      setValues(draft);
      setEditingField(null);
      setProfileMessage("Preferência atualizada.");
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
      setPasswordMessage("As senhas não conferem.");
      return;
    }

    startPasswordTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setPasswordMessage("Não foi possível atualizar a senha agora.");
        return;
      }

      setPasswordMessage("Senha atualizada com sucesso.");
      setPassword("");
      setConfirmPassword("");
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
      setDeleteMessage("Digite EXCLUIR para confirmar a exclusão definitiva da conta.");
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

  const profileSnapshotItems = [
    { label: "Nome", value: values.fullName || "Não informado" },
    { label: "Atua com", value: getBusinessModeLabel(values.businessMode) },
    {
      label: "Tipo",
      value: resolveOtherValue(values.workType, values.customWorkType) || "Não informado",
    },
    {
      label: "Categoria",
      value: resolveOtherValue(values.mainCategory, values.customMainCategory) || "Não informado",
    },
    { label: "Objetivo", value: values.mainGoal || "Não informado" },
    { label: "Saldo atual", value: formatInitialBalanceLabel(values.initialBalance) },
  ];

  return (
    <div className="space-y-3 pb-6 sm:space-y-4">
      <section className="rounded-lg border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge variant="success" className="w-fit">
                Configurações
              </Badge>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                  Conta e preferências
                </h1>
                <p className="max-w-2xl text-sm leading-5 text-neutral-600">
                  Veja seus dados principais, ajuste o que precisar e mantenha a conta protegida.
                </p>
              </div>
            </div>
            <div className="flex w-full items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900 sm:w-auto">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="font-medium">Dados protegidos</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionLabel eyebrow="Perfil" title="Seus dados principais" />

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-neutral-100 bg-neutral-50/60 p-3.5 sm:p-4">
            <CardHeading
              description="Essas preferências vieram do onboarding e ajudam o FechouMEI a se adaptar à sua rotina."
              icon={<UserRound className="h-4 w-4" />}
              title="Resumo do seu perfil"
            />
          </CardHeader>
          <CardContent className="space-y-4 p-3.5 sm:p-4">
            <div className="grid grid-cols-2 gap-2.5">
              {profileSnapshotItems.map((item) => (
                <ProfileSnapshotItem key={item.label} label={item.label} value={item.value} />
              ))}
            </div>

            <div className="space-y-1 px-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Editar perfil</p>
              <p className="text-sm leading-5 text-neutral-600">
                Ajuste só o que quiser mudar. Os dados acima mostram como sua conta está configurada hoje.
              </p>
            </div>

            <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              <EditableProfileRow
                description="Como o app identifica sua conta."
                editor={
                  <Input
                    className="h-11 border-neutral-200 bg-white focus-visible:ring-emerald-200"
                    onChange={(event) => updateDraft({ fullName: event.target.value })}
                    placeholder="Seu nome completo"
                    value={draft.fullName}
                  />
                }
                field="fullName"
                isEditing={editingField === "fullName"}
                isSaving={isSavingProfile}
                label="Nome"
                onCancel={cancelEdit}
                onEdit={beginEdit}
                onSave={saveProfileField}
                value={values.fullName || "Não informado"}
              />
              <EditableProfileRow
                description="Se sua rotina é mais ligada a serviço, produto ou ambos."
                editor={
                  <OptionGroup
                    name="businessMode"
                    onChange={(businessMode) => updateDraft({ businessMode })}
                    options={businessModeOptions}
                    value={draft.businessMode}
                  />
                }
                field="businessMode"
                isEditing={editingField === "businessMode"}
                isSaving={isSavingProfile}
                label="Atua com"
                onCancel={cancelEdit}
                onEdit={beginEdit}
                onSave={saveProfileField}
                value={getBusinessModeLabel(values.businessMode)}
              />
              <EditableProfileRow
                description="O tipo de trabalho que mais representa sua atividade."
                editor={
                  <div className="space-y-3">
                    <OptionGroup
                      name="workType"
                      onChange={(workType) =>
                        updateDraft({
                          customWorkType: workType === "Outro" ? draft.customWorkType : "",
                          workType,
                        })
                      }
                      options={workTypeOptions.map((option) => ({ label: option, value: option }))}
                      value={draft.workType}
                    />
                    {draft.workType === "Outro" ? (
                      <OtherInput
                        label="Escreva seu tipo de trabalho"
                        onChange={(customWorkType) => updateDraft({ customWorkType })}
                        placeholder="Ex.: fotografia, eventos, costura"
                        value={draft.customWorkType}
                      />
                    ) : null}
                  </div>
                }
                field="workType"
                isEditing={editingField === "workType"}
                isSaving={isSavingProfile}
                label="Tipo de trabalho"
                onCancel={cancelEdit}
                onEdit={beginEdit}
                onSave={saveProfileField}
                value={resolveOtherValue(values.workType, values.customWorkType)}
              />
              <EditableProfileRow
                description="A área principal usada para organizar sua visão do app."
                editor={
                  <div className="space-y-3">
                    <OptionGroup
                      name="mainCategory"
                      onChange={(mainCategory) =>
                        updateDraft({
                          customMainCategory: mainCategory === "Outro" ? draft.customMainCategory : "",
                          mainCategory,
                        })
                      }
                      options={categoryOptions.map((option) => ({ label: option, value: option }))}
                      value={draft.mainCategory}
                    />
                    {draft.mainCategory === "Outro" ? (
                      <OtherInput
                        label="Escreva sua categoria principal"
                        onChange={(customMainCategory) => updateDraft({ customMainCategory })}
                        placeholder="Ex.: pet shop, artesanato, arquitetura"
                        value={draft.customMainCategory}
                      />
                    ) : null}
                  </div>
                }
                field="mainCategory"
                isEditing={editingField === "mainCategory"}
                isSaving={isSavingProfile}
                label="Categoria principal"
                onCancel={cancelEdit}
                onEdit={beginEdit}
                onSave={saveProfileField}
                value={resolveOtherValue(values.mainCategory, values.customMainCategory)}
              />
              <EditableProfileRow
                description="O primeiro resultado que você quer acompanhar com mais clareza."
                editor={
                  <OptionGroup
                    name="mainGoal"
                    onChange={(mainGoal) => updateDraft({ mainGoal })}
                    options={goalOptions.map((option) => ({ label: option, value: option }))}
                    value={draft.mainGoal}
                  />
                }
                field="mainGoal"
                isEditing={editingField === "mainGoal"}
                isSaving={isSavingProfile}
                label="Objetivo principal"
                onCancel={cancelEdit}
                onEdit={beginEdit}
                onSave={saveProfileField}
                value={values.mainGoal || "Não informado"}
              />
              <EditableProfileRow
                description="Valor usado como ponto de partida do seu caixa, sem entrar como receita."
                editor={
                  <OtherInput
                    inputMode="decimal"
                    label="Saldo atual para começar"
                    onBlur={() =>
                      updateDraft({
                        initialBalance: formatOptionalAmount(parseOptionalAmount(draft.initialBalance)),
                      })
                    }
                    onChange={(initialBalance) =>
                      updateDraft({ initialBalance: normalizeAmountInput(initialBalance) })
                    }
                    placeholder="Ex.: 2000,00"
                    value={draft.initialBalance}
                  />
                }
                field="initialBalance"
                isEditing={editingField === "initialBalance"}
                isSaving={isSavingProfile}
                label="Saldo atual para começar"
                onCancel={cancelEdit}
                onEdit={beginEdit}
                onSave={saveProfileField}
                value={formatInitialBalanceLabel(values.initialBalance)}
              />
            </div>
          </CardContent>
        </Card>

        {profileMessage ? (
          <FeedbackMessage tone={profileMessage === "Preferência atualizada." ? "success" : "danger"}>
            {profileMessage}
          </FeedbackMessage>
        ) : null}
      </section>

      <section className="space-y-2">
        <SectionLabel eyebrow="Segurança" title="Senha e acesso" />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/60 p-3.5 sm:p-4">
              <CardHeading
                description="Crie uma nova senha para entrar no FechouMEI."
                icon={<KeyRound className="h-4 w-4" />}
                title="Senha de acesso"
              />
            </CardHeader>
            <CardContent className="p-3.5 sm:p-4">
              <form className="space-y-4" onSubmit={handleUpdatePassword}>
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <Input
                    autoComplete="new-password"
                    className="h-11 border-neutral-200 bg-white focus-visible:ring-emerald-200"
                    id="password"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    required
                    type="password"
                    value={password}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                  <Input
                    autoComplete="new-password"
                    className="h-11 border-neutral-200 bg-white focus-visible:ring-emerald-200"
                    id="confirmPassword"
                    minLength={6}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    type="password"
                    value={confirmPassword}
                  />
                </div>

                {passwordMessage ? (
                  <FeedbackMessage
                    tone={passwordMessage === "Senha atualizada com sucesso." ? "success" : "danger"}
                  >
                    {passwordMessage}
                  </FeedbackMessage>
                ) : null}

                <div className="flex justify-end border-t border-neutral-100 pt-4">
                  <Button className="w-full sm:w-auto" disabled={isUpdatingPassword} type="submit">
                    {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Salvar nova senha
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="overflow-hidden bg-white">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/60 p-3.5 sm:p-4">
              <CardHeading
                description="Encerre o acesso neste aparelho quando precisar."
                icon={<LogOut className="h-4 w-4" />}
                title="Acesso neste aparelho"
              />
            </CardHeader>
            <CardContent className="space-y-3 p-3.5 sm:p-4">
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium leading-6 text-neutral-700">
                Sair leva você de volta ao login e mantém seus dados salvos na conta.
              </p>
              <Button className="w-full sm:w-auto" onClick={handleSignOut} variant="outline">
                <LogOut className="h-4 w-4" />
                Sair da conta
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-2">
        <SectionLabel eyebrow="Área sensível" title="Ações irreversíveis" />

        <Card className="overflow-hidden border-red-200/80 bg-red-50/30">
          <CardHeader className="border-b border-red-100/80 p-3.5 sm:p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-md border border-red-100 bg-white p-2 text-red-700 shadow-sm">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <CardTitle className="text-base text-red-950">Excluir conta e dados</CardTitle>
                <CardDescription className="text-sm leading-5 text-red-800/80">
                  Esta ação apaga seu usuário de login e os dados salvos no FechouMEI. Não é possível desfazer.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3.5 sm:p-4">
            <p className="text-sm leading-6 text-red-900/80">
              Use isso só se realmente quiser encerrar sua conta de forma definitiva.
            </p>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setDeleteMessage(null);
                setDeleteConfirmation("");
                setDeleteStep(1);
              }}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4" />
              Excluir conta
            </Button>
            {deleteMessage ? <FeedbackMessage tone="danger">{deleteMessage}</FeedbackMessage> : null}
          </CardContent>
        </Card>
      </section>

      {deleteStep === 1 ? (
        <ConfirmDialog
          description="Você vai iniciar a exclusão real da conta, incluindo o acesso de login e os dados vinculados ao seu usuário."
          onCancel={() => setDeleteStep(0)}
          onConfirm={() => {
            setDeleteConfirmation("");
            setDeleteStep(2);
          }}
          title="Antes de excluir"
        />
      ) : null}

      {deleteStep === 2 ? (
        <ConfirmDialog
          confirmDisabled={deleteConfirmation.trim().toUpperCase() !== "EXCLUIR"}
          confirmLabel="Excluir agora"
          confirmationLabel="Digite EXCLUIR para confirmar"
          confirmationPlaceholder="EXCLUIR"
          confirmationValue={deleteConfirmation}
          description="Essa ação é irreversível e remove sua conta de login, perfil, movimentações, checklist e preferências salvas."
          feedbackMessage={deleteMessage}
          isLoading={isDeleting}
          onCancel={() => {
            setDeleteMessage(null);
            setDeleteStep(0);
          }}
          onConfirmationChange={(value) => {
            setDeleteMessage(null);
            setDeleteConfirmation(value);
          }}
          onConfirm={handleDeleteAccount}
          title="Excluir conta definitivamente"
        />
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

function validateProfileDraft(values: ProfileValues, field: EditableField) {
  if (field === "fullName" && !values.fullName.trim()) {
    return "Informe seu nome para salvar.";
  }

  if (field === "workType" && values.workType === "Outro" && !values.customWorkType.trim()) {
    return "Escreva qual é o seu tipo de trabalho.";
  }

  if (field === "mainCategory" && values.mainCategory === "Outro" && !values.customMainCategory.trim()) {
    return "Escreva qual é a sua categoria principal.";
  }

  if (field === "initialBalance" && parseOptionalAmount(values.initialBalance) === null) {
    return "Use um valor de saldo válido, como 2000 ou 1200,50.";
  }

  return null;
}

function SectionLabel({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="space-y-0.5 px-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
      <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
    </div>
  );
}

function CardHeading({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md border border-emerald-100 bg-white p-2 text-emerald-700 shadow-sm">
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <CardTitle className="text-base text-neutral-950">{title}</CardTitle>
        <CardDescription className="text-sm leading-5">{description}</CardDescription>
      </div>
    </div>
  );
}

function EditableProfileRow({
  description,
  editor,
  field,
  isEditing,
  isSaving,
  label,
  onCancel,
  onEdit,
  onSave,
  value,
}: {
  description: string;
  editor: ReactNode;
  field: EditableField;
  isEditing: boolean;
  isSaving: boolean;
  label: string;
  onCancel: () => void;
  onEdit: (field: EditableField) => void;
  onSave: (field: EditableField) => void;
  value: string;
}) {
  return (
    <div className="px-3.5 py-3.5 sm:px-4 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-neutral-950">{label}</p>
          <p className="text-xs leading-5 text-neutral-600">{description}</p>
        </div>
        {!isEditing ? (
          <Button
            aria-label={`Editar ${label}`}
            className="h-8 w-8 shrink-0"
            onClick={() => onEdit(field)}
            size="icon"
            type="button"
            variant="outline"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {!isEditing ? (
        <p className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-semibold leading-5 text-neutral-900">
          {value}
        </p>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/80 p-3">
          {editor}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button disabled={isSaving} onClick={onCancel} type="button" variant="outline">
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button disabled={isSaving} onClick={() => onSave(field)} type="button">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div className="grid gap-1.5 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            aria-pressed={selected}
            className={cn(
              "group flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium leading-5 transition-colors",
              selected
                ? "border-emerald-300 bg-white text-emerald-900 shadow-[0_1px_2px_rgba(16,185,129,0.08)]"
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
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                selected ? "border-emerald-500 bg-emerald-600 text-white" : "border-neutral-300 bg-white",
              )}
            >
              {selected ? <Check className="h-3 w-3" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OtherInput({
  inputMode,
  label,
  onBlur,
  onChange,
  placeholder,
  value,
}: {
  inputMode?: "text" | "decimal";
  label: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-neutral-900">{label}</span>
      <Input
        className="h-11 border-neutral-200 bg-white focus-visible:ring-emerald-200"
        inputMode={inputMode}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function FeedbackMessage({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "danger";
}) {
  return (
    <p
      className={cn(
        "rounded-md border px-3 py-2 text-sm leading-6",
        tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
    >
      {children}
    </p>
  );
}

function ProfileSnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-neutral-950">{value}</p>
    </div>
  );
}

function ConfirmDialog({
  confirmDisabled,
  confirmLabel = "Continuar",
  confirmationLabel,
  confirmationPlaceholder,
  confirmationValue,
  description,
  feedbackMessage,
  isLoading,
  onCancel,
  onConfirmationChange,
  onConfirm,
  title,
}: {
  confirmDisabled?: boolean;
  confirmLabel?: string;
  confirmationLabel?: string;
  confirmationPlaceholder?: string;
  confirmationValue?: string;
  description: string;
  feedbackMessage?: string | null;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirmationChange?: (value: string) => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-neutral-950/45 p-3 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-4"
      role="dialog"
    >
      <div className="w-full rounded-lg border border-neutral-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.18)] sm:max-w-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-red-50 p-2 text-red-700">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">{description}</p>
          </div>
        </div>
        {onConfirmationChange ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor="deleteConfirmation">{confirmationLabel}</Label>
            <Input
              autoComplete="off"
              className="h-11 border-red-200 focus-visible:ring-red-200"
              id="deleteConfirmation"
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder={confirmationPlaceholder}
              value={confirmationValue}
            />
          </div>
        ) : null}
        {feedbackMessage ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
            {feedbackMessage}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={isLoading || confirmDisabled} onClick={onConfirm} type="button" variant="destructive">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
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
