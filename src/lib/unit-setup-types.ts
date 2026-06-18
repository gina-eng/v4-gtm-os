/**
 * Constantes e tipos do setup inicial das unidades.
 *
 * Esse módulo é importado tanto por Server Components (que usam o repository
 * em src/db/repositories/unit-setup.ts) quanto por Client Components (wizard
 * shell, forms). Por isso fica fora de src/db — não carrega Drizzle/Postgres
 * e pode ser bundleado pro browser sem trazer driver de banco junto.
 */

import type {
  ConversaoEventos,
  ConversaoInbound,
  ConversaoMeetingBroker,
  ConversaoOutbound,
  DistMercado,
  EventosCusto,
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
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export const SETUP_STEP_LABEL: Record<SetupStep, string> = {
  horizontes: "Horizontes de Crescimento",
  // "time-comercial" e "metricas-operacionais" foram fundidos num só passo de UI
  // ("Time & Capacidade"); o data layer mantém os dois steps. O wizard-shell
  // colapsa o segundo na exibição (não mostra "Capacidade Operacional" sozinho).
  "time-comercial": "Time & Capacidade",
  "metricas-operacionais": "Capacidade Operacional",
  "tiers-receita": "Tiers & Receita",
  "leads-investimento": "Leads & Investimento",
  "conversoes-inbound": "Conversões Inbound",
  "conversoes-outbound": "Conversões Outbound",
  "mix-subcanais": "Mix Subcanais",
};

export type ConversoesInboundData = {
  leadBroker: ConversaoInbound[];
  blackBox: ConversaoInbound[];
  meetingBroker: ConversaoMeetingBroker;
  eventosCusto: EventosCusto;
  eventos: ConversaoEventos[];
};

/**
 * Subconjunto que o step "Conversões Inbound" do wizard /iniciar realmente edita:
 * Lead Broker, Black Box e Meeting Broker. Eventos (custo/SQL + CR3/CR4 por tier)
 * não tem UI no wizard — é herdado do default da Matriz e editado em /premissas.
 * Por isso o payload do step não os carrega; o merge em applyStepToBlocks preserva
 * o que já existe no snapshot da entidade.
 */
export type ConversoesInboundStepData = Pick<
  ConversoesInboundData,
  "leadBroker" | "blackBox" | "meetingBroker"
>;

export type ConversoesOutboundData = {
  indicacao: ConversaoOutbound[];
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
  | { step: "conversoes-inbound"; data: ConversoesInboundStepData }
  | { step: "conversoes-outbound"; data: ConversoesOutboundData }
  | { step: "mix-subcanais"; data: MixOutboundHorizonte[] };

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
