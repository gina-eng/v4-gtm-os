import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { updateUserActiveOrg } from "@/db/repositories/users";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
} from "@/lib/auth/current-user";
import { updateActiveOrgSchema } from "@/lib/validations/users";

/**
 * PATCH /api/auth/active-organization
 * Body: { organizationId: uuid | null }
 *
 * - Matriz user pode escolher qualquer org disponível OU `null` (= "Todas as Franquias")
 * - Unidade user só pode escolher uma org em que tem membership ativa, NÃO pode escolher null
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { organizationId } = updateActiveOrgSchema.parse(body);

    if (organizationId === null) {
      if (!session.isMatrizUser) {
        throw new ForbiddenError(
          "Apenas usuários da Matriz podem ver a visão consolidada.",
        );
      }
    } else {
      const isAvailable = session.availableOrganizations.some(
        (o) => o.id === organizationId,
      );
      if (!isAvailable) {
        throw new ForbiddenError(
          "Você não tem acesso a essa organização.",
        );
      }
    }

    await updateUserActiveOrg(session.user.id, organizationId);
    return NextResponse.json({ data: { activeOrganizationId: organizationId } });
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
