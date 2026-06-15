"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock } from "lucide-react";
import { PercentCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatPercent } from "@/components/premissas/format";
import { WizardFooter } from "./wizard-footer";
import type {
  DistMercado,
  Horizonte,
  InvestimentoMidia,
} from "@/lib/premissas/matriz-defaults";

type Props = {
  organizationId: string;
  /** Horizonte da unidade — define quais tiers já estão ativos para edição. */
  horizonteAtual: Horizonte;
  initialDist: DistMercado[];
  initialInvest: InvestimentoMidia[];
  matrizDist: DistMercado[];
  matrizInvest: InvestimentoMidia[];
  fromMatriz: boolean;
};

const HORIZONTES: Horizonte[] = ["H1", "H2", "H3", "H4", "H5"];

/**
 * Custo por SQL via Meeting Broker — referência travada da Matriz (P2.cpmqlMt = R$5.000).
 * A unidade só visualiza; a edição fica na Matriz. Herança na camada de dados é follow-up.
 */
const CUSTO_SQL_MT_MATRIZ = 5_000;

function horizonteIndex(h: Horizonte): number {
  return HORIZONTES.indexOf(h);
}

/** Tier está ativo na unidade se já entrou em algum horizonte ≤ horizonteAtual. */
function tierAtivo(entra: Horizonte, atual: Horizonte): boolean {
  return horizonteIndex(entra) <= horizonteIndex(atual);
}

export function StepLeadsInvestimento({
  organizationId,
  horizonteAtual,
  initialDist,
  initialInvest,
  matrizDist,
  matrizInvest,
  fromMatriz,
}: Props) {
  const router = useRouter();

  // Quando a unidade ainda não personalizou (fromMatriz), renormalizamos a
  // distribuição de mercado da Matriz para o horizonte atual: apenas os tiers
  // ativos somam 100%. Tiers ainda travados ficam com 0%.
  const [dist, setDist] = useState<DistMercado[]>(() => {
    if (!fromMatriz) return initialDist;
    const activeTotal = initialDist
      .filter((r) => tierAtivo(r.entraHorizonte, horizonteAtual))
      .reduce((acc, r) => acc + r.pctMercado, 0);
    if (activeTotal <= 0) return initialDist;
    return initialDist.map((r) =>
      tierAtivo(r.entraHorizonte, horizonteAtual)
        ? { ...r, pctMercado: (r.pctMercado / activeTotal) * 100 }
        : { ...r, pctMercado: 0 },
    );
  });
  const [invest, setInvest] = useState<InvestimentoMidia[]>(initialInvest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchDist<K extends keyof DistMercado>(idx: number, k: K, v: DistMercado[K]) {
    setDist((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }
  function patchInvest<K extends keyof InvestimentoMidia>(idx: number, k: K, v: InvestimentoMidia[K]) {
    setInvest((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }

  // TOTAL considera apenas os tiers ativos no horizonte atual — esses devem
  // somar 100%. Tiers ainda não ativos não contribuem operacionalmente.
  const totalMercado = dist
    .filter((r) => tierAtivo(r.entraHorizonte, horizonteAtual))
    .reduce((acc, r) => acc + r.pctMercado, 0);

  async function handleContinue() {
    if (saving) return;
    const splitsInvalidos = invest.filter(
      (r) => r.splitLb + r.splitBb + r.splitMt + r.splitEv > 100.5,
    );
    if (splitsInvalidos.length > 0) {
      setError(
        `Split LB + BB + MT + EV deve ser ≤ 100% em cada horizonte. Ajuste: ${splitsInvalidos
          .map(
            (r) =>
              `${r.h} (${(r.splitLb + r.splitBb + r.splitMt + r.splitEv).toFixed(1)}%)`,
          )
          .join(", ")}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "leads-investimento",
          data: { distMercado: dist, investimentoMidia: invest },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      router.push("/iniciar/conversoes-inbound");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">5 · Leads & Investimento</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Distribuição de leads por tier e estratégia de investimento em mídia por horizonte.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          Sua unidade está em <strong className="text-accent">{horizonteAtual}</strong>. Apenas tiers já ativos neste horizonte são editáveis — os demais ficam travados até a unidade evoluir.
          {fromMatriz
            ? " Valores pré-preenchidos vêm das premissas da Matriz."
            : " O badge ao lado do campo mostra o delta vs. premissa da Matriz."}
        </span>
      </div>

      {/* ============= DISTRIBUIÇÃO DE LEADS ============= */}
      <section className="rounded border border-border bg-card overflow-hidden mb-5">
        <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Distribuição de Tier por Horizonte
          </h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Tier
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    % Distribuição
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Entra em
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dist.map((r, idx) => {
                const ativo = tierAtivo(r.entraHorizonte, horizonteAtual);
                return (
                  <tr
                    key={r.tier}
                    className={`${
                      ativo
                        ? idx % 2 === 0
                          ? "bg-card"
                          : "bg-muted/30"
                        : "bg-muted/10 text-muted-foreground"
                    } border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs font-medium">
                      <span className={ativo ? "text-accent" : "text-muted-foreground"}>
                        {r.tier}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      {ativo ? (
                        <PercentCell
                          isEditing
                          value={r.pctMercado}
                          matrizValue={matrizDist[idx]?.pctMercado}
                          onChange={(v) => patchDist(idx, "pctMercado", v)}
                          digits={1}
                        />
                      ) : (
                        <span
                          title={`Tier ${r.tier} entra a partir de ${r.entraHorizonte}. Sua unidade está em ${horizonteAtual}.`}
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70"
                        >
                          <Lock className="h-2.5 w-2.5" />
                          Disponível em {r.entraHorizonte}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <span className="text-muted-foreground">{r.entraHorizonte}</span>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/40 font-medium">
                <td className="px-2 py-2 text-xs text-foreground">
                  TOTAL (tiers ativos em {horizonteAtual})
                </td>
                <td
                  className={`px-2 py-2 text-xs text-right tabular-nums ${
                    Math.abs(totalMercado - 100) < 0.5 ? "text-success" : "text-destructive"
                  }`}
                >
                  {formatPercent(totalMercado, 1)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ============= INVESTIMENTO EM MÍDIA ============= */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Investimento em Mídia por Horizonte
          </h3>
        </header>
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/60">
          % Investimento = parcela do faturamento investida em mídia. Define a divisão entre Lead Broker, Black Box, Meeting Broker e Eventos.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Horizonte
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    % Investimento
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Split LB
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Split BB
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Split MT
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Split EV
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Custo/SQL (MT)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invest.map((r, idx) => (
                <tr
                  key={r.h}
                  className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                >
                  <td className="px-2 py-2 text-xs font-medium text-accent">{r.h}</td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell isEditing value={r.pctProducao} matrizValue={matrizInvest[idx]?.pctProducao} onChange={(v) => patchInvest(idx, "pctProducao", v)} />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell isEditing value={r.splitLb} matrizValue={matrizInvest[idx]?.splitLb} onChange={(v) => patchInvest(idx, "splitLb", v)} />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell
                      isEditing
                      value={r.splitBb}
                      matrizValue={matrizInvest[idx]?.splitBb}
                      onChange={(v) => patchInvest(idx, "splitBb", v)}
                      lockableZero
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell
                      isEditing
                      value={r.splitMt}
                      matrizValue={matrizInvest[idx]?.splitMt}
                      onChange={(v) => patchInvest(idx, "splitMt", v)}
                      lockableZero
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <PercentCell
                      isEditing
                      value={r.splitEv}
                      matrizValue={matrizInvest[idx]?.splitEv}
                      onChange={(v) => patchInvest(idx, "splitEv", v)}
                      lockableZero
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-right">
                    <span
                      title="Custo por SQL via Meeting Broker — referência da Matriz (travado)"
                      className="inline-flex items-center justify-end gap-1 w-full tabular-nums text-muted-foreground"
                    >
                      <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                      {formatBRL(CUSTO_SQL_MT_MATRIZ)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <WizardFooter
        onBack={() => router.push("/iniciar/tiers-receita")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}
