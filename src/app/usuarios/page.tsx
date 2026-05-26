import { redirect } from "next/navigation";
import { listMembershipsByUser, listUsers } from "@/db/repositories/users";
import { getOrganizationById, listOrganizations } from "@/db/repositories/organizations";
import { requireAuth } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { UsuariosClient } from "@/components/usuarios/usuarios-client";

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

  // Enriquece com memberships (precisa pra mostrar papel + filtrar por org)
  const scopedOrg = scopedOrgId ? await getOrganizationById(scopedOrgId) : null;
  const scopedRegional = scopedOrg?.regional ?? null;
  const enriched = [];
  for (const u of users) {
    const ms = await listMembershipsByUser(u.id);
    const memberships = [];
    for (const m of ms) {
      // Para users de unidade, mostramos só os memberships relevantes ao escopo:
      // - membership direto na org ativa
      // - membership regional que cobre a org ativa
      if (scopedOrgId) {
        const directMatch = m.organizationId === scopedOrgId;
        const regionalMatch =
          m.regional !== null && scopedRegional !== null && m.regional === scopedRegional;
        if (!directMatch && !regionalMatch) continue;
      }
      if (m.organizationId) {
        const org = await getOrganizationById(m.organizationId);
        if (org) memberships.push({ ...m, organization: org, regionalUnits: null });
      } else if (m.regional) {
        const matriz = await getOrganizationById("00000000-0000-0000-0000-000000000001");
        if (matriz) {
          memberships.push({ ...m, organization: matriz, regionalUnits: [] });
        }
      }
    }
    enriched.push({ ...u, memberships });
  }

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
