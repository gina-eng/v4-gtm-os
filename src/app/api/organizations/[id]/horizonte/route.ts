import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getOrganizationById, updateOrganization } from "@/db/repositories/organizations";
import { getPremissas, matrizDefaultBlocks } from "@/db/repositories/premissas";
import { getUnitSetup } from "@/db/repositories/unit-setup";
import { writeAuditLog } from "@/db/repositories/audit";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import { detectarStatusHorizonte } from "@/lib/realizado/promocao";

type Params = { id: string };

const bodySchema = z.object({
  horizonte: z.enum(["H1", "H2", "H3", "H4", "H5"]),
});

/**
 * Aprova a mudança de horizonte de uma unidade (promoção ou rebaixamento)
 * sinalizada na tela /validacao-crescimento. Só matriz admin. Revalida o
 * sinal no servidor antes de gravar — o alvo enviado precisa bater com o que o
 * detector recomputa agora (evita mudança arbitrária e cobre dado defasado).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    await requirePermission(session, "organization.update", id);

    // Aprovação de horizonte é ação exclusiva da matriz.
    if (!session.isMatrizUser || session.actingMode !== "matriz") {
      throw new ForbiddenError("Apenas a matriz pode aprovar mudança de horizonte.");
    }

    const { horizonte } = bodySchema.parse(await req.json());

    const org = await getOrganizationById(id);
    if (!org || org.type !== "unidade") {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
    }

    // Revalida o sinal com os dados atuais da unidade.
    const blocks = (await getPremissas(id)) ?? matrizDefaultBlocks();
    const setup = await getUnitSetup(id);
    const realizado = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    const status = detectarStatusHorizonte(realizado, blocks.horizontes, org.horizonteAtual, {
      dataInicio: org.dataInicio,
    });

    if (status.status === "estavel" || status.horizonteSugerido !== horizonte) {
      return NextResponse.json(
        {
          error:
            "O sinal de horizonte mudou desde o carregamento da tela. Recarregue e tente novamente.",
          atual: org.horizonteAtual,
          sugerido: status.horizonteSugerido,
        },
        { status: 409 },
      );
    }

    const de = org.horizonteAtual;
    const updated = await updateOrganization(id, { horizonteAtual: horizonte });
    if (!updated) {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
    }

    await writeAuditLog({
      actorUserId: session.user.id,
      organizationId: id,
      action: status.status === "promover" ? "horizonte.promover" : "horizonte.rebaixar",
      entity: "organization",
      entityId: id,
      changes: { de, para: horizonte },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: err.issues }, { status: 400 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON inválido no corpo da requisição" }, { status: 400 });
    }
    console.error("[POST /api/organizations/:id/horizonte]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
