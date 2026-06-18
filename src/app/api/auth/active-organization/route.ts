import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { updateUserActiveOrg } from "@/db/repositories/users";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
} from "@/lib/auth/current-user";
import { updateActiveOrgSchema } from "@/lib/validations/users";
import type { AuthSession } from "@/lib/auth/types";

/**
 * PATCH /api/auth/active-organization
 * Body (discriminated por scope):
 *   { scope: 'geral' | 'todas_unidades' | 'matriz_propria' }
 *   { scope: 'unidade', organizationId: uuid }
 *
 * AUTORIZAÇÃO (assertScopeAllowed): as 3 visões de rede (geral/todas_unidades/
 * matriz_propria) exigem isMatrizUser — espelha a regra do `null` antigo. 'unidade'
 * exige que a org esteja em availableOrganizations. Zod valida só a forma; a
 * autorização é AQUI, num só lugar (não confiar no schema pra isso).
 *
 * Retorna o par persistido (activeOrganizationId, matrizScope) por escopo.
 */
type ScopeBody = ReturnType<typeof updateActiveOrgSchema.parse>;

function assertScopeAllowed(
  session: AuthSession,
  body: ScopeBody,
): { activeOrganizationId: string | null; matrizScope: "geral" | "todas_unidades" | null } {
  switch (body.scope) {
    case "geral":
    case "todas_unidades": {
      if (!session.isMatrizUser) {
        throw new ForbiddenError("Apenas usuários da Matriz podem ver a visão consolidada.");
      }
      return { activeOrganizationId: null, matrizScope: body.scope };
    }
    case "matriz_propria": {
      if (!session.isMatrizUser) {
        throw new ForbiddenError("Apenas usuários da Matriz podem ver a visão da Matriz.");
      }
      const matrizOrg = session.availableOrganizations.find((o) => o.type === "matriz");
      if (!matrizOrg) {
        throw new ForbiddenError("Nenhuma organização Matriz disponível.");
      }
      return { activeOrganizationId: matrizOrg.id, matrizScope: null };
    }
    case "unidade": {
      const isAvailable = session.availableOrganizations.some(
        (o) => o.id === body.organizationId && o.type === "unidade",
      );
      if (!isAvailable) {
        throw new ForbiddenError("Você não tem acesso a essa organização.");
      }
      return { activeOrganizationId: body.organizationId, matrizScope: null };
    }
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = updateActiveOrgSchema.parse(await req.json());
    const resolved = assertScopeAllowed(session, body);

    await updateUserActiveOrg(session.user.id, resolved);
    return NextResponse.json({ data: { scope: body.scope, ...resolved } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    console.error("[PATCH /api/auth/active-organization]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
