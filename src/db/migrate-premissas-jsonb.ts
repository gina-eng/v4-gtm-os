// .env.local é carregado via `tsx --env-file=.env.local` (igual ao seed).
//
// Migração de dados one-off: lê os blocos jsonb de premissa que ficavam em
// `unit_setups` e os reescreve na estrutura normalizada (`premissas` + filhas),
// uma linha por organização que tinha algum bloco preenchido.
//
// Uso: `npx tsx --env-file=.env.local src/db/migrate-premissas-jsonb.ts`
//
// Idempotente: `savePremissas` faz replace-set por entidade, então re-rodar
// não duplica. Só migra orgs com pelo menos um bloco != null; orgs em branco
// continuam herdando da matriz (como antes).

import { db } from "./index";
import { unitSetups } from "./schema";
import { matrizDefaultBlocks, savePremissas, type PremissasBlocks } from "./repositories/premissas";
import type {
  ConversoesInboundData,
  ConversoesOutboundData,
} from "@/lib/unit-setup-types";
import type {
  DistMercado,
  HorizonteCrescimento,
  InvestimentoMidia,
  MetricaOperacional,
  MixOutboundHorizonte,
  ReceitaProduto,
  TierCliente,
  TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";

async function main() {
  console.log("[migrate-premissas] lendo unit_setups…");
  const rows = await db.select().from(unitSetups);

  let migrated = 0;
  for (const row of rows) {
    const blocosPreenchidos =
      row.horizontes ||
      row.timeComercial ||
      row.metricasOperacionais ||
      row.tiersCliente ||
      row.receitaProduto ||
      row.distMercado ||
      row.investimentoMidia ||
      row.conversoesInbound ||
      row.conversoesOutbound ||
      row.mixSubcanais;

    if (!blocosPreenchidos) continue;

    // Base = defaults da matriz; cada bloco jsonb não-nulo sobrescreve. Garante
    // o snapshot completo (NOT NULL) exigido pela estrutura nova.
    const base = matrizDefaultBlocks();
    const blocks: PremissasBlocks = {
      horizontes: (row.horizontes as HorizonteCrescimento[] | null) ?? base.horizontes,
      timeComercial: (row.timeComercial as TimeComercialMembro[] | null) ?? base.timeComercial,
      metricasOperacionais:
        (row.metricasOperacionais as MetricaOperacional[] | null) ?? base.metricasOperacionais,
      tiersCliente: (row.tiersCliente as TierCliente[] | null) ?? base.tiersCliente,
      receitaProduto: (row.receitaProduto as ReceitaProduto[] | null) ?? base.receitaProduto,
      distMercado: (row.distMercado as DistMercado[] | null) ?? base.distMercado,
      distSplit: base.distSplit, // não existia em jsonb — usa default da matriz
      investimentoMidia:
        (row.investimentoMidia as InvestimentoMidia[] | null) ?? base.investimentoMidia,
      investimentoMensal: base.investimentoMensal, // não existia em jsonb — começa vazio
      overridesSubcanalMes: base.overridesSubcanalMes, // não existia em jsonb — começa vazio

      conversoesInbound:
        (row.conversoesInbound as ConversoesInboundData | null) ?? base.conversoesInbound,
      conversoesOutbound:
        (row.conversoesOutbound as ConversoesOutboundData | null) ?? base.conversoesOutbound,
      mixSubcanais: (row.mixSubcanais as MixOutboundHorizonte[] | null) ?? base.mixSubcanais,
    };

    await savePremissas(row.organizationId, blocks);
    migrated++;
    console.log(`[migrate-premissas] migrada org ${row.organizationId}`);
  }

  console.log(`[migrate-premissas] concluído — ${migrated} organização(ões) migrada(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate-premissas] erro:", err);
  process.exit(1);
});
