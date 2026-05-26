import { z } from "zod";
import { MESES_ANO_2026 } from "@/lib/realizado/projecao";

const horizonteEnum = z.enum(["H1", "H2", "H3", "H4", "H5"]);
const tierEnum = z.enum(["Tiny", "Small", "Medium", "Large", "Enterprise"]);
const mesAno2026Enum = z.enum(MESES_ANO_2026);

// ============================================================
// Horizontes de Crescimento (P1)
// ============================================================

export const horizonteCrescimentoSchema = z
  .object({
    h: horizonteEnum,
    faixaMin: z.number().min(0),
    // null = aberto à direita (H5 sem teto)
    faixaMax: z.number().min(0).nullable(),
    // null = sem prazo (H5 — unidade já consolidada)
    tempoMaxMeses: z.number().min(0).max(120).nullable(),
    crescMensalPct: z.number().min(0).max(1000),
  })
  .refine(
    (v) => v.faixaMax === null || v.faixaMax >= v.faixaMin,
    { message: "faixaMax deve ser maior ou igual a faixaMin", path: ["faixaMax"] },
  );

export const horizontesSchema = z.array(horizonteCrescimentoSchema).min(1);

// ============================================================
// Time Comercial
// ============================================================

export const timeComercialMembroSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail inválido")]),
  cargo: z.string().trim().min(1).max(60),
  salario: z.number().min(0).max(1_000_000),
  comissaoPct: z.number().min(0).max(100),
  capacidadePct: z
    .number()
    .refine((v) => [0, 25, 50, 75, 90, 100].includes(v), {
      message: "Capacidade deve ser 0, 25, 50, 75, 90 ou 100",
    }),
});

/**
 * No save final, nenhum membro pode ficar com e-mail vazio. Drafts intermediários
 * podem ter `""`, mas ao chegar na API esse estado é bloqueado.
 */
export const timeComercialSchema = z
  .array(timeComercialMembroSchema)
  .min(1)
  .superRefine((arr, ctx) => {
    arr.forEach((m, i) => {
      if (m.email === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Informe o e-mail da pessoa em ${m.cargo || `linha ${i + 1}`}.`,
          path: [i, "email"],
        });
      }
    });
  });

// ============================================================
// Métricas Operacionais
// ============================================================

export const metricaOperacionalSchema = z.object({
  cargo: z.string().trim().min(1).max(60),
  wipLimit: z.number().min(0).max(100_000),
  // Em dias. Teto generoso (~3 anos) — campo é estimativa, não SLA rígido.
  contratacao: z.number().min(0).max(1095),
  onboarding: z.number().min(0).max(1095),
  rampagem: z.number().min(0).max(120),
  atingimentoMes: z.number().min(0).max(120),
  permanencia: z.number().min(0).max(600),
  turnoverMesPct: z.number().min(0).max(100),
  ligacoesMes: z.number().min(0).max(1_000_000),
  conexaoPct: z.number().min(0).max(100),
  extra: z.string().trim().max(255),
});

export const metricasOperacionaisSchema = z.array(metricaOperacionalSchema).min(1);

// ============================================================
// Tiers + Receita
// ============================================================

export const tierClienteSchema = z
  .object({
    tier: tierEnum,
    faturamentoMin: z.number().min(0),
    // null = aberto à direita (ex: Enterprise "R$500M+")
    faturamentoMax: z.number().min(0).nullable(),
    tcvBooking: z.number().min(0),
    tcvProdCom: z.number().min(0),
    cplLb: z.number().min(0),
    cplBb: z.number().min(0),
  })
  .refine(
    (v) => v.faturamentoMax === null || v.faturamentoMax >= v.faturamentoMin,
    { message: "faturamentoMax deve ser maior ou igual a faturamentoMin", path: ["faturamentoMax"] },
  );

export const receitaProdutoSchema = z.object({
  tier: tierEnum,
  saberPct: z.number().min(0).max(100),
  saberAt: z.number().min(0),
  terPct: z.number().min(0).max(100),
  terAt: z.number().min(0),
  execPct: z.number().min(0).max(100),
  execAt: z.number().min(0),
});

export const tiersReceitaSchema = z.object({
  tiers: z.array(tierClienteSchema).min(1),
  produtos: z.array(receitaProdutoSchema).min(1),
});

// ============================================================
// Leads + Investimento
// ============================================================

export const distMercadoSchema = z.object({
  tier: tierEnum,
  pctMercado: z.number().min(0).max(100),
  entraHorizonte: horizonteEnum,
});

/** Soma de todos os tiers deve totalizar 100% (tolerância 0.5 pra arredondamento). */
const distMercadoArraySchema = z
  .array(distMercadoSchema)
  .min(1)
  .superRefine((arr, ctx) => {
    const total = arr.reduce((acc, r) => acc + r.pctMercado, 0);
    if (Math.abs(total - 100) > 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Distribuição de mercado soma ${total.toFixed(1)}% — deve totalizar 100%.`,
        path: [],
      });
    }
  });

export const investimentoMidiaSchema = z.object({
  h: horizonteEnum,
  pctProducao: z.number().min(0).max(100),
  splitLb: z.number().min(0).max(100),
  splitBb: z.number().min(0).max(100),
  bbPiso: z.number().min(0),
  regra: z.string().trim().max(255),
});

export const leadsInvestimentoSchema = z.object({
  distMercado: distMercadoArraySchema,
  investimentoMidia: z.array(investimentoMidiaSchema).min(1),
});

// ============================================================
// Conversões Inbound (P8 + P9 + P10)
// ============================================================

export const conversaoInboundSchema = z.object({
  tier: tierEnum,
  cr1: z.number().min(0).max(100),
  cr2: z.number().min(0).max(100),
  cr3: z.number().min(0).max(100),
  cr4: z.number().min(0).max(100),
  cr5: z.number().min(0).max(200),
  cr6: z.number().min(0).max(200),
  cr7: z.number().min(0).max(200),
});

export const conversaoMeetingBrokerSchema = z.object({
  custoSql: z.number().min(0),
  cr3: z.number().min(0).max(100),
  cr4: z.number().min(0).max(100),
  meta: z.string().trim().max(255),
  pipeline: z.string().trim().max(255),
});

export const conversoesInboundSchema = z.object({
  leadBroker: z.array(conversaoInboundSchema).min(1),
  blackBox: z.array(conversaoInboundSchema).min(1),
  meetingBroker: conversaoMeetingBrokerSchema,
});

// ============================================================
// Conversões Outbound (P11 a P15)
// ============================================================

export const conversaoOutboundSchema = z.object({
  tier: tierEnum,
  cr1: z.number().min(0).max(100),
  cr3: z.number().min(0).max(100),
  cr4: z.number().min(0).max(100),
  cr6: z.number().min(0).max(200),
  cr7: z.number().min(0).max(200),
});

const outboundCanalSchema = z.array(conversaoOutboundSchema).min(1);

export const conversoesOutboundSchema = z.object({
  indicacao: outboundCanalSchema,
  eventos: outboundCanalSchema,
  recovery: outboundCanalSchema,
  recomendacao: outboundCanalSchema,
  prospeccao: outboundCanalSchema,
});

// ============================================================
// Mix Subcanais Outbound por Horizonte (P16)
// ============================================================

export const mixSubcanaisRowSchema = z.object({
  h: horizonteEnum,
  indicacao: z.number().min(0).max(100),
  eventos: z.number().min(0).max(100),
  recovery: z.number().min(0).max(100),
  recomendacao: z.number().min(0).max(100),
  prospeccao: z.number().min(0).max(100),
});

export const mixSubcanaisSchema = z
  .array(mixSubcanaisRowSchema)
  .min(1)
  .superRefine((arr, ctx) => {
    arr.forEach((row, i) => {
      const total =
        row.indicacao +
        row.eventos +
        row.recovery +
        row.recomendacao +
        row.prospeccao;
      if (Math.abs(total - 100) > 0.5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Mix de ${row.h} soma ${total.toFixed(1)}% — deve totalizar 100%.`,
          path: [i],
        });
      }
    });
  });

// ============================================================
// Realizado Histórico Mensal (Realizado vs Projetado)
// ============================================================

export const realizadoMensalSchema = z.object({
  mes: mesAno2026Enum,
  faturamento: z.number().min(0),
  investido: z.number().min(0),
  leadsIb: z.number().min(0),
  leadsOb: z.number().min(0),
  won: z.number().min(0),
});

export const realizadoHistoricoSchema = z.array(realizadoMensalSchema).min(1);

// ============================================================
// Step union — discrimina por nome do step
// ============================================================

export const saveStepBodySchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("horizontes"), data: horizontesSchema }),
  z.object({ step: z.literal("time-comercial"), data: timeComercialSchema }),
  z.object({ step: z.literal("metricas-operacionais"), data: metricasOperacionaisSchema }),
  z.object({ step: z.literal("tiers-receita"), data: tiersReceitaSchema }),
  z.object({ step: z.literal("leads-investimento"), data: leadsInvestimentoSchema }),
  z.object({ step: z.literal("conversoes-inbound"), data: conversoesInboundSchema }),
  z.object({ step: z.literal("conversoes-outbound"), data: conversoesOutboundSchema }),
  z.object({ step: z.literal("mix-subcanais"), data: mixSubcanaisSchema }),
  z.object({ step: z.literal("realizado-historico"), data: realizadoHistoricoSchema }),
]);

export type SaveStepBody = z.infer<typeof saveStepBodySchema>;
