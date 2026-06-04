/**
 * Valores padrão definidos pela Matriz para as premissas do modelo.
 *
 * Esses valores são a "fonte da verdade" da Matriz — cada unidade pode
 * personalizá-los no seu próprio /iniciar (wizard de setup), mas nunca
 * sobrescreve esses defaults. A unidade tem seus próprios campos
 * persistidos em src/db/repositories/unit-setup.ts.
 *
 * Quando a Matriz quiser alterar esses defaults, isso passa pela tela
 * /premissas (matriz mode) — TODO conforme P*.
 */

export type Cargo = "SDR" | "BDR" | "Closer";
export type Horizonte = "H1" | "H2" | "H3" | "H4" | "H5";
export type Tier = "Tiny" | "Small" | "Medium" | "Large" | "Enterprise";

// ============================================================
// Time Comercial (cargo, qtd, salário, comissão)
// ============================================================

export type TimeComercialMembro = {
  /** E-mail do investidor — identificador da pessoa. Pode ficar vazio durante o draft. */
  email: string;
  cargo: string;
  salario: number;
  comissaoPct: number;
  /** Capacidade atual da pessoa em % — discreto: 0, 25, 50, 75, 90 ou 100. */
  capacidadePct: number;
};

/** Valores aceitos no select de capacidade atual. */
export const CAPACIDADE_OPTIONS = [0, 25, 50, 75, 90, 100] as const;
export type CapacidadeOption = (typeof CAPACIDADE_OPTIONS)[number];

/** Cargos válidos do time comercial — usado em select de cadastro/edição. */
export const CARGOS_COMERCIAIS = ["LDR", "BDR", "SDR", "CLOSER", "KAM"] as const;
export type CargoComercial = (typeof CARGOS_COMERCIAIS)[number];

export const TIME_COMERCIAL_DEFAULT: TimeComercialMembro[] = [
  { email: "", cargo: "LDR", salario: 2_800, comissaoPct: 2.5, capacidadePct: 100 },
  { email: "", cargo: "BDR", salario: 3_500, comissaoPct: 4.0, capacidadePct: 100 },
  { email: "", cargo: "SDR", salario: 3_200, comissaoPct: 3.0, capacidadePct: 100 },
  { email: "", cargo: "CLOSER", salario: 5_000, comissaoPct: 6.0, capacidadePct: 100 },
  { email: "", cargo: "KAM", salario: 7_500, comissaoPct: 8.0, capacidadePct: 100 },
];

// ============================================================
// Métricas Operacionais (P17)
//
// Todos os campos numéricos para entrar em fórmulas (proxy):
// - wipLimit:        capacidade máxima mensal do cargo (unidade implícita: MQLs/leads/reuniões dependendo do cargo)
// - contratacao:     tempo médio de contratação, em DIAS
// - onboarding:      tempo de onboarding, em DIAS
// - rampagem:        tempo até atingir produção plena, em meses
// - atingimentoMes:  mês em que atinge 100% do WIP limit
// - permanencia:     tempo médio de permanência no cargo, em meses
// - turnoverMesPct:  turnover mensal em %
// - ligacoesMes:     volume médio de ligações/mês (0 = não se aplica ao cargo)
// - conexaoPct:      taxa de conexão das ligações em % (0 = não se aplica ao cargo)
// ============================================================

export type MetricaOperacional = {
  cargo: string;
  wipLimit: number;
  contratacao: number;
  onboarding: number;
  rampagem: number;
  atingimentoMes: number;
  permanencia: number;
  turnoverMesPct: number;
  ligacoesMes: number;
  conexaoPct: number;
};

export const METRICAS_OPERACIONAIS_DEFAULT: MetricaOperacional[] = [
  {
    cargo: "LDR",
    wipLimit: 300,
    contratacao: 30,
    onboarding: 30,
    rampagem: 4,
    atingimentoMes: 5,
    permanencia: 18,
    turnoverMesPct: 2.1,
    ligacoesMes: 3_500,
    conexaoPct: 40,
  },
  {
    cargo: "BDR",
    wipLimit: 200,
    contratacao: 60,
    onboarding: 30,
    rampagem: 5,
    atingimentoMes: 6,
    permanencia: 24,
    turnoverMesPct: 1.7,
    ligacoesMes: 4_000,
    conexaoPct: 30,
  },
  {
    cargo: "SDR",
    wipLimit: 200,
    contratacao: 60,
    onboarding: 30,
    rampagem: 5,
    atingimentoMes: 6,
    permanencia: 24,
    turnoverMesPct: 1.7,
    ligacoesMes: 2_660,
    conexaoPct: 50,
  },
  {
    cargo: "CLOSER",
    wipLimit: 50,
    contratacao: 60,
    onboarding: 30,
    rampagem: 5,
    atingimentoMes: 6,
    permanencia: 24,
    turnoverMesPct: 1.7,
    ligacoesMes: 0,
    conexaoPct: 0,
  },
  {
    cargo: "KAM",
    wipLimit: 20,
    contratacao: 90,
    onboarding: 60,
    rampagem: 6,
    atingimentoMes: 9,
    permanencia: 36,
    turnoverMesPct: 0.8,
    ligacoesMes: 0,
    conexaoPct: 0,
  },
];

// ============================================================
// Horizontes de Crescimento (P1)
//
// Cada horizonte (H1-H5) tem faixa de faturamento mensal, prazo máximo
// para sair do horizonte, e crescimento mensal mínimo esperado.
// - faixaMax: null = aberto à direita (H5 R$1,5M+ — sem teto)
// - tempoMaxMeses: null = sem prazo (H5 — unidade já consolidada)
// ============================================================

export type HorizonteCrescimento = {
  h: Horizonte;
  faixaMin: number;
  faixaMax: number | null;
  tempoMaxMeses: number | null;
  crescMensalPct: number;
};

export const HORIZONTE_CRESCIMENTO_DEFAULT: HorizonteCrescimento[] = [
  { h: "H1", faixaMin: 0, faixaMax: 60_000, tempoMaxMeses: 3, crescMensalPct: 40 },
  { h: "H2", faixaMin: 60_000, faixaMax: 150_000, tempoMaxMeses: 6, crescMensalPct: 30 },
  { h: "H3", faixaMin: 150_000, faixaMax: 450_000, tempoMaxMeses: 12, crescMensalPct: 20 },
  { h: "H4", faixaMin: 450_000, faixaMax: 900_000, tempoMaxMeses: 18, crescMensalPct: 7 },
  { h: "H5", faixaMin: 900_000, faixaMax: null, tempoMaxMeses: null, crescMensalPct: 2.5 },
];

// ============================================================
// Tiers de Cliente (P2)
//
// Faturamento agora é numérico (R$ anual):
// - faturamentoMin: piso da faixa
// - faturamentoMax: teto da faixa. null = aberto à direita (ex: Enterprise R$500M+).
// ============================================================

export type TierCliente = {
  tier: Tier;
  faturamentoMin: number;
  faturamentoMax: number | null;
  /** Ponderado por receita realizada por produto (Saber%·TM + Ter%·TM + Executar%·TM). Calculado automaticamente a partir de P3. */
  tcvBooking: number;
  cplLb: number;
  cplBb: number;
  /** CPMQL via Meeting Broker / Inbound de eventos — default = custoSql. */
  cpmqlMt: number;
};

export const TIERS_CLIENTE_DEFAULT: TierCliente[] = [
  { tier: "Tiny", faturamentoMin: 600_000, faturamentoMax: 1_200_000, tcvBooking: 25_500, cplLb: 421, cplBb: 700, cpmqlMt: 5_000 },
  { tier: "Small", faturamentoMin: 1_200_000, faturamentoMax: 2_500_000, tcvBooking: 40_300, cplLb: 810, cplBb: 700, cpmqlMt: 5_000 },
  { tier: "Medium", faturamentoMin: 2_500_000, faturamentoMax: 50_000_000, tcvBooking: 62_500, cplLb: 1_152, cplBb: 700, cpmqlMt: 5_000 },
  { tier: "Large", faturamentoMin: 50_000_000, faturamentoMax: 500_000_000, tcvBooking: 80_800, cplLb: 1_608, cplBb: 700, cpmqlMt: 5_000 },
  { tier: "Enterprise", faturamentoMin: 500_000_000, faturamentoMax: null, tcvBooking: 153_160, cplLb: 1_683, cplBb: 700, cpmqlMt: 5_000 },
];

// ============================================================
// Receita por Produto / Tier (P3)
// ============================================================

export type ReceitaProduto = {
  tier: Tier;
  saberPct: number;
  saberAt: number;
  terPct: number;
  terAt: number;
  execPct: number;
  execAt: number;
};

export const RECEITA_PRODUTO_DEFAULT: ReceitaProduto[] = [
  { tier: "Tiny", saberPct: 80, saberAt: 20_000, terPct: 20, terAt: 7_500, execPct: 0, execAt: 0 },
  { tier: "Small", saberPct: 80, saberAt: 30_000, terPct: 20, terAt: 11_500, execPct: 0, execAt: 0 },
  { tier: "Medium", saberPct: 60, saberAt: 30_000, terPct: 10, terAt: 15_000, execPct: 30, execAt: 50_000 },
  { tier: "Large", saberPct: 60, saberAt: 30_000, terPct: 10, terAt: 18_000, execPct: 30, execAt: 99_000 },
  { tier: "Enterprise", saberPct: 60, saberAt: 30_000, terPct: 10, terAt: 31_600, execPct: 30, execAt: 145_000 },
];

// ============================================================
// Distribuição de Leads por Tier (P4)
// ============================================================

export type DistMercado = {
  tier: Tier;
  pctMercado: number;
  entraHorizonte: Horizonte;
};

export const DIST_MERCADO_DEFAULT: DistMercado[] = [
  { tier: "Tiny", pctMercado: 20, entraHorizonte: "H1" },
  { tier: "Small", pctMercado: 25, entraHorizonte: "H1" },
  { tier: "Medium", pctMercado: 30, entraHorizonte: "H3" },
  { tier: "Large", pctMercado: 15, entraHorizonte: "H4" },
  { tier: "Enterprise", pctMercado: 10, entraHorizonte: "H5" },
];

// Split normalizado de leads por horizonte × tier (renormalizado a 100% entre
// os tiers ativos do horizonte). É a tabela à direita do P4 na tela /premissas.
export type DistSplitHorizonte = {
  h: Horizonte;
  /** % por tier; só os tiers ativos no horizonte aparecem. */
  pcts: Partial<Record<Tier, number>>;
};

export const DIST_SPLIT_DEFAULT: DistSplitHorizonte[] = [
  { h: "H1", pcts: { Tiny: 44.4, Small: 55.6 } },
  { h: "H2", pcts: { Tiny: 44.4, Small: 55.6 } },
  { h: "H3", pcts: { Tiny: 26.7, Small: 33.3, Medium: 40 } },
  { h: "H4", pcts: { Tiny: 22.2, Small: 27.8, Medium: 33.3, Large: 16.7 } },
  { h: "H5", pcts: { Tiny: 20, Small: 25, Medium: 30, Large: 15, Enterprise: 10 } },
];

// ============================================================
// Investimento em Mídia por Horizonte (P6)
// ============================================================

/**
 * Override do investimento em mídia (R$) por mês de 2026. Cada unidade tem até
 * 12 linhas; quando um mês não está presente, o cálculo usa o pctProducao do
 * horizonte atual (P6) × target como fallback. Granularidade: mês.
 *
 * O input do usuário em /realizado é o valor absoluto (R$); o `% da produção`
 * exibido é derivado (investimento ÷ target × 100), não é persistido.
 */
export type InvestimentoMes = {
  /** Mês ISO `"2026-01" .. "2026-12"`. */
  mes: string;
  /** Investimento absoluto em mídia para o mês, em R$. */
  investimento: number;
};

/**
 * Chave de subcanal de mídia — 4 inbound + 4 outbound. Fonte canônica do tipo
 * (reexportado por funil-reverso.ts). Espelha o enum `subcanal_midia` do banco.
 */
export type SubCanalKey =
  | "lead_broker"
  | "black_box"
  | "meeting_broker"
  | "eventos"
  | "out_indicacao"
  | "out_recovery"
  | "out_recomendacao"
  | "out_prospeccao";

/**
 * Override do investimento/leads de um subcanal num mês. `valor` = R$ para
 * subcanais inbound (lead_broker/black_box/meeting_broker/eventos) ou nº de
 * leads para subcanais outbound (out_*). Vive em `premissa_override_subcanal_mes`.
 */
export type OverrideSubcanalMes = {
  mes: string;
  subcanal: SubCanalKey;
  valor: number;
};

export type InvestimentoMidia = {
  h: Horizonte;
  pctProducao: number;
  splitLb: number;
  splitBb: number;
  /** % do budget de mídia dedicado a Meeting Broker (inbound curto enterprise, SQL→SAL→WON). 0 = não liberado para o horizonte. */
  splitMt: number;
  /** % do budget de mídia dedicado a Eventos (inbound curto multi-tier, SQL→SAL→WON). 0 = não liberado para o horizonte. */
  splitEv: number;
  bbPiso: number;
  regra: string;
};

export const INVESTIMENTO_MIDIA_DEFAULT: InvestimentoMidia[] = [
  { h: "H1", pctProducao: 16.8, splitLb: 100, splitBb: 0, splitMt: 0, splitEv: 0, bbPiso: 0, regra: "Max inbound, out complementa" },
  { h: "H2", pctProducao: 17.0, splitLb: 100, splitBb: 0, splitMt: 0, splitEv: 0, bbPiso: 0, regra: "" },
  { h: "H3", pctProducao: 15.5, splitLb: 80, splitBb: 20, splitMt: 0, splitEv: 0, bbPiso: 30_000, regra: "BB entra" },
  { h: "H4", pctProducao: 15.6, splitLb: 75, splitBb: 25, splitMt: 0, splitEv: 0, bbPiso: 30_000, regra: "" },
  { h: "H5", pctProducao: 17.5, splitLb: 62.5, splitBb: 27.5, splitMt: 10, splitEv: 0, bbPiso: 30_000, regra: "Ent: 10% budget → MeetingBroker" },
];

// ============================================================
// Conversões Inbound — P8 (Lead Broker), P9 (Black Box), P10 (Meeting Broker)
//
// Funil: Lead → MQL → SQL → SAL → Won (+ pós-venda: Ativação → Renovação → Expansão)
// CR1 = L→MQL, CR2 = MQL→SQL, CR3 = SQL→SAL, CR4 = SAL→Won,
// CR5 = Won→Ativação, CR6 = Ativação→Renovação, CR7 = Renovação→Expansão.
// ============================================================

export type ConversaoInbound = {
  tier: Tier;
  cr1: number;
  cr2: number;
  cr3: number;
  cr4: number;
  cr5: number;
  cr6: number;
  cr7: number;
};

export const CONVERSAO_LEAD_BROKER_DEFAULT: ConversaoInbound[] = [
  { tier: "Tiny", cr1: 100, cr2: 50, cr3: 86, cr4: 35, cr5: 90, cr6: 90, cr7: 103 },
  { tier: "Small", cr1: 100, cr2: 50, cr3: 86, cr4: 35, cr5: 93, cr6: 83, cr7: 106 },
  { tier: "Medium", cr1: 100, cr2: 30, cr3: 86, cr4: 35, cr5: 95, cr6: 94, cr7: 107 },
  { tier: "Large", cr1: 100, cr2: 25, cr3: 86, cr4: 30, cr5: 96, cr6: 95, cr7: 108 },
  { tier: "Enterprise", cr1: 100, cr2: 15, cr3: 86, cr4: 30, cr5: 97, cr6: 96, cr7: 110 },
];

export const CONVERSAO_BLACK_BOX_DEFAULT: ConversaoInbound[] = [
  { tier: "Tiny", cr1: 100, cr2: 30, cr3: 80, cr4: 35, cr5: 90, cr6: 90, cr7: 103 },
  { tier: "Small", cr1: 100, cr2: 30, cr3: 80, cr4: 35, cr5: 93, cr6: 83, cr7: 106 },
  { tier: "Medium", cr1: 100, cr2: 25, cr3: 86, cr4: 30, cr5: 95, cr6: 94, cr7: 107 },
  { tier: "Large", cr1: 100, cr2: 20, cr3: 86, cr4: 30, cr5: 96, cr6: 95, cr7: 108 },
  { tier: "Enterprise", cr1: 100, cr2: 10, cr3: 86, cr4: 30, cr5: 97, cr6: 96, cr7: 110 },
];

// P10 — Meeting Broker: canal Enterprise-only, funil SQL→SAL→Won.
export type ConversaoMeetingBroker = {
  custoSql: number;
  cr3: number;
  cr4: number;
  meta: string;
  pipeline: string;
};

export const CONVERSAO_MEETING_BROKER_DEFAULT: ConversaoMeetingBroker = {
  custoSql: 5_000,
  cr3: 80,
  cr4: 15,
  meta: "~2 deals/tri",
  pipeline: "Empilha mensal, converte ~trimestral",
};

// Eventos: inbound de funil curto (invest → SQL → SAL → WON) — multi-tier.
// custoSql é singleton; CR3/CR4 são por tier (ao contrário do MB que tem CR3/CR4 fixos).
export type EventosCusto = {
  custoSql: number;
  meta: string;
  pipeline: string;
};

export const EVENTOS_CUSTO_DEFAULT: EventosCusto = {
  custoSql: 5_000,
  meta: "",
  pipeline: "",
};

export type ConversaoEventos = {
  tier: Tier;
  cr3: number;
  cr4: number;
};

export const CONVERSAO_EVENTOS_DEFAULT: ConversaoEventos[] = [
  { tier: "Tiny", cr3: 80, cr4: 30 },
  { tier: "Small", cr3: 80, cr4: 30 },
  { tier: "Medium", cr3: 80, cr4: 25 },
  { tier: "Large", cr3: 80, cr4: 20 },
  { tier: "Enterprise", cr3: 80, cr4: 15 },
];

// ============================================================
// Conversões Outbound — P11 a P15 (5 subcanais)
//
// Funil curto: Lead → SQL → SAL → Won (sem etapa MQL).
// CR1 = L→SQL, CR3 = SQL→SAL, CR4 = SAL→Won,
// CR6 = Ativação→Renovação, CR7 = Renovação→Expansão.
// ============================================================

export type ConversaoOutbound = {
  tier: Tier;
  cr1: number;
  cr3: number;
  cr4: number;
  cr6: number;
  cr7: number;
};

export const CONVERSAO_OUTBOUND_INDICACAO_DEFAULT: ConversaoOutbound[] = [
  { tier: "Tiny", cr1: 28, cr3: 80, cr4: 30, cr6: 96, cr7: 108 },
  { tier: "Small", cr1: 25, cr3: 80, cr4: 30, cr6: 95, cr7: 108 },
  { tier: "Medium", cr1: 23, cr3: 80, cr4: 25, cr6: 94, cr7: 108 },
  { tier: "Large", cr1: 18, cr3: 80, cr4: 20, cr6: 94, cr7: 108 },
  { tier: "Enterprise", cr1: 18, cr3: 80, cr4: 15, cr6: 85, cr7: 108 },
];

export const CONVERSAO_OUTBOUND_RECOVERY_DEFAULT: ConversaoOutbound[] = [
  { tier: "Tiny", cr1: 10, cr3: 80, cr4: 25, cr6: 96, cr7: 108 },
  { tier: "Small", cr1: 10, cr3: 80, cr4: 25, cr6: 95, cr7: 108 },
  { tier: "Medium", cr1: 8, cr3: 80, cr4: 20, cr6: 94, cr7: 108 },
  { tier: "Large", cr1: 5, cr3: 80, cr4: 20, cr6: 94, cr7: 108 },
  { tier: "Enterprise", cr1: 5, cr3: 80, cr4: 15, cr6: 85, cr7: 108 },
];

export const CONVERSAO_OUTBOUND_RECOMENDACAO_DEFAULT: ConversaoOutbound[] = [
  { tier: "Tiny", cr1: 15, cr3: 80, cr4: 25, cr6: 96, cr7: 108 },
  { tier: "Small", cr1: 15, cr3: 80, cr4: 25, cr6: 95, cr7: 108 },
  { tier: "Medium", cr1: 12, cr3: 80, cr4: 20, cr6: 94, cr7: 108 },
  { tier: "Large", cr1: 8, cr3: 80, cr4: 20, cr6: 94, cr7: 108 },
  { tier: "Enterprise", cr1: 5, cr3: 80, cr4: 15, cr6: 85, cr7: 108 },
];

export const CONVERSAO_OUTBOUND_PROSPECCAO_DEFAULT: ConversaoOutbound[] = [
  { tier: "Tiny", cr1: 8, cr3: 80, cr4: 20, cr6: 96, cr7: 108 },
  { tier: "Small", cr1: 8, cr3: 80, cr4: 20, cr6: 95, cr7: 108 },
  { tier: "Medium", cr1: 5, cr3: 80, cr4: 18, cr6: 94, cr7: 108 },
  { tier: "Large", cr1: 5, cr3: 80, cr4: 15, cr6: 94, cr7: 108 },
  { tier: "Enterprise", cr1: 3, cr3: 80, cr4: 10, cr6: 85, cr7: 108 },
];

// ============================================================
// Mix Subcanais Outbound por Horizonte (P16)
//
// Distribuição dos leads outbound entre os 4 subcanais em cada horizonte.
// A soma de cada linha deve totalizar 100%. Eventos foi movido para Inbound
// (funil curto SQL→SAL→WON) — orçado via P6.splitMt e custo via P2.cpmqlMt.
// ============================================================

export type MixOutboundHorizonte = {
  h: Horizonte;
  indicacao: number;
  recovery: number;
  recomendacao: number;
  prospeccao: number;
};

export const MIX_OUTBOUND_DEFAULT: MixOutboundHorizonte[] = [
  { h: "H1", indicacao: 25, recovery: 20, recomendacao: 25, prospeccao: 30 },
  { h: "H2", indicacao: 25, recovery: 20, recomendacao: 25, prospeccao: 30 },
  { h: "H3", indicacao: 30, recovery: 20, recomendacao: 25, prospeccao: 25 },
  { h: "H4", indicacao: 40, recovery: 20, recomendacao: 25, prospeccao: 15 },
  { h: "H5", indicacao: 40, recovery: 20, recomendacao: 25, prospeccao: 15 },
];

// ============================================================
// Realizado Histórico Mensal (Realizado vs Projetado)
//
// Não é uma premissa da Matriz — é input da unidade. A Matriz nunca
// preenche esses campos; quando a unidade acessa, vem com os meses
// fechados do ano corrente zerados (mes pré-criado, faturamento=0).
//
// `mes` no formato "YYYY-MM" pra facilitar ordenação e parsing.
// ============================================================

export type RealizadoMensal = {
  mes: string;
  faturamento: number;
  investido: number;
  leadsIb: number;
  leadsOb: number;
  won: number;
};

/**
 * Esqueleto dos meses fechados de 2026 — até abril, alinhado com o currentDate
 * de referência (mai/2026). Quando o mês corrente avança, basta acrescentar
 * linhas aqui ou popular dinamicamente no wizard.
 */
export const REALIZADO_HISTORICO_DEFAULT: RealizadoMensal[] = [
  { mes: "2026-01", faturamento: 0, investido: 0, leadsIb: 0, leadsOb: 0, won: 0 },
  { mes: "2026-02", faturamento: 0, investido: 0, leadsIb: 0, leadsOb: 0, won: 0 },
  { mes: "2026-03", faturamento: 0, investido: 0, leadsIb: 0, leadsOb: 0, won: 0 },
  { mes: "2026-04", faturamento: 0, investido: 0, leadsIb: 0, leadsOb: 0, won: 0 },
];
