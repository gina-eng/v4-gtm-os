import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  getOrganizationById,
  updateOrganization,
} from "@/db/repositories/organizations";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { updateOrganizationSchema } from "@/lib/validations/organizations";

type Params = { id: string };

export async function GET(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    const org = await getOrganizationById(id);
    if (!org) {
      return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });
    }

    // Scoping: Unidade só pode ler sua própria org
    if (!session.isMatrizUser) {
      const isOwn = session.memberships.some((m) => m.organizationId === id);
      if (!isOwn) {
        throw new ForbiddenError("Sem acesso a essa organização.");
      }
    }

    return NextResponse.json({ data: org });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[GET /api/organizations/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    await requirePermission(session, "organization.update", id);

    // Admin Unidade: só pode editar `name` da própria org.
    // Admin Matriz: pode tudo (exceto horizonte que é fluxo Fase 3 — fora deste escopo).
    const body = await req.json();
    const input = updateOrganizationSchema.parse(body);

    if (!session.isMatrizUser) {
      const isOwn = session.memberships.some((m) => m.organizationId === id);
      if (!isOwn) {
        throw new ForbiddenError("Sem acesso a essa organização.");
      }
      if (input.status !== undefined || input.horizonteAtual !== undefined) {
        throw new ForbiddenError(
          "Admin de unidade só pode editar o nome da organização.",
        );
      }
    }

    const updated = await updateOrganization(id, input);
    if (!updated) {
      return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
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
      return NextResponse.json({ error: "JSON inválido no corpo da requisição" }, { status: 400 });
    }
    console.error("[PATCH /api/organizations/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
