import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStepValues, type ConversoesInboundData } from "@/db/repositories/unit-setup";
import { StepTiersReceita } from "@/components/iniciar/step-tiers-receita";
import type { ReceitaProduto, TierCliente } from "@/lib/premissas/matriz-defaults";

export const dynamic = "force-dynamic";

export default async function TiersReceitaPage() {
  const session = await requireAuth();
  if (!session.activeOrganization) redirect("/");

  // tiers-receita: produtos editáveis + tiers (Matriz). conversoes-inbound: só pra
  // exibir o Custo/SQL (Meeting Broker / Eventos) como referência da Matriz aqui.
  const [tiersReceita, conv] = await Promise.all([
    getStepValues(session.activeOrganization.id, "tiers-receita"),
    getStepValues(session.activeOrganization.id, "conversoes-inbound"),
  ]);
  const v = tiersReceita.values as { tiers: TierCliente[]; produtos: ReceitaProduto[] };
  const m = tiersReceita.matrizDefault as { tiers: TierCliente[]; produtos: ReceitaProduto[] };
  const convInbound = conv.values as ConversoesInboundData;

  return (
    <StepTiersReceita
      organizationId={session.activeOrganization.id}
      initialProdutos={v.produtos}
      matrizTiers={m.tiers}
      matrizProdutos={m.produtos}
      meetingBrokerCustoSql={convInbound.meetingBroker.custoSql}
      eventosCustoSql={convInbound.eventosCusto.custoSql}
      fromMatriz={tiersReceita.fromMatriz}
    />
  );
}
