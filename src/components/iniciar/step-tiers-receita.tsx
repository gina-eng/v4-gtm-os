"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { CurrencyCell, NullableCurrencyCell, PercentCell } from "@/components/premissas/editable-cell";
import { formatBRL, formatPercent } from "@/components/premissas/format";
import { FieldHelp } from "@/components/ui/field-help";
import { WizardFooter } from "./wizard-footer";
import type { ReceitaProduto, TierCliente } from "@/lib/premissas/matriz-defaults";

type Props = {
  organizationId: string;
  initialProdutos: ReceitaProduto[];
  /** Tiers de Cliente são fixados pela Matriz — não editáveis na unidade. */
  matrizTiers: TierCliente[];
  matrizProdutos: ReceitaProduto[];
  fromMatriz: boolean;
};

function tcvPond(p: ReceitaProduto): number {
  return (
    (p.saberPct / 100) * p.saberAt +
    (p.terPct / 100) * p.terAt +
    (p.execPct / 100) * p.execAt
  );
}

function somaAdesao(p: ReceitaProduto): number {
  return p.saberPct + p.terPct + p.execPct;
}

export function StepTiersReceita({
  organizationId,
  initialProdutos,
  matrizTiers,
  matrizProdutos,
  fromMatriz,
}: Props) {
  const router = useRouter();
  // Tiers de Cliente vêm 100% da Matriz e são somente leitura na unidade —
  // unidade não negocia faixa de faturamento, TCV, CPL nem o conjunto de tiers.
  const tiers = matrizTiers;
  const [produtos, setProdutos] = useState<ReceitaProduto[]>(initialProdutos);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invariante P3: Saber% + Ter% + Executar% deve somar 100% em cada tier.
  const linhasInvalidas = produtos.filter((r) => Math.abs(somaAdesao(r) - 100) > 0.5);
  const podeSalvar = linhasInvalidas.length === 0;

  function patchProduto<K extends keyof ReceitaProduto>(idx: number, k: K, v: ReceitaProduto[K]) {
    setProdutos((prev) => prev.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  }

  async function handleContinue() {
    if (saving) return;
    if (!podeSalvar) {
      setError(
        `Adesão por produto deve somar 100% em cada tier. Ajuste: ${linhasInvalidas
          .map((r) => `${r.tier} (${somaAdesao(r).toFixed(0)}%)`)
          .join(", ")}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // tcvBooking é ponderado pela receita realizada por produto — calculado a partir de P3.
      const prodByTier = new Map(produtos.map((p) => [p.tier, p] as const));
      const tiersComputed = tiers.map((t) => {
        const prod = prodByTier.get(t.tier);
        return { ...t, tcvBooking: prod ? tcvPond(prod) : t.tcvBooking };
      });
      const res = await fetch(`/api/units/${organizationId}/setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "tiers-receita",
          // Tiers seguem fixos da Matriz; apenas Receita por Produto é editável.
          data: { tiers: tiersComputed, produtos },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Não foi possível salvar.");
        return;
      }
      router.push("/iniciar/leads-investimento");
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
        <h2 className="text-lg font-semibold text-foreground">4 · Tiers & Receita</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Os tiers de cliente são definidos pela Matriz (visualização abaixo). Você ajusta apenas a composição de <strong>receita por produto</strong> para a realidade da sua unidade.
        </p>
      </div>

      <div className="mb-4 rounded border border-info/30 bg-info/5 px-3 py-2 flex items-center gap-2 text-xs text-foreground">
        <Info className="h-3.5 w-3.5 text-info shrink-0" />
        <span>
          A tabela de <strong>Tiers de Cliente</strong> é apenas referência. Preencha a tabela de <strong>Receita por Produto</strong> abaixo
          {fromMatriz
            ? " — valores pré-preenchidos com os defaults da Matriz."
            : " — o badge ao lado do campo mostra o delta em relação à premissa da Matriz."}
        </span>
      </div>

      {/* ============= TIERS (read-only — definidos pela Matriz) ============= */}
      <section className="rounded border border-border bg-card overflow-hidden mb-5">
        <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Tiers de Cliente
          </h3>
          <span className="inline-flex items-center rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider whitespace-nowrap">
            Somente leitura · Matriz
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Tier
                    <FieldHelp text="Classificação do cliente por porte: Tiny → Small → Medium → Large → Enterprise. Determina mix de produtos e CPL." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Fat. Min
                    <FieldHelp text="Piso da faixa de faturamento anual do cliente neste tier (em R$)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Fat. Máx
                    <FieldHelp text="Teto da faixa (em R$). Marque 'Sem teto' para faixas abertas à direita (ex: Enterprise R$500M+)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    TCV-Booking Pond.
                    <FieldHelp text="TCV Booking Ponderado pela receita realizada por produto (Saber% × Saber TM) + (Ter% × Ter TM) + (Executar% × Executar TM). Calculado automaticamente a partir de P3." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    CPMQL LB
                    <FieldHelp text="Custo Por MQL via Lead Broker — leads de mídia paga inbound (Meta/Google)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    CPMQL BB
                    <FieldHelp text="Custo Por MQL via Black Box — outbound estruturado (SDR/BDR + ferramentas). Padrão R$700." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    CPMQL MT
                    <FieldHelp text="Custo Por MQL via Meeting Broker — inbound de eventos. Default = custo SQL (R$5.000)." position="bottom" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((r, idx) => {
                const prod = produtos.find((p) => p.tier === r.tier);
                const tcvBookingPond = prod ? tcvPond(prod) : r.tcvBooking;
                return (
                  <tr
                    key={r.tier}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs font-medium text-accent">{r.tier}</td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell
                        isEditing={false}
                        value={r.faturamentoMin}
                        onChange={() => {}}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <NullableCurrencyCell
                        isEditing={false}
                        value={r.faturamentoMax}
                        onChange={() => {}}
                      />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing={false} value={tcvBookingPond} onChange={() => {}} />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing={false} value={r.cplLb} onChange={() => {}} />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing={false} value={r.cplBb} onChange={() => {}} />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing={false} value={r.cpmqlMt} onChange={() => {}} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============= RECEITA POR PRODUTO ============= */}
      <section className="rounded border border-border bg-card overflow-hidden">
        <header className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <span aria-hidden className="inline-block w-0.5 h-3.5 bg-accent rounded-sm" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Receita por Produto / Tier
          </h3>
        </header>
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/60">
          % de adesão por tier × ticket médio (AT). TCV Ponderado = soma ponderada.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Tier
                    <FieldHelp text="Mesmo tier da seção acima — porte do cliente." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Saber %
                    <FieldHelp text="% dos clientes deste tier que adquirem o produto Saber (consultoria/estratégia)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Saber TM
                    <FieldHelp text="Ticket Médio — ticket médio do produto Saber neste tier." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Ter %
                    <FieldHelp text="% dos clientes deste tier que adquirem o produto Ter (ferramentas/tech)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Ter TM
                    <FieldHelp text="Ticket Médio — ticket médio do produto Ter neste tier." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Executar %
                    <FieldHelp text="% dos clientes deste tier que adquirem o produto Executar (execução de marketing)." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Executar TM
                    <FieldHelp text="Ticket Médio — ticket médio do produto Executar neste tier." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Soma %
                    <FieldHelp text="Soma de Saber% + Ter% + Executar% no tier. Deve totalizar 100%." position="bottom" />
                  </span>
                </th>
                <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-2 py-1.5 text-[10px] uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1 justify-end">
                    TCV Pond.
                    <FieldHelp text="TCV Ponderado: (Saber% × Saber TM) + (Ter% × Ter TM) + (Executar% × Executar TM). Calculado automaticamente." position="bottom" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((r, idx) => {
                const soma = somaAdesao(r);
                const somaOk = Math.abs(soma - 100) < 0.5;
                return (
                  <tr
                    key={r.tier}
                    className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b border-border/60`}
                  >
                    <td className="px-2 py-2 text-xs font-medium text-accent">{r.tier}</td>
                    <td className="px-2 py-2 text-xs text-right">
                      <PercentCell isEditing value={r.saberPct} matrizValue={matrizProdutos[idx]?.saberPct} onChange={(v) => patchProduto(idx, "saberPct", v)} digits={0} lockableZero />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing value={r.saberAt} matrizValue={matrizProdutos[idx]?.saberAt} onChange={(v) => patchProduto(idx, "saberAt", v)} lockableZero />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <PercentCell isEditing value={r.terPct} matrizValue={matrizProdutos[idx]?.terPct} onChange={(v) => patchProduto(idx, "terPct", v)} digits={0} lockableZero />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing value={r.terAt} matrizValue={matrizProdutos[idx]?.terAt} onChange={(v) => patchProduto(idx, "terAt", v)} lockableZero />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <PercentCell isEditing value={r.execPct} matrizValue={matrizProdutos[idx]?.execPct} onChange={(v) => patchProduto(idx, "execPct", v)} digits={0} lockableZero />
                    </td>
                    <td className="px-2 py-2 text-xs text-right">
                      <CurrencyCell isEditing value={r.execAt} matrizValue={matrizProdutos[idx]?.execAt} onChange={(v) => patchProduto(idx, "execAt", v)} lockableZero />
                    </td>
                    <td
                      className={`px-2 py-2 text-xs text-right tabular-nums font-medium ${
                        somaOk ? "text-success" : "text-destructive"
                      }`}
                      title={somaOk ? undefined : `Soma deve ser 100% — atual ${soma.toFixed(0)}%.`}
                    >
                      {formatPercent(soma, 0)}
                    </td>
                    <td className="px-2 py-2 text-xs text-right tabular-nums font-medium text-success">
                      {formatBRL(tcvPond(r))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!podeSalvar && (
          <div className="px-4 py-2 text-[11px] text-destructive border-t border-border bg-destructive/5">
            A adesão por produto deve somar 100% em cada tier. Ajuste antes de continuar: {linhasInvalidas
              .map((r) => `${r.tier} (${somaAdesao(r).toFixed(0)}%)`)
              .join(", ")}.
          </div>
        )}
      </section>

      <WizardFooter
        onBack={() => router.push("/iniciar/metricas-operacionais")}
        onContinue={handleContinue}
        saving={saving}
        error={error}
      />
    </>
  );
}
