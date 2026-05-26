"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Network, ShieldAlert } from "lucide-react";
import { V4Logo } from "@/design-system/components/V4Logo";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/validations/auth";

type DevUser = {
  id: string;
  name: string;
  email: string;
  memberships: Array<{ role: string; orgName: string; orgType: "matriz" | "unidade" }>;
};

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);

  // Carrega lista de users de teste (apenas em dev)
  useEffect(() => {
    fetch("/api/dev/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.data) setDevUsers(body.data);
      })
      .catch(() => {
        /* ignore — em prod o endpoint não existe */
      });
  }, []);

  async function submitLogin(loginEmail: string, loginPassword?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    await submitLogin(email.trim(), password);
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

        {/* Painel de logins de teste (apenas dev) */}
        {devUsers.length > 0 && (
          <div className="mt-4 bg-card border border-border rounded">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
              <ShieldAlert className="h-3.5 w-3.5 text-warning" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Logins de teste (apenas em dev)
              </span>
            </div>
            <ul className="divide-y divide-border max-h-[320px] overflow-auto">
              {devUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setEmail(u.email)}
                    disabled={submitting}
                    title="Clique pra preencher o email; a senha ainda é obrigatória"
                    className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {u.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {u.email}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end shrink-0">
                      {u.memberships.map((m, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                        >
                          {m.orgType === "matriz" ? (
                            <Network className="h-3 w-3" />
                          ) : (
                            <Building2 className="h-3 w-3" />
                          )}
                          <span>
                            <span className="capitalize">{m.role}</span> · {m.orgName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
