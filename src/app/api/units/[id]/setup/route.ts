import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getOrganizationById } from "@/db/repositories/organizations";
import { getUnitSetup, saveStep } from "@/db/repositories/unit-setup";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
} from "@/lib/auth/current-user";
import { saveStepBodySchema } from "@/lib/validations/unit-setup";

/**
 * Acesso ao setup da unidade está restrito a quem tem visibilidade dessa unidade:
 * - Matriz: qualquer unidade
 * - Membership direto ou regional: apenas as próprias
 */
async function requireUnitAccess(unitId: string) {
  const session = await requireAuth();
  const org = await getOrganizationById(unitId);
  if (!org) throw new ForbiddenError("Unidade não encontrada");
  if (org.type !== "unidade") {
    throw new ForbiddenError("Setup só se aplica a unidades, não à matriz");
  }

  const canSee =
    session.isMatrizUser ||
    session.availableOrganizations.some((o) => o.id === unitId);
  if (!canSee) throw new ForbiddenError("Sem acesso a esta unidade");

  return { session, org };
}

// GET /api/units/[id]/setup
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await requireUnitAccess(id);
    const setup = await getUnitSetup(id);
    return NextResponse.json({ data: setup });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[GET /api/units/[id]/setup]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

// PATCH /api/units/[id]/setup — salva um step
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await requireUnitAccess(id);
    const body = await req.json();
    const input = saveStepBodySchema.parse(body);
    const updated = await saveStep(id, input);
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
    console.error("[PATCH /api/units/[id]/setup]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
