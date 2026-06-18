/**
 * Vincula usuários à unidade pelo `users.id_tenant` (chave de import). Cruza
 * id_tenant → unidades.id e grava users.active_organization_id (UUID interno) +
 * cria/reativa o membership. Sem membership o usuário não teria acesso (a sessão
 * deriva o acesso dos memberships). Idempotente. Fonte única — usado pelo
 * scripts/link-usuarios-tenant.ts e pelo scripts/load-usuarios.ts.
 */
import { eq, isNotNull, and } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations, memberships } from "@/db/schema";
import type { Membership } from "@/db/schema";

export type RoleVinculo = Membership["role"];

export type ResultadoVinculo = {
  comIdTenant: number;
  vinculados: number;
  novosMemberships: number;
  naoCasaram: Array<{ email: string; idTenant: string }>;
};

const tkey = (s: string | null) => (s ?? "").trim();

export async function vincularUsuariosPorTenant(
  role: RoleVinculo = "coordenador",
): Promise<ResultadoVinculo> {
  // de-para id_tenant → unidade (id_tenant é UNIQUE)
  const orgs = await db
    .select({ id: organizations.id, idTenant: organizations.idTenant })
    .from(organizations);
  const orgByTenant = new Map<string, string>();
  for (const o of orgs) {
    const t = tkey(o.idTenant);
    if (t) orgByTenant.set(t, o.id);
  }

  const pend = await db
    .select({ id: users.id, email: users.email, idTenant: users.idTenant })
    .from(users)
    .where(isNotNull(users.idTenant));

  const out: ResultadoVinculo = { comIdTenant: pend.length, vinculados: 0, novosMemberships: 0, naoCasaram: [] };

  for (const u of pend) {
    const t = tkey(u.idTenant);
    if (!t) continue;
    const orgId = orgByTenant.get(t);
    if (!orgId) {
      out.naoCasaram.push({ email: u.email, idTenant: t });
      continue;
    }
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ activeOrganizationId: orgId, updatedAt: new Date() })
        .where(eq(users.id, u.id));
      const existing = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, u.id), eq(memberships.organizationId, orgId)))
        .limit(1);
      if (existing.length > 0) {
        await tx
          .update(memberships)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(memberships.id, existing[0].id));
      } else {
        await tx.insert(memberships).values({ userId: u.id, organizationId: orgId, role, status: "active" });
        out.novosMemberships += 1;
      }
    });
    out.vinculados += 1;
  }
  return out;
}
