import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Capacidade Operacional foi fundida ao passo "Time & Capacidade"
 * (/iniciar/time-comercial). Mantemos a rota como redirect para não quebrar
 * links/atalhos antigos nem o fluxo de `nextPendingStep`.
 */
export default async function MetricasOperacionaisRedirect() {
  redirect("/iniciar/time-comercial");
}
