"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { V4Logo } from "@/design-system/components/V4Logo";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/validations/auth";

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || submitting) return;

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

        {/* Card de login */}
        <div className="bg-card border border-border rounded p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">Entrar</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Use o e-mail corporativo da sua matriz ou unidade.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
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
        </div>
      </div>
    </div>
  );
}
