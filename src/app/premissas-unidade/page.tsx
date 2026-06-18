import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import {
  getMatrizBlocks,
  getTimeCapacidadeSetup,
  getUnitSetup,
  SETUP_STEPS,
} from "@/db/repositories/unit-setup";
import {
  getPremissas,
  matrizDefaultBlocks,
  type PremissasBlocks,
} from "@/db/repositories/premissas";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import { calcularRampUp } from "@/lib/premissas/funil-reverso";
import { ULTIMO_MES_FECHADO } from "@/lib/realizado/projecao";
import { PremissasUnidadeClient } from "@/components/premissas/premissas-unidade-client";

export const metadata = {
  title: "Premissas da Unidade · V4 GTM OS",
};

export const dynamic = "force-dynamic";

/**
 * Visão consolidada (só-leitura) do setup da unidade.
 *
 * Surfacia, num item próprio do menu, tudo que a unidade preencheu no wizard
 * (/iniciar) — antes só acessível clicando passo a passo. Específica da unidade:
 * sem unidade ativa (ex.: matriz consolidada), volta pra home.
 */
export default async function PremissasUnidadePage() {
  const session = await requireAuth();
  const org = session.activeOrganization;
  if (!org || org.type !== "unidade") redirect("/");

  const [setup, blocksRaw, timeCap, matrizBlocks] = await Promise.all([
    getUnitSetup(org.id),
    getPremissas(org.id),
    getTimeCapacidadeSetup(org.id),
    getMatrizBlocks(),
  ]);
  const blocks: PremissasBlocks = blocksRaw ?? matrizDefaultBlocks();

  // Ramp-up do forecast da unidade — base da comissão por produção na aba
  // Time & Capacidade. Mesma chamada do /time-comercial pra que as duas telas
  // batam exatamente.
  const linhasRampUp = calcularRampUp(blocks, org.horizonteAtual, {
    realizadoHistorico: setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT,
    dataInicio: org.dataInicio,
  });

  // CAC dinâmico: investido/won do último mês fechado da própria unidade
  // (mesma regra de /premissas, mas sem somar rede — aqui é uma unidade só).
  const linha = setup.realizadoHistorico?.find((r) => r.mes === ULTIMO_MES_FECHADO);
  // CAC realizado só com investido REAL (>0); hoje o derivado vem com investido=0
  // (invest por unidade ainda não chega) → CAC oculto em vez de R$0 falso.
  const cacContext =
    linha && linha.investido > 0
      ? { investido: linha.investido, won: linha.won, faturamento: linha.faturamento, unidades: 1 }
      : null;

  return (
    <PremissasUnidadeClient
      unitName={org.name}
      organizationId={org.id}
      horizonteAtual={org.horizonteAtual}
      dataInicio={org.dataInicio}
      blocks={blocks}
      cacContext={cacContext}
      investimentoMidiaMatriz={matrizBlocks.investimentoMidia}
      linhasRampUp={linhasRampUp}
      team={timeCap.team}
      metrics={timeCap.metrics}
      metricsMatriz={timeCap.metricsMatriz}
      realizadoHistorico={setup.realizadoHistorico ?? []}
      completedSteps={setup.completedSteps}
      totalSteps={SETUP_STEPS.length}
      completedAt={setup.completedAt ? setup.completedAt.toISOString() : null}
    />
  );
}
