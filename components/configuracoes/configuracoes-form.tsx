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
      {/* Header */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Configuracoes</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Conta e preferencias
        </h1>
        <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Atualize seus dados, troque a senha e controle a seguranca da conta.
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Dados do perfil</CardTitle>
          <CardDescription>As mesmas informacoes do onboarding, agora editaveis.</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
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
              <div className="rounded-xl border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground">
                {profileMessage}
              </div>
            ) : null}

            <Button className="w-full sm:w-auto gap-2" disabled={isSavingProfile} type="submit" size="lg">
              {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar alteracoes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>Crie uma nova senha para acessar sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          <form className="space-y-5" onSubmit={handleUpdatePassword}>
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
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
              <div className="rounded-xl border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground">
                {passwordMessage}
              </div>
            ) : null}

            <Button className="w-full sm:w-auto gap-2" disabled={isUpdatingPassword} type="submit" size="lg">
              {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Session Card */}
      <Card>
        <CardHeader className="p-5 sm:p-6">
          <CardTitle>Sessao</CardTitle>
          <CardDescription>Se quiser sair do app, finalize a sessao por aqui.</CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          <Button className="w-full sm:w-auto gap-2" onClick={handleSignOut} variant="outline" size="lg">
            <LogOut className="h-4 w-4" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone Card */}
      <Card className="border-destructive/30">
        <CardHeader className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-destructive">Excluir conta</CardTitle>
              <CardDescription>
                Esta acao remove seus dados do FechouMEI. A conta de autenticacao do Supabase
                nao e removida automaticamente nesta etapa.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
          <Button className="w-full sm:w-auto gap-2" onClick={() => setDeleteStep(1)} variant="destructive" size="lg">
            <Trash2 className="h-4 w-4" />
            Excluir conta
          </Button>
          {deleteMessage ? (
            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {deleteMessage}
            </div>
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
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-pressed={selected}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
              selected
                ? "border-primary/30 bg-accent text-accent-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-border/80 hover:bg-muted/50 hover:text-foreground"
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
      className="fixed inset-0 z-50 flex items-end bg-foreground/50 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="w-full rounded-2xl bg-card p-6 shadow-elevated sm:max-w-sm">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6 flex gap-3">
          <Button className="flex-1" onClick={onCancel} type="button" variant="outline">
            Cancelar
          </Button>
          <Button className="flex-1" disabled={isLoading} onClick={onConfirm} type="button" variant="destructive">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
