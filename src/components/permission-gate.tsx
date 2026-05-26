"use client";

import { useCan } from "@/lib/auth/auth-context";
import type { PermissionAction } from "@/lib/auth/permissions";

/**
 * Renderiza `children` se o usuário atual tem permissão para `action`.
 * Caso contrário, renderiza `fallback` (default: nada).
 *
 * Espelha a checagem de `requirePermission` do server-side, mas só pra UI —
 * a segurança real continua sendo do server. Esse componente é só UX
 * (esconder botões/links que o user não pode usar).
 *
 * @example
 * <PermissionGate action="organization.create">
 *   <button>Adicionar unidade</button>
 * </PermissionGate>
 */
export function PermissionGate({
  action,
  organizationId,
  children,
  fallback = null,
}: {
  action: PermissionAction;
  organizationId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const can = useCan();
  if (!can(action, organizationId)) return <>{fallback}</>;
  return <>{children}</>;
}
