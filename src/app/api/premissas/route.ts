import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { savePremissasBlock } from "@/db/repositories/premissas";
import {
  revalidateForecastTudo,
  revalidateForecastUnidade,
} from "@/lib/realizado/forecast-data";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import { premissaBlockBodySchema } from "@/lib/validations/premissas";

/**
 * PATCH /api/premissas — salva um bloco de premissa da entidade ativa.
 *
 * - actingMode "matriz": edita os defaults do modelo (linha da matriz).
 *   Exige permissão `premissas.update`.
 * - actingMode "unidade": personaliza as premissas da própria unidade.
 *
 * Patch granular por bloco (cada seção da tela salva o seu); lê o snapshot
 * atual e sobrescreve só o bloco enviado.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = premissaBlockBodySchema.parse(await req.json());

    let entidadeId: string;
    if (session.actingMode === "matriz") {
      await requirePermission(session, "premissas.update");
      const matriz = session.availableOrganizations.find((o) => o.type === "matriz");
      if (!matriz) throw new ForbiddenError("Matriz não encontrada na sessão");
      entidadeId = matriz.id;
    } else {
      const unidade = session.activeOrganization;
      if (!unidade || unidade.type !== "unidade") {
        throw new ForbiddenError("Sem unidade ativa para editar premissas");
      }
      // Premissas travadas na Matriz — a unidade nunca personaliza. Bloqueia no
      // servidor mesmo que a UI escape (essas seções já são só-leitura na unidade):
      // - tiersCliente: faixas de faturamento, TCV, CPL/CPMQL e o conjunto de tiers.
      // - distMercado: % de mercado por tier + grade de liberação por horizonte
      //   (a unidade só ajusta o split por horizonte, bloco distSplit).
      const BLOCOS_SO_MATRIZ = new Set(["tiersCliente", "distMercado"]);
      if (BLOCOS_SO_MATRIZ.has(body.block)) {
        throw new ForbiddenError(
          "Esta premissa é definida pela Matriz e não pode ser editada na unidade",
        );
      }
      entidadeId = unidade.id;
    }

    await savePremissasBlock(entidadeId, body);
    revalidatePath("/premissas");
    // Premissa da Matriz é herdada por unidades sem premissa própria → invalida
    // tudo; premissa de unidade → só a unidade (+ consolidado).
    if (session.actingMode === "matriz") revalidateForecastTudo();
    else revalidateForecastUnidade(entidadeId);
    return NextResponse.json({ ok: true });
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
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    console.error("[PATCH /api/premissas]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
