import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { listUsers, listMembershipsByUser } from "@/db/repositories/users";
import { getOrganizationById } from "@/db/repositories/organizations";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { listUsersQuerySchema } from "@/lib/validations/users";

/**
 * GET /api/users
 * Query: ?organizationId=&status=&role=&search=
 *
 * Scoping:
 * - Matriz com `user.list`: vê TODOS os usuários cadastrados (visibilidade total),
 *   `organizationId` é só filtro opcional.
 * - Unidade/Regional: vê os usuários das orgs em que tem acesso (diretas ou via
 *   delegação regional). Tentativa de filtrar por org fora do escopo → 403.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, "user.list");

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const query = listUsersQuerySchema.parse(params);

    let effectiveOrgId: string | undefined = query.organizationId;
    if (!session.isMatrizUser) {
      const accessibleOrgIds = new Set(session.availableOrganizations.map((o) => o.id));
      if (effectiveOrgId && !accessibleOrgIds.has(effectiveOrgId)) {
        throw new ForbiddenError("Sem acesso a essa organização.");
      }
      if (!effectiveOrgId) {
        effectiveOrgId =
          session.activeOrganization?.id ?? Array.from(accessibleOrgIds)[0];
      }
    }

    const users = await listUsers({
      organizationId: effectiveOrgId,
      status: query.status,
    });

    // Filtros adicionais que não estão no repo
    let result = users;
    if (query.search) {
      const needle = query.search.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
      );
    }

    // Pra filtrar memberships do escopo: descobrir regional da org alvo (se houver).
    const scopedOrg = effectiveOrgId ? await getOrganizationById(effectiveOrgId) : null;
    const scopedRegional = scopedOrg?.regional ?? null;

    // Enriquecer com memberships (precisa pra mostrar papel na tabela)
    const enriched = [];
    for (const u of result) {
      const ms = await listMembershipsByUser(u.id);
      const memberships = [];
      for (const m of ms) {
        if (effectiveOrgId) {
          const directMatch = m.organizationId === effectiveOrgId;
          const regionalMatch =
            m.regional !== null && scopedRegional !== null && m.regional === scopedRegional;
          if (!directMatch && !regionalMatch) continue;
        }
        if (query.role && m.role !== query.role) continue;
        if (m.organizationId) {
          const org = await getOrganizationById(m.organizationId);
          if (!org) continue;
          memberships.push({ ...m, organization: org, regionalUnits: null });
        } else if (m.regional) {
          const matriz = await getOrganizationById("00000000-0000-0000-0000-000000000001");
          if (!matriz) continue;
          memberships.push({ ...m, organization: matriz, regionalUnits: [] });
        }
      }
      // Se filtrou por papel e o user não tem membership matching, pula
      if (query.role && memberships.length === 0) continue;
      enriched.push({ ...u, memberships });
    }

    return NextResponse.json({ data: enriched, total: enriched.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Parâmetros inválidos", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[GET /api/users]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
