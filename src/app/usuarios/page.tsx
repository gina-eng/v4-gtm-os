import { redirect } from "next/navigation";
import { listMembershipsByUserIds, listUsers } from "@/db/repositories/users";
import {
  getOrganizationById,
  getOrganizationsByIds,
  listOrganizations,
} from "@/db/repositories/organizations";
import { requireAuth } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { UsuariosClient } from "@/components/usuarios/usuarios-client";

const MATRIZ_ID = "00000000-0000-0000-0000-000000000001";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await requireAuth();

  // Checa se o user tem permissão pra listar users em pelo menos uma de suas orgs.
  const canList = session.memberships.some((m) =>
    hasPermission("user.list", m.role, m.organization.type),
  );
  if (!canList) {
    redirect("/");
  }

  // Scoping da listagem por actingMode:
  // - matriz consolidado (matriz user sem unidade ativa, ou com matriz ativa):
  //   vê todos os users de todas as orgs.
  // - unidade (qualquer user com unidade ativa — inclui matriz "impersonando"):
  //   vê só users dessa unidade ativa.
  let users;
  let scopedOrgId: string | undefined;
  if (session.actingMode === "unidade" && session.activeOrganization) {
    scopedOrgId = session.activeOrganization.id;
    users = await listUsers({ organizationId: scopedOrgId });
  } else if (session.isMatrizUser) {
    scopedOrgId = undefined;
    users = await listUsers();
  } else {
    // Fallback defensivo (unit user sem org ativa, edge case)
    scopedOrgId = session.memberships.find((m) => m.organizationId)?.organizationId ?? undefined;
    users = await listUsers(scopedOrgId ? { organizationId: scopedOrgId } : undefined);
  }

  // Enriquece com memberships (precisa pra mostrar papel + filtrar por org).
  // Batch em 3 queries totais: scopedOrg + todos memberships + todas orgs envolvidas,
  // independente do nº de users (antes era 1 query por user + 1 query por membership).
  const scopedOrg = scopedOrgId ? await getOrganizationById(scopedOrgId) : null;
  const scopedRegional = scopedOrg?.regional ?? null;

  const allMemberships = await listMembershipsByUserIds(users.map((u) => u.id));

  // Aplica o filtro de escopo ANTES de coletar orgIds, pra não buscar orgs
  // que vamos descartar.
  const filteredMemberships = allMemberships.filter((m) => {
    if (!scopedOrgId) return true;
    const directMatch = m.organizationId === scopedOrgId;
    const regionalMatch =
      m.regional !== null && scopedRegional !== null && m.regional === scopedRegional;
    return directMatch || regionalMatch;
  });

  const orgIdsNeeded = new Set<string>();
  for (const m of filteredMemberships) {
    if (m.organizationId) orgIdsNeeded.add(m.organizationId);
    else if (m.regional) orgIdsNeeded.add(MATRIZ_ID); // regional ⇒ exibe rótulo da Matriz
  }
  const orgsById = await getOrganizationsByIds([...orgIdsNeeded]);

  const membershipsByUser = new Map<string, typeof filteredMemberships>();
  for (const m of filteredMemberships) {
    const arr = membershipsByUser.get(m.userId) ?? [];
    arr.push(m);
    membershipsByUser.set(m.userId, arr);
  }

  const enriched = users.map((u) => {
    const ms = membershipsByUser.get(u.id) ?? [];
    const memberships = [];
    for (const m of ms) {
      if (m.organizationId) {
        const org = orgsById.get(m.organizationId);
        if (org) memberships.push({ ...m, organization: org, regionalUnits: null });
      } else if (m.regional) {
        const matriz = orgsById.get(MATRIZ_ID);
        if (matriz) memberships.push({ ...m, organization: matriz, regionalUnits: [] });
      }
    }
    return { ...u, memberships };
  });

  // Lista de orgs no select de convite — segue o actingMode:
  // - matriz consolidado: pode convidar pra qualquer org → mostra todas
  // - unidade (inclui matriz impersonando): só a própria org ativa
  let organizationsForInvite;
  if (session.actingMode === "unidade" && session.activeOrganization) {
    organizationsForInvite = [session.activeOrganization];
  } else if (session.isMatrizUser) {
    organizationsForInvite = await listOrganizations();
  } else {
    organizationsForInvite = session.availableOrganizations;
  }

  return (
    <UsuariosClient
      initialUsers={enriched}
      organizationsForInvite={organizationsForInvite}
      defaultOrganizationId={scopedOrgId}
    />
  );
}
