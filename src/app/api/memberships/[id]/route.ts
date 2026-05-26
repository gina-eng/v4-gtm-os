import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  getMembershipById,
  LastAdminError,
  revokeMembership,
  updateMembership,
} from "@/db/repositories/users";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { updateMembershipSchema } from "@/lib/validations/users";

type Params = { id: string };

export async function PATCH(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    const target = await getMembershipById(id);
    if (!target) {
      return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
    }

    await requirePermission(
      session,
      "membership.update",
      target.organizationId ?? undefined,
    );

    if (!session.isMatrizUser) {
      // Memberships regionais só podem ser editados pela Matriz.
      if (!target.organizationId) {
        throw new ForbiddenError("Apenas a Matriz pode editar vínculos regionais.");
      }
      const isOwn = session.memberships.some(
        (m) => m.organizationId === target.organizationId,
      );
      if (!isOwn) {
        throw new ForbiddenError("Sem acesso a esse vínculo.");
      }
    }

    const body = await req.json();
    const input = updateMembershipSchema.parse(body);
    const updated = await updateMembership(id, input);
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof LastAdminError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
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
    console.error("[PATCH /api/memberships/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    const target = await getMembershipById(id);
    if (!target) {
      return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
    }

    await requirePermission(
      session,
      "membership.revoke",
      target.organizationId ?? undefined,
    );

    if (!session.isMatrizUser) {
      if (!target.organizationId) {
        throw new ForbiddenError("Apenas a Matriz pode revogar vínculos regionais.");
      }
      const isOwn = session.memberships.some(
        (m) => m.organizationId === target.organizationId,
      );
      if (!isOwn) {
        throw new ForbiddenError("Sem acesso a esse vínculo.");
      }
    }

    const revoked = await revokeMembership(id);
    return NextResponse.json({ data: revoked });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof LastAdminError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[DELETE /api/memberships/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
