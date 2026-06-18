import { requireAuth } from "@/lib/auth/current-user";
import { getUnitSetupsByOrgIds } from "@/db/repositories/unit-setup";
import {
  getPremissas,
  matrizDefaultBlocks,
  type PremissasBlocks,
} from "@/db/repositories/premissas";
import { PremissasClient } from "@/components/premissas/premissas-client";
import { ULTIMO_MES_FECHADO } from "@/lib/realizado/projecao";

export const metadata = {
  title: "Premissas do Modelo · V4 GTM OS",
};

export const dynamic = "force-dynamic";

/**
 * Lê o realizado do último mês fechado para alimentar o CAC dinâmico.
 *
 * - Modo unidade: pega `investido` e `won` da própria unidade ativa.
 * - Modo matriz: soma os mesmos campos de todas as unidades visíveis.
 *
 * Retorna `null` quando não há dado preenchido — o componente sabe lidar e
 * mostra um aviso "preencha o realizado pra ver o CAC".
 */
async function loadCacContext(
  isMatriz: boolean,
  unitIds: string[],
): Promise<{ investido: number; won: number; faturamento: number; unidades: number } | null> {
  if (unitIds.length === 0) return null;

  const setups = await getUnitSetupsByOrgIds(unitIds);
  let investido = 0;
  let won = 0;
  let faturamento = 0;
  let temDado = false;
  for (const setup of setups) {
    const linha = setup.realizadoHistorico?.find((r) => r.mes === ULTIMO_MES_FECHADO);
    if (!linha) continue;
    // CAC realizado só aparece com investido REAL (>0). Hoje o realizado vem do
    // extrato derivado com investido=0 (invest por unidade ainda não chega), então
    // o CAC fica oculto em vez de mostrar R$0 falso. Volta quando o invest chegar.
    if (linha.investido > 0) temDado = true;
    investido += linha.investido;
    won += linha.won;
    faturamento += linha.faturamento;
  }
  if (!temDado) return null;
  return { investido, won, faturamento, unidades: isMatriz ? unitIds.length : 1 };
}

export default async function PremissasPage() {
  const session = await requireAuth();
  const isMatriz = session.actingMode === "matriz";

  const unitIds = isMatriz
    ? session.availableOrganizations
        .filter((o) => o.type === "unidade")
        .map((o) => o.id)
    : session.activeOrganization && session.activeOrganization.type === "unidade"
      ? [session.activeOrganization.id]
      : [];

  const cacContext = await loadCacContext(isMatriz, unitIds);

  // Entidade editada na tela: matriz (modo matriz) ou a unidade ativa. Carrega
  // o snapshot atual de premissas pra alimentar as seções (fallback: defaults
  // da matriz, caso a entidade ainda não tenha linha).
  const entidadeId = isMatriz
    ? (session.availableOrganizations.find((o) => o.type === "matriz")?.id ?? null)
    : (session.activeOrganization?.id ?? null);

  const blocks: PremissasBlocks =
    (entidadeId ? await getPremissas(entidadeId) : null) ?? matrizDefaultBlocks();

  return <PremissasClient cacContext={cacContext} blocks={blocks} />;
}
