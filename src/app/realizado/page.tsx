import { requireAuth } from "@/lib/auth/current-user";
import { getMatrizForecast, getUnidadeForecast } from "@/lib/realizado/forecast-data";
import { getMesReferenciaAtual } from "@/lib/realizado/projecao";
import { ForecastClient } from "@/components/realizado/realizado-client";
import { RealizadoEmpty } from "@/components/realizado/realizado-empty";

export const metadata = {
  title: "Forecast 2026 · V4 GTM OS",
};

export const dynamic = "force-dynamic";

export default async function RealizadoPage() {
  const session = await requireAuth();
  // Mês de referência na chave do cache → vira o cache na virada de mês (o motor
  // decide meses fechados por `new Date()`).
  const mesRef = getMesReferenciaAtual();
  const matrizOrgId =
    session.availableOrganizations.find((o) => o.type === "matriz")?.id ?? null;

  if (session.actingMode === "matriz") {
    const unidades = session.availableOrganizations.filter((o) => o.type === "unidade");
    if (unidades.length === 0) {
      return <RealizadoEmpty mode="matriz-sem-unidades" />;
    }
    const descriptors = unidades.map((u) => ({
      id: u.id,
      horizonteAtual: u.horizonteAtual,
      dataInicio: u.dataInicio,
    }));
    const data = await getMatrizForecast(descriptors, matrizOrgId, mesRef);
    return (
      <ForecastClient
        mode="matriz"
        organizationName="Consolidado da rede"
        unitCount={unidades.length}
        {...data}
      />
    );
  }

  const unitOrg =
    session.activeOrganization ??
    session.availableOrganizations.find((o) => o.type === "unidade") ??
    null;
  if (!unitOrg) return <RealizadoEmpty mode="unidade-sem-org" />;

  const data = await getUnidadeForecast(
    unitOrg.id,
    unitOrg.horizonteAtual,
    unitOrg.dataInicio,
    matrizOrgId,
    mesRef,
  );

  return (
    <ForecastClient
      mode="unidade"
      organizationId={unitOrg.id}
      organizationName={unitOrg.name}
      horizonteAtual={unitOrg.horizonteAtual}
      dataInicio={unitOrg.dataInicio}
      {...data}
    />
  );
}
