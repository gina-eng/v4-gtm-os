import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { getOrganizationById } from "@/db/repositories/organizations";
import {
  upsertRealizadoFunilCelula,
  isCelulaValida,
} from "@/db/repositories/realizado-funil";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
} from "@/lib/auth/current-user";
import { SUB_CANAIS } from "@/lib/premissas/funil-reverso";
import { MESES_ANO_2026 } from "@/lib/realizado/projecao";

const MESES_SET = new Set(MESES_ANO_2026 as readonly string[]);
const SUBCANAL_SET = new Set(SUB_CANAIS.map((s) => s.key));
const TIER_SET = new Set(["Tiny", "Small", "Medium", "Large", "Enterprise"]);

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  mes: z.string().refine((v) => MESES_SET.has(v), {
    message: "mes precisa ser um dos 12 meses de 2026 (ex.: '2026-05')",
  }),
  subcanal: z.string().refine((v) => SUBCANAL_SET.has(v as never), {
    message: "subcanal precisa ser uma chave de SUB_CANAIS",
  }),
  tier: z.string().refine((v) => TIER_SET.has(v), {
    message: "tier inválido",
  }),
  leads: z.number().min(0),
  mql: z.number().min(0),
  sql: z.number().min(0),
  sal: z.number().min(0),
  won: z.number().min(0),
  faturamento: z.number().min(0),
});

/**
 * POST /api/bowtie — upsert de uma célula do realizado bowtie da unidade.
 *
 * Permissão: matriz vê /bowtie consolidado mas não edita; só usuários com
 * acesso à própria unidade podem gravar. Célula zerada deleta a linha.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const input = bodySchema.parse(await req.json());

    const org = await getOrganizationById(input.organizationId);
    if (!org) throw new ForbiddenError("Unidade não encontrada");
    if (org.type !== "unidade") {
      throw new ForbiddenError("Realizado bowtie só se aplica a unidades");
    }
    const canEdit =
      session.actingMode === "unidade" &&
      session.activeOrganization?.id === input.organizationId;
    if (!canEdit) {
      throw new ForbiddenError("Sem acesso a esta unidade no modo atual");
    }
    if (!isCelulaValida(input)) {
      throw new ForbiddenError("Combinação de mes/subcanal/tier inválida");
    }

    await upsertRealizadoFunilCelula(input.organizationId, {
      mes: input.mes,
      subcanal: input.subcanal,
      tier: input.tier,
      leads: input.leads,
      mql: input.mql,
      sql: input.sql,
      sal: input.sal,
      won: input.won,
      faturamento: input.faturamento,
    });
    revalidatePath("/bowtie");
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
    console.error("[POST /api/bowtie]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
