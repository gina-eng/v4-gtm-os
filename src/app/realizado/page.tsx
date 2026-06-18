import { requireAuth } from "@/lib/auth/current-user";
import { getMatrizForecast, getUnidadeForecast } from "@/lib/realizado/forecast-data";
import { getMesReferenciaAtual } from "@/lib/realizado/projecao";
import { resolveScopeOrgs } from "@/lib/realizado/scope";
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

  // Mesmo escopo do bowtie (geral / todas_unidades / matriz_propria / unidade).
  // ⚠️ O "realizado" do forecast vem do realizado_historico (setup), NÃO do
  // realizado_funil/balde do bowtie — então aqui o escopo só decide QUAIS orgs
  // consolidar; os números são do modelo de forecast, não do extrato.
  const scope = resolveScopeOrgs(session);

  if (scope.display === "unidade") {
    const unitOrg = scope.unidadeOrg;
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

  if (scope.projetadoOrgs.length === 0) {
    return <RealizadoEmpty mode="matriz-sem-unidades" />;
  }
  const descriptors = scope.projetadoOrgs.map((u) => ({
    id: u.id,
    horizonteAtual: u.horizonteAtual,
    dataInicio: u.dataInicio,
  }));
  const data = await getMatrizForecast(descriptors, matrizOrgId, mesRef);
  return (
    <ForecastClient
      mode="matriz"
      organizationName={scope.label}
      unitCount={scope.projetadoOrgs.length}
      {...data}
    />
  );
}
