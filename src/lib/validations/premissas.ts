import { z } from "zod";
import {
  conversaoInboundSchema,
  conversaoMeetingBrokerSchema,
  conversaoOutboundSchema,
  horizontesSchema,
  investimentoMidiaSchema,
  metricasOperacionaisSchema,
  mixSubcanaisSchema,
  receitaProdutoSchema,
  tierClienteSchema,
  timeComercialMembroSchema,
} from "./unit-setup";

/**
 * Corpo aceito pela rota PATCH /api/premissas — patch granular por bloco.
 *
 * A tela /premissas salva uma seção por vez (mais fino que os steps do wizard:
 * cada canal de conversão e cada subcanal outbound tem botão próprio). Reaproveita
 * os schemas de linha de unit-setup.
 *
 * Obs.: timeComercial aqui é "template da matriz" — email pode ficar vazio
 * (a matriz define cargo/salário/comissão, não pessoas), então usamos o schema
 * de membro direto, sem o refine de email obrigatório do wizard.
 */
export const premissaBlockBodySchema = z.discriminatedUnion("block", [
  z.object({ block: z.literal("horizontes"), data: horizontesSchema }),
  z.object({ block: z.literal("investimentoMidia"), data: z.array(investimentoMidiaSchema).min(1) }),
  z.object({ block: z.literal("mixSubcanais"), data: mixSubcanaisSchema }),
  z.object({ block: z.literal("tiersCliente"), data: z.array(tierClienteSchema).min(1) }),
  z.object({ block: z.literal("receitaProduto"), data: z.array(receitaProdutoSchema).min(1) }),
  z.object({ block: z.literal("distMercado"), data: z.array(distMercadoBlockRow()).min(1) }),
  z.object({
    block: z.literal("distSplit"),
    data: z
      .array(
        z.object({
          h: z.enum(["H1", "H2", "H3", "H4", "H5"]),
          pcts: z.record(
            z.enum(["Tiny", "Small", "Medium", "Large", "Enterprise"]),
            z.number().min(0).max(100),
          ),
        }),
      )
      .min(1),
  }),
  z.object({ block: z.literal("metricasOperacionais"), data: metricasOperacionaisSchema }),
  z.object({ block: z.literal("timeComercial"), data: z.array(timeComercialMembroSchema).min(1) }),
  z.object({
    block: z.literal("conversaoInbound"),
    canal: z.enum(["lead_broker", "black_box"]),
    data: z.array(conversaoInboundSchema).min(1),
  }),
  z.object({ block: z.literal("meetingBroker"), data: conversaoMeetingBrokerSchema }),
  z.object({
    block: z.literal("conversaoOutbound"),
    subcanal: z.enum(["indicacao", "eventos", "recovery", "recomendacao", "prospeccao"]),
    data: z.array(conversaoOutboundSchema).min(1),
  }),
]);

/** distMercado sem o refine de soma=100 do wizard (a matriz pode salvar parcial). */
function distMercadoBlockRow() {
  return z.object({
    tier: z.enum(["Tiny", "Small", "Medium", "Large", "Enterprise"]),
    pctMercado: z.number().min(0).max(100),
    entraHorizonte: z.enum(["H1", "H2", "H3", "H4", "H5"]),
  });
}

export type PremissaBlockBody = z.infer<typeof premissaBlockBodySchema>;
