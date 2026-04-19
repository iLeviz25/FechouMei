type AuthErrorLike = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
};

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isDuplicateSignupResult(user: { identities?: unknown[] | null } | null | undefined) {
  return Array.isArray(user?.identities) && user.identities.length === 0;
}

export function getAuthErrorMessage(error: unknown, fallback = "Não foi possível concluir agora. Tente novamente em instantes.") {
  const authError = toAuthErrorLike(error);
  const code = authError?.code?.toLowerCase() ?? "";
  const message = authError?.message?.toLowerCase() ?? "";
  const status = authError?.status;

  if (
    code.includes("user_already_exists") ||
    code.includes("email_exists") ||
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("user already") ||
    message.includes("email already")
  ) {
    return "Este e-mail já tem uma conta. Entre com sua senha ou recupere o acesso.";
  }

  if (
    code.includes("invalid_credentials") ||
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return "E-mail ou senha inválidos.";
  }

  if (
    code.includes("weak_password") ||
    message.includes("password") && message.includes("characters")
  ) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (
    message.includes("anonymous sign-ins are disabled") ||
    message.includes("anonymous")
  ) {
    return "Preencha e-mail e senha para criar sua conta.";
  }

  if (
    code.includes("otp_expired") ||
    code.includes("session_not_found") ||
    message.includes("expired") ||
    message.includes("invalid token")
  ) {
    return "Esse link expirou ou não é mais válido. Solicite um novo acesso.";
  }

  if (status === 429 || message.includes("rate limit") || message.includes("too many")) {
    return "Muitas tentativas em sequência. Aguarde um pouco e tente novamente.";
  }

  if (
    status && status >= 500 ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("temporarily")
  ) {
    return "Não foi possível conectar agora. Tente novamente em instantes.";
  }

  return fallback;
}

export function getProfileErrorMessage() {
  return "Não foi possível preparar sua conta agora. Tente novamente em instantes.";
}

function toAuthErrorLike(error: unknown): AuthErrorLike | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  return error as AuthErrorLike;
}
