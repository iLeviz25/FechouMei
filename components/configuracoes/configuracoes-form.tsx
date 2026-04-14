"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogOut, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

type ConfiguracoesFormProps = {
  profile: Pick<Profile, "full_name" | "work_type" | "business_mode" | "main_category" | "main_goal"> | null;
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
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [workType, setWorkType] = useState(profile?.work_type ?? workTypeOptions[0]);
  const [businessMode, setBusinessMode] = useState(profile?.business_mode ?? "servico");
  const [mainCategory, setMainCategory] = useState(profile?.main_category ?? categoryOptions[0]);
  const [mainGoal, setMainGoal] = useState(profile?.main_goal ?? goalOptions[0]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [isSavingProfile, startProfileTransition] = useTransition();
  const [isUpdatingPassword, startPasswordTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);

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
          full_name: fullName,
          work_type: workType,
          business_mode: businessMode,
          main_category: mainCategory,
          main_goal: mainGoal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        setProfileMessage(error.message);
        return;
      }

      setProfileMessage("Dados atualizados com sucesso.");
      router.refresh();
    });
  }

  function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
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
        setPasswordMessage(error.message);
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
    startDeleteTransition(async () => {
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

      const { error: movementsError } = await supabase
        .from("movimentacoes")
        .delete()
        .eq("user_id", user.id);
      const { error: checklistError } = await supabase
        .from("obrigacoes_checklist")
        .delete()
        .eq("user_id", user.id);
      const { error: profileError } = await supabase.from("profiles").delete().eq("id", user.id);

      if (movementsError || checklistError || profileError) {
        setDeleteMessage(
          movementsError?.message ??
            checklistError?.message ??
            profileError?.message ??
            "Não foi possível excluir os dados.",
        );
        return;
      }

      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="success" className="w-fit">
          Configurações
        </Badge>
        <h1 className="text-2xl font-semibold text-neutral-950 sm:text-3xl">Conta e preferências</h1>
        <p className="max-w-2xl text-sm leading-6 text-neutral-600">
          Atualize seus dados, troque a senha e controle a segurança da conta.
        </p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Dados do perfil</CardTitle>
          <CardDescription>As mesmas informações do onboarding, agora editáveis.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form className="space-y-5" onSubmit={handleSaveProfile}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome</Label>
                <Input
                  id="fullName"
                  autoComplete="name"
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Seu nome completo"
                  required
                  value={fullName}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workType">Tipo de trabalho</Label>
                <OptionGroup
                  name="workType"
                  onChange={setWorkType}
                  options={workTypeOptions.map((option) => ({ label: option, value: option }))}
                  value={workType}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessMode">Atua com</Label>
                <OptionGroup
                  name="businessMode"
                  onChange={setBusinessMode}
                  options={businessModeOptions}
                  value={businessMode}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mainCategory">Categoria principal</Label>
                <OptionGroup
                  name="mainCategory"
                  onChange={setMainCategory}
                  options={categoryOptions.map((option) => ({ label: option, value: option }))}
                  value={mainCategory}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="mainGoal">Objetivo principal</Label>
                <OptionGroup
                  name="mainGoal"
                  onChange={setMainGoal}
                  options={goalOptions.map((option) => ({ label: option, value: option }))}
                  value={mainGoal}
                />
              </div>
            </div>

            {profileMessage ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {profileMessage}
              </p>
            ) : null}

            <Button className="w-full sm:w-auto" disabled={isSavingProfile} type="submit">
              {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar alterações
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>Crie uma nova senha para acessar sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form className="space-y-4" onSubmit={handleUpdatePassword}>
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
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
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                autoComplete="new-password"
                minLength={6}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repita a nova senha"
                required
                type="password"
                value={confirmPassword}
              />
            </div>

            {passwordMessage ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {passwordMessage}
              </p>
            ) : null}

            <Button className="w-full sm:w-auto" disabled={isUpdatingPassword} type="submit">
              {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Sessão</CardTitle>
          <CardDescription>Se quiser sair do app, finalize a sessão por aqui.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <Button className="w-full sm:w-auto" onClick={handleSignOut} variant="outline">
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-red-50 p-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Excluir conta</CardTitle>
              <CardDescription>
                Esta ação remove seus dados do FechouMEI. A conta de autenticação do Supabase
                não é removida automaticamente nesta etapa.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <Button className="w-full sm:w-auto" onClick={() => setDeleteStep(1)} variant="destructive">
            <Trash2 className="h-4 w-4" />
            Excluir conta
          </Button>
          {deleteMessage ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {deleteStep === 1 ? (
        <ConfirmDialog
          description="Tem certeza de que deseja excluir sua conta?"
          onCancel={() => setDeleteStep(0)}
          onConfirm={() => setDeleteStep(2)}
          title="Confirmar exclusão"
        />
      ) : null}

      {deleteStep === 2 ? (
        <ConfirmDialog
          confirmLabel="Excluir agora"
          description="Essa ação é irreversível e seus dados serão removidos do app."
          isLoading={isDeleting}
          onCancel={() => setDeleteStep(0)}
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

function ConfirmDialog({
  confirmLabel = "Continuar",
  description,
  isLoading,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel?: string;
  description: string;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/45 p-3 sm:items-center sm:justify-center sm:p-4"
      role="dialog"
    >
      <div className="w-full rounded-md bg-white p-4 shadow-lg sm:max-w-sm">
        <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancelar
          </Button>
          <Button disabled={isLoading} onClick={onConfirm} type="button" variant="destructive">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
