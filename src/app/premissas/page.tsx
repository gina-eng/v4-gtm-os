import { requireAuth } from "@/lib/auth/current-user";
import { getUnitSetup } from "@/db/repositories/unit-setup";
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
): Promise<{ investido: number; won: number; unidades: number } | null> {
  if (unitIds.length === 0) return null;

  let investido = 0;
  let won = 0;
  let temDado = false;
  for (const id of unitIds) {
    const setup = await getUnitSetup(id);
    const linha = setup.realizadoHistorico?.find((r) => r.mes === ULTIMO_MES_FECHADO);
    if (!linha) continue;
    if (linha.investido > 0 || linha.won > 0) temDado = true;
    investido += linha.investido;
    won += linha.won;
  }
  if (!temDado) return null;
  return { investido, won, unidades: isMatriz ? unitIds.length : 1 };
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

  return <PremissasClient cacContext={cacContext} />;
}
