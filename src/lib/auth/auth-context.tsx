"use client";

import { createContext, useContext, useMemo } from "react";
import { hasPermission, type PermissionAction } from "./permissions";
import type { AuthSession } from "./types";

type AuthContextValue = {
  session: AuthSession;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provider que coloca a sessão atual na árvore React.
 *
 * A sessão vem resolvida do server (em layout.tsx via getCurrentSession()),
 * então não há refetch nem loading state — quando esse provider é montado,
 * já temos o user autenticado.
 *
 * Se não houver sessão, layout.tsx redireciona para /login antes de renderizar.
 */
export function AuthProvider({
  session,
  children,
}: {
  session: AuthSession;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ session }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthSession {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useSession deve ser usado dentro de <AuthProvider>");
  }
  return ctx.session;
}

/**
 * Helper conveniente para checar permissão no client.
 * Espelha a lógica de requirePermission do server.
 */
export function useCan() {
  const session = useSession();
  return function can(action: PermissionAction, organizationId?: string): boolean {
    const memberships = organizationId
      ? session.memberships.filter(
          (m) =>
            m.organizationId === organizationId ||
            (m.regionalUnits?.some((u) => u.id === organizationId) ?? false),
        )
      : session.memberships;

    for (const m of memberships) {
      const scope = m.regional ? "unidade" : m.organization.type;
      if (hasPermission(action, m.role, scope)) return true;
    }

    if (session.isMatrizUser) {
      const matriz = session.memberships.find(
        (m) => m.regional === null && m.organization.type === "matriz",
      );
      if (matriz && hasPermission(action, matriz.role, "matriz")) return true;
    }

    return false;
  };
}
