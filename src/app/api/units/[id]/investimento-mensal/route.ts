import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getOrganizationById } from "@/db/repositories/organizations";
import { savePremissasBlock } from "@/db/repositories/premissas";
import { revalidateForecastUnidade } from "@/lib/realizado/forecast-data";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
} from "@/lib/auth/current-user";
import { MESES_ANO_2026 } from "@/lib/realizado/projecao";

const MESES_SET = new Set(MESES_ANO_2026 as readonly string[]);

const bodySchema = z.object({
  investimentoMensal: z
    .array(
      z.object({
        mes: z.string().refine((v) => MESES_SET.has(v), {
          message: "mes precisa ser um dos 12 meses de 2026 (ex.: '2026-03')",
        }),
        investimento: z.number().min(0),
      }),
    )
    .max(12),
});

async function requireUnitAccess(unitId: string) {
  const session = await requireAuth();
  const org = await getOrganizationById(unitId);
  if (!org) throw new ForbiddenError("Unidade não encontrada");
  if (org.type !== "unidade") {
    throw new ForbiddenError("Override mensal só se aplica a unidades");
  }
  const canSee =
    session.isMatrizUser ||
    session.availableOrganizations.some((o) => o.id === unitId);
  if (!canSee) throw new ForbiddenError("Sem acesso a esta unidade");
  return { session, org };
}

// PATCH /api/units/[id]/investimento-mensal — substitui (replace-set) o array
// de override mensal de investimento em mídia da unidade.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await requireUnitAccess(id);
    const input = bodySchema.parse(await req.json());

    // Deduplica por mês — garante consistência com o índice unique no banco.
    const seen = new Map<string, number>();
    for (const r of input.investimentoMensal) seen.set(r.mes, r.investimento);
    const data = Array.from(seen, ([mes, investimento]) => ({ mes, investimento }));

    await savePremissasBlock(id, { block: "investimentoMensal", data });
    revalidateForecastUnidade(id);
    return NextResponse.json({ ok: true });
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
    console.error("[PATCH /api/units/[id]/investimento-mensal]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
