import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { inviteUser, UserConflictError } from "@/db/repositories/users";
import { getOrganizationById } from "@/db/repositories/organizations";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { inviteUserSchema } from "@/lib/validations/users";

/**
 * POST /api/users/invite
 * Body: { email, name, organizationId, role }
 *
 * ⚠️ Em dev: cria user com `status='active'` direto, sem fluxo de email.
 *    Em prod (com auth real): cria pending + envia email com activation_token.
 *
 * Scoping:
 * - Matriz Admin/Gerente: pode convidar pra qualquer org
 * - Unidade Admin: só pode convidar pra própria org
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = inviteUserSchema.parse(body);

    if (input.scope === "regional") {
      // Criar vínculo regional é prerrogativa da Matriz — afeta N unidades de uma vez.
      if (!session.isMatrizUser) {
        throw new ForbiddenError(
          "Apenas usuários da Matriz podem conceder acesso regional.",
        );
      }
      await requirePermission(session, "user.invite");
    } else {
      // RBAC + scoping por unidade
      await requirePermission(session, "user.invite", input.organizationId);

      if (!session.isMatrizUser) {
        const isOwn = session.memberships.some(
          (m) => m.organizationId === input.organizationId,
        );
        if (!isOwn) {
          throw new ForbiddenError(
            "Você só pode convidar usuários para a sua própria organização.",
          );
        }
      }

      const org = await getOrganizationById(input.organizationId);
      if (!org) {
        return NextResponse.json(
          { error: "Organização não encontrada" },
          { status: 404 },
        );
      }
    }

    const result = await inviteUser(input);
    return NextResponse.json(
      {
        data: {
          user: result.user,
          membership: result.membership,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UserConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
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
    console.error("[POST /api/users/invite]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
