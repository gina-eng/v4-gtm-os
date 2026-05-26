"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { V4Logo } from "@/design-system/components/V4Logo";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/validations/auth";

/**
 * Fluxo de login em 2 passos:
 *  step="email":    pede só o e-mail → POST /api/auth/check-email
 *  step="password": user já tem senha → POST /api/auth/login
 *  step="setup":    primeiro acesso → POST /api/auth/setup-password
 */
type Step = "email" | "password" | "setup";

export function LoginClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [userName, setUserName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetToEmail() {
    setStep("email");
    setPassword("");
    setPasswordConfirm("");
    setError(null);
    setUserName(null);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "Não foi possível verificar o e-mail.");
        return;
      }
      if (!body.exists) {
        setError(
          "Conta não encontrada. Peça ao administrador da sua organização para cadastrar seu e-mail.",
        );
        return;
      }
      setUserName(body.name ?? null);
      setStep(body.needsPasswordSetup ? "setup" : "password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível entrar.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    if (password.length < 8) {
      setError("Senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível criar a senha.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        {/* Logo + tagline */}
        <div className="flex flex-col items-center mb-8">
          <V4Logo className="h-12 w-12 mb-3" />
          <h1 className="text-xl font-semibold text-foreground">V4 GTM OS</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Sistema operacional da rede V4 Company
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded p-6 shadow-sm">
          {step === "email" && (
            <>
              <h2 className="text-lg font-semibold mb-1">Entrar</h2>
              <p className="text-xs text-muted-foreground mb-5">
                Use o e-mail corporativo da sua matriz ou unidade.
              </p>
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="email"
                    className="text-xs font-medium text-foreground block mb-1"
                  >
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={`seu.email@${ALLOWED_EMAIL_DOMAIN}`}
                    required
                    autoFocus
                    className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Apenas e-mails @{ALLOWED_EMAIL_DOMAIN} são aceitos.
                  </p>
                </div>

                {error && (
                  <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando…
                    </>
                  ) : (
                    "Continuar"
                  )}
                </button>
              </form>
            </>
          )}

          {step === "password" && (
            <>
              <button
                type="button"
                onClick={resetToEmail}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
              >
                <ArrowLeft className="h-3 w-3" /> Trocar de e-mail
              </button>
              <h2 className="text-lg font-semibold mb-1">
                {userName ? `Olá, ${userName}` : "Olá"}
              </h2>
              <p className="text-xs text-muted-foreground mb-5 font-mono break-all">
                {email}
              </p>
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="password"
                    className="text-xs font-medium text-foreground block mb-1"
                  >
                    Senha
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {error && (
                  <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Entrando…
                    </>
                  ) : (
                    "Entrar"
                  )}
                </button>
              </form>
            </>
          )}

          {step === "setup" && (
            <>
              <button
                type="button"
                onClick={resetToEmail}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
              >
                <ArrowLeft className="h-3 w-3" /> Trocar de e-mail
              </button>
              <h2 className="text-lg font-semibold mb-1">
                {userName ? `Bem-vindo, ${userName}` : "Primeiro acesso"}
              </h2>
              <p className="text-xs text-muted-foreground mb-1 font-mono break-all">
                {email}
              </p>
              <p className="text-xs text-muted-foreground mb-5">
                Defina uma senha para acessar o sistema. Você usará ela nos próximos logins.
              </p>
              <form onSubmit={handleSetupSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="new-password"
                    className="text-xs font-medium text-foreground block mb-1"
                  >
                    Nova senha
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                    maxLength={72}
                    autoFocus
                    className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="text-xs font-medium text-foreground block mb-1"
                  >
                    Confirmar senha
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="Digite a senha novamente"
                    required
                    minLength={8}
                    maxLength={72}
                    className="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {error && (
                  <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Criando…
                    </>
                  ) : (
                    "Criar senha e entrar"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
