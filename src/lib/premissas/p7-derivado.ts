import type {
  DistMercado,
  Horizonte,
  TierCliente,
} from "@/lib/premissas/matriz-defaults";

export const HORIZONTES_ORDEM: Horizonte[] = ["H1", "H2", "H3", "H4", "H5"];

function horizonteIndex(h: Horizonte): number {
  return HORIZONTES_ORDEM.indexOf(h);
}

/** Tier está ativo no horizonte se já entrou em algum horizonte ≤ atual. */
function tierAtivo(entra: Horizonte, atual: Horizonte): boolean {
  return horizonteIndex(entra) <= horizonteIndex(atual);
}

export type LinhaP7 = {
  h: Horizonte;
  /** CPL Lead Broker ponderado pela participação dos tiers ativos no horizonte. */
  cplLbPond: number;
  /**
   * TCV médio (Produto Comercial) ponderado pelos tiers ativos. Usa `tcvProdCom`
   * por convenção do modelo — `tcvBooking` é a meta de venda inbound, não o
   * ticket médio que entra no cálculo de unit economics.
   */
  tcvMedPond: number;
};

/**
 * P7 — médias ponderadas por horizonte. Em cada horizonte, considera apenas os
 * tiers já ativos (entraHorizonte ≤ H). Pondera por `pctMercado` de P4 sobre
 * o subconjunto ativo.
 *
 *   CPL_LB_pond[H]  = Σ(pctMercado_tier × cplLb_tier)      / Σ pctMercado_tier
 *   TCV_med_pond[H] = Σ(pctMercado_tier × tcvProdCom_tier) / Σ pctMercado_tier
 *
 * Retorna uma linha por horizonte na ordem H1..H5.
 */
export function calcularP7(
  dist: DistMercado[],
  tiers: TierCliente[],
): LinhaP7[] {
  const tierByName = new Map(tiers.map((t) => [t.tier, t] as const));

  return HORIZONTES_ORDEM.map((h) => {
    const ativos = dist.filter(
      (d) => tierAtivo(d.entraHorizonte, h) && tierByName.has(d.tier),
    );
    const totalPct = ativos.reduce((acc, d) => acc + d.pctMercado, 0);
    if (totalPct <= 0) {
      return { h, cplLbPond: 0, tcvMedPond: 0 };
    }
    let somaCpl = 0;
    let somaTcv = 0;
    for (const d of ativos) {
      const t = tierByName.get(d.tier);
      if (!t) continue;
      somaCpl += d.pctMercado * t.cplLb;
      somaTcv += d.pctMercado * t.tcvProdCom;
    }
    return {
      h,
      cplLbPond: Math.round(somaCpl / totalPct),
      tcvMedPond: Math.round(somaTcv / totalPct),
    };
  });
}
