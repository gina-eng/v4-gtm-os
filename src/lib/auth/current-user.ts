import { cache } from "react";
import { cookies } from "next/headers";
import { listOrganizations, getOrganizationById } from "@/db/repositories/organizations";
import {
  getUserById,
  listMembershipsByUser,
} from "@/db/repositories/users";
import type { Organization } from "@/db/schema";
import { AUTH_COOKIE_NAME, type AuthSession, type MembershipWithOrg } from "./types";
import { hasPermission, type PermissionAction } from "./permissions";

/**
 * Lê o usuário "logado" via cookie `v4_user_id`.
 *
 * Embrulhado com `react.cache`: o layout e a page chamam `getCurrentSession`
 * no mesmo request — o cache evita re-executar as 3 queries (getUserById +
 * listMembershipsByUser + listOrganizations) duas vezes por navegação.
 * O escopo é por request, então não há risco de servir sessão de outro user.
 *
 * ⚠️ Mock para dev. Quando a auth real entrar (adendo §11):
 *   - Substituir leitura do cookie pelo session token assinado
 *   - Validar contra a tabela `sessions`
 *   - O resto (memberships, active org, permissions) continua igual
 */
export const getCurrentSession = cache(async (): Promise<AuthSession | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!userId) return null;

  // As três queries são independentes (listMembershipsByUser/listOrganizations
  // não dependem do resultado de getUserById, só do userId do cookie), então
  // rodamos em paralelo. Roda a cada request por causa do layout force-dynamic.
  const [user, rawMemberships, allOrgs] = await Promise.all([
    getUserById(userId),
    listMembershipsByUser(userId),
    listOrganizations(),
  ]);
  if (!user || user.status !== "active") return null;
  const memberships: MembershipWithOrg[] = [];
  for (const m of rawMemberships) {
    if (m.organizationId) {
      const org = allOrgs.find((o) => o.id === m.organizationId);
      if (org) memberships.push({ ...m, organization: org, regionalUnits: null });
    } else if (m.regional) {
      // Membership regional: representado como "membership da Matriz com escopo regional".
      // A `organization` aponta para a Matriz pra manter os checks atuais consistentes;
      // `regionalUnits` traz as unidades que o vínculo cobre.
      const matriz = allOrgs.find((o) => o.type === "matriz");
      const regionalUnits = allOrgs.filter(
        (o) => o.type === "unidade" && o.regional === m.regional,
      );
      if (matriz) {
        memberships.push({ ...m, organization: matriz, regionalUnits });
      }
    }
  }

  const isMatrizUser = memberships.some(
    (m) => m.regional === null && m.organization.type === "matriz",
  );

  // Matriz: pode atuar sobre qualquer org (visibilidade total).
  // Unidade: orgs com membership direto + orgs cobertas por memberships regionais.
  let availableOrganizations: Organization[];
  if (isMatrizUser) {
    availableOrganizations = allOrgs;
  } else {
    const acc = new Map<string, Organization>();
    for (const m of memberships) {
      if (m.regional) {
        // Membership regional cobre as unidades, mas NÃO concede acesso à Matriz.
        for (const u of m.regionalUnits ?? []) acc.set(u.id, u);
      } else {
        acc.set(m.organization.id, m.organization);
      }
    }
    availableOrganizations = Array.from(acc.values());
  }

  const activeOrganization = user.activeOrganizationId
    ? (availableOrganizations.find((o) => o.id === user.activeOrganizationId) ?? null)
    : null;

  // Acting mode: se a org ativa é uma unidade, o user está vendo "como unidade"
  // (mesmo sendo matriz — impersonação via switcher). Caso contrário (org ativa
  // null = consolidado, ou activeOrganization.type === "matriz") atua como matriz.
  const actingMode: "matriz" | "unidade" =
    activeOrganization?.type === "unidade" ? "unidade" : "matriz";

  return {
    user,
    memberships,
    activeOrganization,
    isMatrizUser,
    availableOrganizations,
    actingMode,
  };
});

export class UnauthorizedError extends Error {
  constructor(message = "Não autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Sem permissão para esta ação") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Garante que há um usuário autenticado, retorna a sessão.
 * Lança UnauthorizedError caso contrário.
 */
export async function requireAuth(): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/**
 * Checa permissão contra todos os memberships do usuário.
 * Lança ForbiddenError se nenhum dos memberships autoriza.
 *
 * @param organizationId Se fornecido, restringe a verificação ao membership dessa org.
 *                       Caso contrário, qualquer membership ativo que dê a permissão basta.
 */
export async function requirePermission(
  session: AuthSession,
  action: PermissionAction,
  organizationId?: string,
): Promise<void> {
  const memberships = organizationId
    ? session.memberships.filter(
        (m) =>
          m.organizationId === organizationId ||
          // Membership regional cobre as unidades dessa regional.
          (m.regionalUnits?.some((u) => u.id === organizationId) ?? false),
      )
    : session.memberships;

  for (const m of memberships) {
    // Memberships regionais são tratados como escopo "unidade" para permissões —
    // o user atua dentro de uma unidade, só que via delegação regional.
    const scope = m.regional ? "unidade" : m.organization.type;
    if (hasPermission(action, m.role, scope)) return;
  }

  // Regra de Matriz: Admin Matriz pode atuar sobre qualquer organization.
  // Se passou organizationId que não é da Matriz mas o user é Matriz, checa pela Matriz.
  if (session.isMatrizUser) {
    const matrizMembership = session.memberships.find(
      (m) => m.organization.type === "matriz",
    );
    if (matrizMembership && hasPermission(action, matrizMembership.role, "matriz")) {
      return;
    }
  }

  throw new ForbiddenError(
    `Sem permissão para "${action}"${organizationId ? ` na organização ${organizationId}` : ""}`,
  );
}
