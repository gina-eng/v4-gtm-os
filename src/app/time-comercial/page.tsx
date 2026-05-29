import { requireAuth } from "@/lib/auth/current-user";
import {
  getPremissas,
  matrizDefaultBlocks,
} from "@/db/repositories/premissas";
import { getUnitSetup } from "@/db/repositories/unit-setup";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import { calcularRampUp } from "@/lib/premissas/funil-reverso";
import { TimeComercialClient } from "@/components/time-comercial/time-comercial-client";
import { TimeComercialEmpty } from "@/components/time-comercial/time-comercial-empty";

export const metadata = {
  title: "Time Comercial · V4 GTM OS",
};

export const dynamic = "force-dynamic";

export default async function TimeComercialPage() {
  const session = await requireAuth();

  // Edição é por unidade (cada unidade tem o próprio time). Em modo matriz,
  // mostramos um empty state pedindo pra escolher uma unidade.
  if (session.actingMode === "matriz") {
    return <TimeComercialEmpty mode="matriz" />;
  }

  const unitOrg =
    session.activeOrganization ??
    session.availableOrganizations.find((o) => o.type === "unidade") ??
    null;
  if (!unitOrg) return <TimeComercialEmpty mode="unidade-sem-org" />;

  const matrizOrg = session.availableOrganizations.find((o) => o.type === "matriz");
  const matrizBlocks =
    (matrizOrg ? await getPremissas(matrizOrg.id) : null) ?? matrizDefaultBlocks();

  const [blocks, setup] = await Promise.all([
    getPremissas(unitOrg.id).then((b) => b ?? matrizBlocks),
    getUnitSetup(unitOrg.id),
  ]);

  const realizado = setup.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
  const linhasRampUp = calcularRampUp(blocks, unitOrg.horizonteAtual, {
    realizadoHistorico: realizado,
    dataInicio: unitOrg.dataInicio,
  });

  return (
    <TimeComercialClient
      organizationId={unitOrg.id}
      organizationName={unitOrg.name}
      horizonteAtual={unitOrg.horizonteAtual}
      dataInicio={unitOrg.dataInicio ?? null}
      timeComercial={blocks.timeComercial}
      metricasOperacionais={blocks.metricasOperacionais}
      linhasRampUp={linhasRampUp}
    />
  );
}
