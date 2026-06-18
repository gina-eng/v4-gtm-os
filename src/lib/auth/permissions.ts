/**
 * Matriz de permissões V4 OS.
 *
 * Princípio do plano: mesmos 3 papéis (admin/gerente/coordenador) em cada
 * escopo (matriz/unidade). O que muda é o `organization.type` do membership.
 *
 * Ajuste vs plano (conforme alinhado com o PM):
 * - Matriz tem **visibilidade total** dos dados das unidades.
 * - Matriz **edita estrutura** (organizations, users, memberships) ✅
 * - Matriz **NÃO edita dados operacionais** das unidades (Reality Check, KRs, métricas).
 *   Essa restrição vai aparecer nas permissões de Sub-fase 1B+ (data.*),
 *   não em F1.1/F1.3.
 */

import type { Role } from "./types";

export type OrgScope = "matriz" | "unidade";

type ScopeRoles = Partial<Record<OrgScope, readonly Role[]>>;

export const PERMISSIONS = {
  // Organizations (estrutura da rede)
  "organization.list": { matriz: ["admin", "gerente", "coordenador"], unidade: ["admin", "gerente", "coordenador"] },
  "organization.create": { matriz: ["admin"] },
  "organization.update": { matriz: ["admin"], unidade: ["admin"] },
  "organization.delete": { matriz: ["admin"] },

  // Users
  "user.list": { matriz: ["admin", "gerente"], unidade: ["admin"] },
  "user.invite": { matriz: ["admin", "gerente"], unidade: ["admin"] },
  "user.update": { matriz: ["admin"], unidade: ["admin"] },
  "user.deactivate": { matriz: ["admin"], unidade: ["admin"] },
  // Remover acesso (soft): desativa o user + vínculos + derruba sessão, PRESERVANDO
  // o registro e o histórico de auditoria (não é hard delete). Admin da Matriz
  // (qualquer user) ou admin de Unidade (só usuários do escopo dela — o route exige
  // permissão em TODAS as orgs do alvo).
  "user.delete": { matriz: ["admin"], unidade: ["admin"] },

  // Memberships
  "membership.create": { matriz: ["admin"], unidade: ["admin"] },
  "membership.update": { matriz: ["admin"], unidade: ["admin"] },
  "membership.revoke": { matriz: ["admin"], unidade: ["admin"] },

  // Audit log
  "audit.view": { matriz: ["admin", "gerente"], unidade: ["admin"] },

  // Premissas do modelo — defaults globais editados pela Matriz em /premissas.
  "premissas.update": { matriz: ["admin", "gerente"] },
} as const satisfies Record<string, ScopeRoles>;

export type PermissionAction = keyof typeof PERMISSIONS;

/**
 * Checa se um papel tem permissão para a ação no escopo dado.
 */
export function hasPermission(
  action: PermissionAction,
  role: Role,
  scope: OrgScope,
): boolean {
  const allowed = (PERMISSIONS[action] as ScopeRoles)[scope];
  if (!allowed) return false;
  return allowed.includes(role);
}
