import { requireAuth } from "@/lib/auth/current-user";
import {
  getPremissasByEntityIds,
  matrizDefaultBlocks,
} from "@/db/repositories/premissas";
import { getUnitSetupsByOrgIds } from "@/db/repositories/unit-setup";
import { REALIZADO_HISTORICO_DEFAULT } from "@/lib/premissas/matriz-defaults";
import { detectarStatusHorizonte } from "@/lib/realizado/promocao";
import { KanbanClient, type UnidadeCard } from "@/components/validacao-crescimento/kanban-client";

export const metadata = {
  title: "Validação de Crescimento · V4 GTM OS",
};

export const dynamic = "force-dynamic";

export default async function ValidacaoCrescimentoPage() {
  const session = await requireAuth();

  // Página exclusiva da matriz — espelha o gate de /unidades.
  if (!session.isMatrizUser || session.actingMode !== "matriz") {
    return (
      <div className="bg-card border border-border rounded p-4">
        <h1 className="text-xl font-semibold text-foreground mb-1">Validação de Crescimento</h1>
        <p className="text-sm text-muted-foreground">
          Disponível apenas na visão consolidada da matriz.
        </p>
      </div>
    );
  }

  const unidades = session.availableOrganizations.filter((o) => o.type === "unidade");
  const ids = unidades.map((o) => o.id);

  const [blocksById, setups] = await Promise.all([
    getPremissasByEntityIds(ids),
    getUnitSetupsByOrgIds(ids),
  ]);
  const setupByOrgId = new Map(setups.map((s) => [s.organizationId, s] as const));

  const cards: UnidadeCard[] = unidades.map((u) => {
    const blocks = blocksById.get(u.id) ?? matrizDefaultBlocks();
    const realizado = setupByOrgId.get(u.id)?.realizadoHistorico ?? REALIZADO_HISTORICO_DEFAULT;
    const status = detectarStatusHorizonte(realizado, blocks.horizontes, u.horizonteAtual, {
      dataInicio: u.dataInicio,
    });
    return {
      id: u.id,
      name: u.name,
      regional: u.regional ?? null,
      horizonteAtual: u.horizonteAtual,
      status: status.status,
      horizonteSugerido: status.horizonteSugerido,
      mesesConsecutivos: status.mesesConsecutivos,
    };
  });

  return <KanbanClient cards={cards} />;
}
