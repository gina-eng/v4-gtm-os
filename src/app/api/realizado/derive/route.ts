import { NextResponse } from "next/server";
import { deriveRealizadoFunil } from "@/lib/realizado/derive";
import { revalidateForecastTudo } from "@/lib/realizado/forecast-data";

/**
 * GET /api/realizado/derive
 *
 * Re-deriva `realizado_funil` a partir das landings cruas (realizado_import_lead
 * + realizado_import_investimento). Disparado pelo Vercel Cron de hora em hora
 * (ver vercel.json) — é a versão automática do `npm run derive:realizado`.
 *
 * Protegido por CRON_SECRET: o Vercel Cron injeta `Authorization: Bearer <secret>`
 * quando a env var CRON_SECRET existe. Sem o segredo correto → 401.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O derive lê o extrato inteiro e regrava por unidade — pode passar dos 10s
// default. 300s é o teto do plano Pro (no Hobby o teto é 60s).
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado no ambiente" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await deriveRealizadoFunil();
    // O realizado_funil agora alimenta o forecast (cacheado por tags). Sem isto o
    // /realizado/home/bowtie mostrariam realizado velho até outra edição/virada de mês.
    revalidateForecastTudo();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[derive] falhou:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
