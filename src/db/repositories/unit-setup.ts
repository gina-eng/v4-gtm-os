/**
 * Repository do setup inicial guiado da unidade — Fase 1B (Wizard /iniciar).
 *
 * Fase 2: os blocos de premissa migraram para a estrutura normalizada em
 * `src/db/repositories/premissas.ts` (tabela `premissas` + filhas). Aqui a
 * `unit_setups` guarda só o que NÃO é premissa: progresso do wizard
 * (`completedSteps`/`completedAt`) e o `realizadoHistorico`.
 *
 * O contrato público (getUnitSetup, getUnitSetupsByOrgIds, getStepValues,
 * saveStep e o tipo UnitSetup) é preservado: cada bloco continua sendo exposto
 * como antes, montado a partir das duas fontes. "Herdado da matriz vs. próprio"
 * é decidido pelo `completedSteps` — se a unidade salvou o step, mostramos o
 * valor dela; senão, cai no default da Matriz (agora vindo do banco).
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { unitSetups, organizations } from "@/db/schema";
import {
  applyStepToBlocks,
  getPremissas,
  getPremissasByEntityIds,
  matrizDefaultBlocks,
  savePremissas,
  type PremissasBlocks,
} from "@/db/repositories/premissas";
import type { RealizadoMensal } from "@/lib/premissas/matriz-defaults";
import {
  SETUP_STEPS,
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

// Mapeia cada step → quais blocos ele "possui" (pra herança). realizado-historico
// não é bloco de premissa; mora no jsonb da unit_setups.
function ownsHorizontes(steps: SetupStep[]) { return steps.includes("horizontes"); }
function ownsTimeComercial(steps: SetupStep[]) { return steps.includes("time-comercial"); }
function ownsMetricas(steps: SetupStep[]) { return steps.includes("metricas-operacionais"); }
function ownsTiersReceita(steps: SetupStep[]) { return steps.includes("tiers-receita"); }
function ownsLeadsInvest(steps: SetupStep[]) { return steps.includes("leads-investimento"); }
function ownsConvInbound(steps: SetupStep[]) { return steps.includes("conversoes-inbound"); }
function ownsConvOutbound(steps: SetupStep[]) { return steps.includes("conversoes-outbound"); }
function ownsMix(steps: SetupStep[]) { return steps.includes("mix-subcanais"); }

function asSetupSteps(raw: unknown): SetupStep[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(SETUP_STEPS);
  return raw.filter((s): s is SetupStep => typeof s === "string" && valid.has(s));
}

type SetupMeta = {
  completedSteps: SetupStep[];
  completedAt: Date | null;
  realizadoHistorico: RealizadoMensal[] | null;
  updatedAt: Date;
};

function blankMeta(): SetupMeta {
  return { completedSteps: [], completedAt: null, realizadoHistorico: null, updatedAt: new Date() };
}

/** Monta o UnitSetup expondo cada bloco só se a unidade "possui" o step. */
function assemble(
  organizationId: string,
  meta: SetupMeta,
  blocks: PremissasBlocks | null,
): UnitSetup {
  const s = meta.completedSteps;
  return {
    organizationId,
    completedSteps: s,
    completedAt: meta.completedAt,
    horizontes: ownsHorizontes(s) ? blocks?.horizontes ?? null : null,
    timeComercial: ownsTimeComercial(s) ? blocks?.timeComercial ?? null : null,
    metricasOperacionais: ownsMetricas(s) ? blocks?.metricasOperacionais ?? null : null,
    tiersCliente: ownsTiersReceita(s) ? blocks?.tiersCliente ?? null : null,
    receitaProduto: ownsTiersReceita(s) ? blocks?.receitaProduto ?? null : null,
    distMercado: ownsLeadsInvest(s) ? blocks?.distMercado ?? null : null,
    investimentoMidia: ownsLeadsInvest(s) ? blocks?.investimentoMidia ?? null : null,
    conversoesInbound: ownsConvInbound(s) ? blocks?.conversoesInbound ?? null : null,
    conversoesOutbound: ownsConvOutbound(s) ? blocks?.conversoesOutbound ?? null : null,
    mixSubcanais: ownsMix(s) ? blocks?.mixSubcanais ?? null : null,
    realizadoHistorico: meta.realizadoHistorico,
    updatedAt: meta.updatedAt,
  };
}

async function readMeta(organizationId: string): Promise<SetupMeta> {
  const [row] = await db
    .select()
    .from(unitSetups)
    .where(eq(unitSetups.organizationId, organizationId))
    .limit(1);
  if (!row) return blankMeta();
  return {
    completedSteps: asSetupSteps(row.completedSteps),
    completedAt: row.completedAt,
    realizadoHistorico: (row.realizadoHistorico as RealizadoMensal[] | null) ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function getUnitSetup(organizationId: string): Promise<UnitSetup> {
  const [meta, blocks] = await Promise.all([
    readMeta(organizationId),
    getPremissas(organizationId),
  ]);
  return assemble(organizationId, meta, blocks);
}

/**
 * Batch: evita N+1 nas telas consolidadas da Matriz. Mantém a semântica do
 * `getUnitSetup` — orgs sem dado recebem blocos null. A ordem espelha `ids`.
 */
export async function getUnitSetupsByOrgIds(ids: string[]): Promise<UnitSetup[]> {
  if (ids.length === 0) return [];
  const [rows, blocksById] = await Promise.all([
    db.select().from(unitSetups).where(inArray(unitSetups.organizationId, ids)),
    getPremissasByEntityIds(ids),
  ]);
  const metaById = new Map<string, SetupMeta>(
    rows.map((r) => [
      r.organizationId,
      {
        completedSteps: asSetupSteps(r.completedSteps),
        completedAt: r.completedAt,
        realizadoHistorico: (r.realizadoHistorico as RealizadoMensal[] | null) ?? null,
        updatedAt: r.updatedAt,
      },
    ]),
  );
  return ids.map((id) =>
    assemble(id, metaById.get(id) ?? blankMeta(), blocksById.get(id) ?? null),
  );
}

/**
 * Loader enxuto: só o `realizadoHistorico` de uma org (1 query, sem montar
 * premissas). Para as telas de forecast que precisam apenas do realizado pra
 * alimentar o motor — evita o custo de `getUnitSetup` carregar todos os blocos.
 */
export async function getRealizado(organizationId: string): Promise<RealizadoMensal[] | null> {
  const [row] = await db
    .select({ realizadoHistorico: unitSetups.realizadoHistorico })
    .from(unitSetups)
    .where(eq(unitSetups.organizationId, organizationId))
    .limit(1);
  return (row?.realizadoHistorico as RealizadoMensal[] | null) ?? null;
}

/** Batch do realizado por org — 1 query, sem premissas (ver `getRealizado`). */
export async function getRealizadoByOrgIds(
  ids: string[],
): Promise<Map<string, RealizadoMensal[]>> {
  const result = new Map<string, RealizadoMensal[]>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      organizationId: unitSetups.organizationId,
      realizadoHistorico: unitSetups.realizadoHistorico,
    })
    .from(unitSetups)
    .where(inArray(unitSetups.organizationId, ids));
  for (const r of rows) {
    const rh = r.realizadoHistorico as RealizadoMensal[] | null;
    if (rh) result.set(r.organizationId, rh);
  }
  return result;
}

// ============================================================
// Defaults da Matriz (fallback) — agora vindos do banco
// ============================================================

/**
 * Blocos da Matriz pra usar como fallback. Lê a linha de premissas da matriz
 * (editável em /premissas); se ainda não foi semeada, cai nos defaults
 * hardcoded de matriz-defaults.ts.
 */
async function getMatrizBlocks(): Promise<PremissasBlocks> {
  const [matriz] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.type, "matriz"))
    .limit(1);
  if (!matriz) return matrizDefaultBlocks();
  const blocks = await getPremissas(matriz.id);
  return blocks ?? matrizDefaultBlocks();
}

/**
 * Retorna dados efetivos de um step: o que a unidade salvou, ou (fallback) os
 * defaults da Matriz se ainda não personalizou.
 */
export async function getStepValues(
  organizationId: string,
  step: SetupStep,
): Promise<{ values: unknown; matrizDefault: unknown; fromMatriz: boolean }> {
  const [setup, matriz] = await Promise.all([
    getUnitSetup(organizationId),
    getMatrizBlocks(),
  ]);

  switch (step) {
    case "horizontes": {
      const unit = setup.horizontes;
      return { values: unit ?? matriz.horizontes, matrizDefault: matriz.horizontes, fromMatriz: unit === null };
    }
    case "time-comercial": {
      const unit = setup.timeComercial;
      return { values: unit ?? matriz.timeComercial, matrizDefault: matriz.timeComercial, fromMatriz: unit === null };
    }
    case "metricas-operacionais": {
      const unit = setup.metricasOperacionais;
      return { values: unit ?? matriz.metricasOperacionais, matrizDefault: matriz.metricasOperacionais, fromMatriz: unit === null };
    }
    case "tiers-receita": {
      const unitTiers = setup.tiersCliente;
      const unitReceita = setup.receitaProduto;
      const matrizValue = { tiers: matriz.tiersCliente, produtos: matriz.receitaProduto };
      return {
        values: { tiers: unitTiers ?? matriz.tiersCliente, produtos: unitReceita ?? matriz.receitaProduto },
        matrizDefault: matrizValue,
        fromMatriz: unitTiers === null && unitReceita === null,
      };
    }
    case "leads-investimento": {
      const unitDist = setup.distMercado;
      const unitInv = setup.investimentoMidia;
      const matrizValue = { distMercado: matriz.distMercado, investimentoMidia: matriz.investimentoMidia };
      return {
        values: { distMercado: unitDist ?? matriz.distMercado, investimentoMidia: unitInv ?? matriz.investimentoMidia },
        matrizDefault: matrizValue,
        fromMatriz: unitDist === null && unitInv === null,
      };
    }
    case "conversoes-inbound": {
      const unit = setup.conversoesInbound;
      return { values: unit ?? matriz.conversoesInbound, matrizDefault: matriz.conversoesInbound, fromMatriz: unit === null };
    }
    case "conversoes-outbound": {
      const unit = setup.conversoesOutbound;
      return { values: unit ?? matriz.conversoesOutbound, matrizDefault: matriz.conversoesOutbound, fromMatriz: unit === null };
    }
    case "mix-subcanais": {
      const unit = setup.mixSubcanais;
      return { values: unit ?? matriz.mixSubcanais, matrizDefault: matriz.mixSubcanais, fromMatriz: unit === null };
    }
    case "realizado-historico": {
      const unit = setup.realizadoHistorico;
      const matrizDefault: RealizadoMensal[] = [];
      return { values: unit ?? matrizDefault, matrizDefault, fromMatriz: unit === null };
    }
  }
}

// ============================================================
// Escrita
// ============================================================

export async function saveStep(
  organizationId: string,
  input: SaveStepInput,
): Promise<UnitSetup> {
  const now = new Date();
  const meta = await readMeta(organizationId);

  // Persistência das premissas (todos os steps menos realizado-historico).
  if (input.step !== "realizado-historico") {
    const stored = await getPremissas(organizationId);
    const base = stored ?? (await getMatrizBlocks());
    const patched = applyStepToBlocks(base, input);
    await savePremissas(organizationId, patched);
  }

  const completedSteps = meta.completedSteps.includes(input.step)
    ? meta.completedSteps
    : [...meta.completedSteps, input.step];

  const completedAt =
    SETUP_STEPS.every((s) => completedSteps.includes(s)) && meta.completedAt === null
      ? now
      : meta.completedAt;

  const setRealizado =
    input.step === "realizado-historico" ? { realizadoHistorico: input.data } : {};

  // UPSERT do meta por PK (organizationId). Premissas já foram gravadas acima.
  await db
    .insert(unitSetups)
    .values({
      organizationId,
      completedSteps,
      completedAt,
      updatedAt: now,
      ...setRealizado,
    })
    .onConflictDoUpdate({
      target: unitSetups.organizationId,
      set: { completedSteps, completedAt, updatedAt: now, ...setRealizado },
    });

  return getUnitSetup(organizationId);
}
