/**
 * Repository do setup inicial guiado da unidade — Fase 1B (Wizard /iniciar).
 *
 * Implementação Drizzle. Uma linha por organization na tabela `unit_setups`,
 * com cada step como coluna jsonb nullable. Quando o step ainda não foi salvo,
 * retornamos `null` na coluna e o caller cai pro default da Matriz.
 *
 * Constantes/tipos compartilhados com Client Components ficam em
 * `@/lib/unit-setup-types` — esse arquivo é server-only (importa o `db`).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { unitSetups } from "@/db/schema";
import {
  CONVERSAO_BLACK_BOX_DEFAULT,
  CONVERSAO_LEAD_BROKER_DEFAULT,
  CONVERSAO_MEETING_BROKER_DEFAULT,
  CONVERSAO_OUTBOUND_EVENTOS_DEFAULT,
  CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
  CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
  CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
  CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
  DIST_MERCADO_DEFAULT,
  HORIZONTE_CRESCIMENTO_DEFAULT,
  INVESTIMENTO_MIDIA_DEFAULT,
  METRICAS_OPERACIONAIS_DEFAULT,
  MIX_OUTBOUND_DEFAULT,
  RECEITA_PRODUTO_DEFAULT,
  REALIZADO_HISTORICO_DEFAULT,
  TIERS_CLIENTE_DEFAULT,
  TIME_COMERCIAL_DEFAULT,
  type DistMercado,
  type HorizonteCrescimento,
  type InvestimentoMidia,
  type MetricaOperacional,
  type MixOutboundHorizonte,
  type RealizadoMensal,
  type ReceitaProduto,
  type TierCliente,
  type TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";
import {
  SETUP_STEPS,
  type ConversoesInboundData,
  type ConversoesOutboundData,
  type SaveStepInput,
  type SetupStep,
  type UnitSetup,
} from "@/lib/unit-setup-types";

// Re-exports para callers existentes que importavam tudo daqui.
export {
  SETUP_STEPS,
  SETUP_STEP_LABEL,
  nextPendingStep,
} from "@/lib/unit-setup-types";
export type {
  ConversoesInboundData,
  ConversoesOutboundData,
  SaveStepInput,
  SetupStep,
  UnitSetup,
} from "@/lib/unit-setup-types";

const CONVERSOES_INBOUND_MATRIZ: ConversoesInboundData = {
  leadBroker: CONVERSAO_LEAD_BROKER_DEFAULT,
  blackBox: CONVERSAO_BLACK_BOX_DEFAULT,
  meetingBroker: CONVERSAO_MEETING_BROKER_DEFAULT,
};

const CONVERSOES_OUTBOUND_MATRIZ: ConversoesOutboundData = {
  indicacao: CONVERSAO_OUTBOUND_INDICACAO_DEFAULT,
  eventos: CONVERSAO_OUTBOUND_EVENTOS_DEFAULT,
  recovery: CONVERSAO_OUTBOUND_RECOVERY_DEFAULT,
  recomendacao: CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT,
  prospeccao: CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT,
};

function blankSetup(organizationId: string): UnitSetup {
  return {
    organizationId,
    completedSteps: [],
    completedAt: null,
    horizontes: null,
    timeComercial: null,
    metricasOperacionais: null,
    tiersCliente: null,
    receitaProduto: null,
    distMercado: null,
    investimentoMidia: null,
    conversoesInbound: null,
    conversoesOutbound: null,
    mixSubcanais: null,
    realizadoHistorico: null,
    updatedAt: new Date(),
  };
}

// Helper: tipa o jsonb de completedSteps pra SetupStep[] e filtra valores inválidos.
function asSetupSteps(raw: unknown): SetupStep[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(SETUP_STEPS);
  return raw.filter((s): s is SetupStep => typeof s === "string" && valid.has(s));
}

function rowToSetup(row: typeof unitSetups.$inferSelect): UnitSetup {
  return {
    organizationId: row.organizationId,
    completedSteps: asSetupSteps(row.completedSteps),
    completedAt: row.completedAt,
    horizontes: (row.horizontes as HorizonteCrescimento[] | null) ?? null,
    timeComercial: (row.timeComercial as TimeComercialMembro[] | null) ?? null,
    metricasOperacionais: (row.metricasOperacionais as MetricaOperacional[] | null) ?? null,
    tiersCliente: (row.tiersCliente as TierCliente[] | null) ?? null,
    receitaProduto: (row.receitaProduto as ReceitaProduto[] | null) ?? null,
    distMercado: (row.distMercado as DistMercado[] | null) ?? null,
    investimentoMidia: (row.investimentoMidia as InvestimentoMidia[] | null) ?? null,
    conversoesInbound: (row.conversoesInbound as ConversoesInboundData | null) ?? null,
    conversoesOutbound: (row.conversoesOutbound as ConversoesOutboundData | null) ?? null,
    mixSubcanais: (row.mixSubcanais as MixOutboundHorizonte[] | null) ?? null,
    realizadoHistorico: (row.realizadoHistorico as RealizadoMensal[] | null) ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function getUnitSetup(organizationId: string): Promise<UnitSetup> {
  const [row] = await db
    .select()
    .from(unitSetups)
    .where(eq(unitSetups.organizationId, organizationId))
    .limit(1);
  return row ? rowToSetup(row) : blankSetup(organizationId);
}

/**
 * Retorna dados efetivos de um step: o que a unidade salvou, ou (fallback)
 * defaults da Matriz se a unidade ainda não personalizou.
 */
export async function getStepValues(
  organizationId: string,
  step: SetupStep,
): Promise<{
  values: unknown;
  matrizDefault: unknown;
  fromMatriz: boolean;
}> {
  const setup = await getUnitSetup(organizationId);
  const matriz = matrizDefaultFor(step);

  switch (step) {
    case "horizontes": {
      const unit = setup.horizontes;
      return { values: unit ?? matriz, matrizDefault: matriz, fromMatriz: unit === null };
    }
    case "time-comercial": {
      const unit = setup.timeComercial;
      return { values: unit ?? matriz, matrizDefault: matriz, fromMatriz: unit === null };
    }
    case "metricas-operacionais": {
      const unit = setup.metricasOperacionais;
      return { values: unit ?? matriz, matrizDefault: matriz, fromMatriz: unit === null };
    }
    case "tiers-receita": {
      const unitTiers = setup.tiersCliente;
      const unitReceita = setup.receitaProduto;
      const fallbackTiers = unitTiers ?? TIERS_CLIENTE_DEFAULT;
      const fallbackReceita = unitReceita ?? RECEITA_PRODUTO_DEFAULT;
      return {
        values: { tiers: fallbackTiers, produtos: fallbackReceita },
        matrizDefault: { tiers: TIERS_CLIENTE_DEFAULT, produtos: RECEITA_PRODUTO_DEFAULT },
        fromMatriz: unitTiers === null && unitReceita === null,
      };
    }
    case "leads-investimento": {
      const unitDist = setup.distMercado;
      const unitInv = setup.investimentoMidia;
      const fallbackDist = unitDist ?? DIST_MERCADO_DEFAULT;
      const fallbackInv = unitInv ?? INVESTIMENTO_MIDIA_DEFAULT;
      return {
        values: { distMercado: fallbackDist, investimentoMidia: fallbackInv },
        matrizDefault: {
          distMercado: DIST_MERCADO_DEFAULT,
          investimentoMidia: INVESTIMENTO_MIDIA_DEFAULT,
        },
        fromMatriz: unitDist === null && unitInv === null,
      };
    }
    case "conversoes-inbound": {
      const unit = setup.conversoesInbound;
      return {
        values: unit ?? CONVERSOES_INBOUND_MATRIZ,
        matrizDefault: CONVERSOES_INBOUND_MATRIZ,
        fromMatriz: unit === null,
      };
    }
    case "conversoes-outbound": {
      const unit = setup.conversoesOutbound;
      return {
        values: unit ?? CONVERSOES_OUTBOUND_MATRIZ,
        matrizDefault: CONVERSOES_OUTBOUND_MATRIZ,
        fromMatriz: unit === null,
      };
    }
    case "mix-subcanais": {
      const unit = setup.mixSubcanais;
      return {
        values: unit ?? MIX_OUTBOUND_DEFAULT,
        matrizDefault: MIX_OUTBOUND_DEFAULT,
        fromMatriz: unit === null,
      };
    }
    case "realizado-historico": {
      const unit = setup.realizadoHistorico;
      return {
        values: unit ?? REALIZADO_HISTORICO_DEFAULT,
        matrizDefault: REALIZADO_HISTORICO_DEFAULT,
        fromMatriz: unit === null,
      };
    }
  }
}

function matrizDefaultFor(step: SetupStep): unknown {
  switch (step) {
    case "horizontes":
      return HORIZONTE_CRESCIMENTO_DEFAULT;
    case "time-comercial":
      return TIME_COMERCIAL_DEFAULT;
    case "metricas-operacionais":
      return METRICAS_OPERACIONAIS_DEFAULT;
    case "tiers-receita":
      return { tiers: TIERS_CLIENTE_DEFAULT, produtos: RECEITA_PRODUTO_DEFAULT };
    case "leads-investimento":
      return {
        distMercado: DIST_MERCADO_DEFAULT,
        investimentoMidia: INVESTIMENTO_MIDIA_DEFAULT,
      };
    case "conversoes-inbound":
      return CONVERSOES_INBOUND_MATRIZ;
    case "conversoes-outbound":
      return CONVERSOES_OUTBOUND_MATRIZ;
    case "mix-subcanais":
      return MIX_OUTBOUND_DEFAULT;
    case "realizado-historico":
      return REALIZADO_HISTORICO_DEFAULT;
  }
}

export async function saveStep(
  organizationId: string,
  input: SaveStepInput,
): Promise<UnitSetup> {
  const existing = await getUnitSetup(organizationId);
  const now = new Date();

  const stepPatch: Partial<typeof unitSetups.$inferInsert> = {};
  switch (input.step) {
    case "horizontes":
      stepPatch.horizontes = input.data;
      break;
    case "time-comercial":
      stepPatch.timeComercial = input.data;
      break;
    case "metricas-operacionais":
      stepPatch.metricasOperacionais = input.data;
      break;
    case "tiers-receita":
      stepPatch.tiersCliente = input.data.tiers;
      stepPatch.receitaProduto = input.data.produtos;
      break;
    case "leads-investimento":
      stepPatch.distMercado = input.data.distMercado;
      stepPatch.investimentoMidia = input.data.investimentoMidia;
      break;
    case "conversoes-inbound":
      stepPatch.conversoesInbound = input.data;
      break;
    case "conversoes-outbound":
      stepPatch.conversoesOutbound = input.data;
      break;
    case "mix-subcanais":
      stepPatch.mixSubcanais = input.data;
      break;
    case "realizado-historico":
      stepPatch.realizadoHistorico = input.data;
      break;
  }

  const completedSteps = existing.completedSteps.includes(input.step)
    ? existing.completedSteps
    : [...existing.completedSteps, input.step];

  const completedAt =
    SETUP_STEPS.every((s) => completedSteps.includes(s)) && existing.completedAt === null
      ? now
      : existing.completedAt;

  // UPSERT por PK (organizationId).
  const [row] = await db
    .insert(unitSetups)
    .values({
      organizationId,
      completedSteps,
      completedAt,
      updatedAt: now,
      ...stepPatch,
    })
    .onConflictDoUpdate({
      target: unitSetups.organizationId,
      set: {
        completedSteps,
        completedAt,
        updatedAt: now,
        ...stepPatch,
      },
    })
    .returning();

  return rowToSetup(row!);
}
