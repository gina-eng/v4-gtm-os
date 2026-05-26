import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  createMembership,
  MembershipConflictError,
} from "@/db/repositories/users";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { createMembershipSchema } from "@/lib/validations/users";

/**
 * POST /api/memberships
 * Body: { userId, organizationId, role }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = createMembershipSchema.parse(body);

    if (input.scope === "regional") {
      if (!session.isMatrizUser) {
        throw new ForbiddenError(
          "Apenas usuários da Matriz podem conceder acesso regional.",
        );
      }
      await requirePermission(session, "membership.create");
    } else {
      await requirePermission(session, "membership.create", input.organizationId);
      if (!session.isMatrizUser) {
        const isOwn = session.memberships.some(
          (m) => m.organizationId === input.organizationId,
        );
        if (!isOwn) {
          throw new ForbiddenError(
            "Você só pode criar vínculos na sua própria organização.",
          );
        }
      }
    }

    const m = await createMembership(input);
    return NextResponse.json({ data: m }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof MembershipConflictError) {
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
    console.error("[POST /api/memberships]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
