/**
 * Constantes e tipos do setup inicial das unidades.
 *
 * Esse módulo é importado tanto por Server Components (que usam o repository
 * em src/db/repositories/unit-setup.ts) quanto por Client Components (wizard
 * shell, forms). Por isso fica fora de src/db — não carrega Drizzle/Postgres
 * e pode ser bundleado pro browser sem trazer driver de banco junto.
 */

import type {
  ConversaoInbound,
  ConversaoMeetingBroker,
  ConversaoOutbound,
  DistMercado,
  HorizonteCrescimento,
  InvestimentoMidia,
  MetricaOperacional,
  MixOutboundHorizonte,
  RealizadoMensal,
  ReceitaProduto,
  TierCliente,
  TimeComercialMembro,
} from "@/lib/premissas/matriz-defaults";

export const SETUP_STEPS = [
  "horizontes",
  "time-comercial",
  "metricas-operacionais",
  "tiers-receita",
  "leads-investimento",
  "conversoes-inbound",
  "conversoes-outbound",
  "mix-subcanais",
  "realizado-historico",
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export const SETUP_STEP_LABEL: Record<SetupStep, string> = {
  horizontes: "Horizontes de Crescimento",
  "time-comercial": "Time Comercial",
  "metricas-operacionais": "Capacidade Operacional",
  "tiers-receita": "Tiers & Receita",
  "leads-investimento": "Leads & Investimento",
  "conversoes-inbound": "Conversões Inbound",
  "conversoes-outbound": "Conversões Outbound",
  "mix-subcanais": "Mix Subcanais",
  "realizado-historico": "Realizado Histórico",
};

export type ConversoesInboundData = {
  leadBroker: ConversaoInbound[];
  blackBox: ConversaoInbound[];
  meetingBroker: ConversaoMeetingBroker;
};

export type ConversoesOutboundData = {
  indicacao: ConversaoOutbound[];
  eventos: ConversaoOutbound[];
  recovery: ConversaoOutbound[];
  recomendacao: ConversaoOutbound[];
  prospeccao: ConversaoOutbound[];
};

export type UnitSetup = {
  organizationId: string;
  completedSteps: SetupStep[];
  completedAt: Date | null;
  horizontes: HorizonteCrescimento[] | null;
  timeComercial: TimeComercialMembro[] | null;
  metricasOperacionais: MetricaOperacional[] | null;
  tiersCliente: TierCliente[] | null;
  receitaProduto: ReceitaProduto[] | null;
  distMercado: DistMercado[] | null;
  investimentoMidia: InvestimentoMidia[] | null;
  conversoesInbound: ConversoesInboundData | null;
  conversoesOutbound: ConversoesOutboundData | null;
  mixSubcanais: MixOutboundHorizonte[] | null;
  realizadoHistorico: RealizadoMensal[] | null;
  updatedAt: Date;
};

export type SaveStepInput =
  | { step: "horizontes"; data: HorizonteCrescimento[] }
  | { step: "time-comercial"; data: TimeComercialMembro[] }
  | { step: "metricas-operacionais"; data: MetricaOperacional[] }
  | {
      step: "tiers-receita";
      data: { tiers: TierCliente[]; produtos: ReceitaProduto[] };
    }
  | {
      step: "leads-investimento";
      data: { distMercado: DistMercado[]; investimentoMidia: InvestimentoMidia[] };
    }
  | { step: "conversoes-inbound"; data: ConversoesInboundData }
  | { step: "conversoes-outbound"; data: ConversoesOutboundData }
  | { step: "mix-subcanais"; data: MixOutboundHorizonte[] }
  | { step: "realizado-historico"; data: RealizadoMensal[] };

/**
 * Função pura — pode ser usada em client e server. Decide qual é o próximo
 * step pendente em ordem; retorna null quando todos estão concluídos.
 */
export function nextPendingStep(setup: UnitSetup): SetupStep | null {
  for (const s of SETUP_STEPS) {
    if (!setup.completedSteps.includes(s)) return s;
  }
  return null;
}
