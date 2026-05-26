import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  deleteUser,
  getUserById,
  listMembershipsByUser,
  updateUser,
} from "@/db/repositories/users";
import { getOrganizationById } from "@/db/repositories/organizations";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { updateUserSchema } from "@/lib/validations/users";

type Params = { id: string };

export async function GET(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    await requirePermission(session, "user.list");

    const { id } = await ctx.params;
    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const ms = await listMembershipsByUser(user.id);
    const enriched = [];
    for (const m of ms) {
      if (m.organizationId) {
        const org = await getOrganizationById(m.organizationId);
        if (org) enriched.push({ ...m, organization: org, regionalUnits: null });
      } else if (m.regional) {
        const matriz = await getOrganizationById("00000000-0000-0000-0000-000000000001");
        if (matriz) enriched.push({ ...m, organization: matriz, regionalUnits: [] });
      }
    }

    // Scoping: Unidade só pode ver users que pertencem à própria org (ou via regional)
    if (!session.isMatrizUser) {
      const accessibleOrgIds = new Set(session.availableOrganizations.map((o) => o.id));
      const overlaps = enriched.some(
        (m) => m.organizationId && accessibleOrgIds.has(m.organizationId),
      );
      if (!overlaps) {
        throw new ForbiddenError("Sem acesso a esse usuário.");
      }
    }

    return NextResponse.json({ data: { ...user, memberships: enriched } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[GET /api/users/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const target = await getUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const body = await req.json();
    const input = updateUserSchema.parse(body);

    // Se está mudando status (ativar/desativar), exige permissão específica
    if (input.status !== undefined) {
      // checa contra qualquer org em que o target tem membership
      const targetMemberships = await listMembershipsByUser(target.id);
      const targetOrgIds = targetMemberships
        .map((m) => m.organizationId)
        .filter((id): id is string => id !== null);
      let allowed = false;
      for (const orgId of targetOrgIds) {
        try {
          await requirePermission(session, "user.deactivate", orgId);
          allowed = true;
          break;
        } catch {
          /* tenta próxima org */
        }
      }
      if (!allowed && !session.isMatrizUser) {
        throw new ForbiddenError("Sem permissão para alterar status deste usuário.");
      }
    } else {
      await requirePermission(session, "user.update");
    }

    const updated = await updateUser(id, input);
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
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    console.error("[PATCH /api/users/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/users/:id
 *
 * Hard delete: remove o user e todos os memberships (ativos e inativos).
 * Operação irreversível, restrita a Admin Matriz. Não permite auto-exclusão.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    await requirePermission(session, "user.delete");

    const { id } = await ctx.params;
    if (id === session.user.id) {
      return NextResponse.json(
        { error: "Você não pode excluir seu próprio usuário." },
        { status: 422 },
      );
    }

    const target = await getUserById(id);
    if (!target) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const ok = await deleteUser(id);
    if (!ok) {
      return NextResponse.json({ error: "Falha ao excluir usuário" }, { status: 500 });
    }
    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[DELETE /api/users/:id]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
