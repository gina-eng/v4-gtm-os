import { Fragment } from "react";
import { formatBRL, formatInt, formatPercent } from "@/components/premissas/format";
import type { ResumoCompleto, ResumoMetricas } from "@/lib/premissas/funil-reverso";
import { formatMesPt, MESES_ANO_2026 } from "@/lib/realizado/projecao";

type Props = {
  resumo: ResumoCompleto;
  /** Título do cabeçalho. Default: "Resumo do funil 2026". */
  title?: string;
};

// Larguras em % — tabela cresce/encolhe com a viewport. Label e Total
// ficam mais largos que cada mês (precisam acomodar nomes longos /
// valores totais). Soma: 14 + 12·6 + 14 = 100%.
const PCT_LABEL = "14%";
const PCT_MES = "6%";
const PCT_TOTAL = "14%";
// Piso pra evitar colunas ilegíveis em telas pequenas — abaixo disso o
// section faz scroll horizontal interno via overflow-x-auto.
const MIN_WIDTH = 1100;
const MESES = MESES_ANO_2026 as readonly string[];

type Fmt = "money" | "int" | "pct" | "ratio";

type MetricSpec = {
  field: keyof ResumoMetricas;
  label: string;
  fmt: Fmt;
  emphasize?: boolean;
  indent?: boolean;
  /** Cabeçalho de seção a renderizar ANTES desta métrica. */
  section?: string;
};

/**
 * Métricas exibidas na tabela resumo do funil 2026.
 * Ordem: investimento → funil → won por categoria → receita+TM intercalados
 * por categoria → seção "Taxas de conversão" (MQL→SQL→SAL→WON) → ROAS e CPL.
 */
const METRICAS: readonly MetricSpec[] = [
  { field: "investimentoTotal", label: "Investimento total", fmt: "money", emphasize: true },
  { field: "mql", label: "MQL", fmt: "int" },
  { field: "sql", label: "SQL", fmt: "int" },
  { field: "sal", label: "SAL", fmt: "int" },
  { field: "won", label: "WON", fmt: "int", emphasize: true },
  { field: "wonSaber", label: "WON · Saber", fmt: "int", indent: true },
  { field: "wonTer", label: "WON · Ter", fmt: "int", indent: true },
  { field: "wonExecutar", label: "WON · Executar", fmt: "int", indent: true },
  { field: "receitaTotal", label: "Receita total", fmt: "money", emphasize: true },
  { field: "receitaSaber", label: "Receita · Saber", fmt: "money", indent: true },
  { field: "tmSaber", label: "TM · Saber", fmt: "money", indent: true },
  { field: "receitaTer", label: "Receita · Ter", fmt: "money", indent: true },
  { field: "tmTer", label: "TM · Ter", fmt: "money", indent: true },
  { field: "receitaExecutar", label: "Receita · Executar", fmt: "money", indent: true },
  { field: "tmExecutar", label: "TM · Executar", fmt: "money", indent: true },
  { field: "taxaMqlSql", label: "MQL → SQL", fmt: "pct", section: "Taxas de conversão" },
  { field: "taxaSqlSal", label: "SQL → SAL", fmt: "pct" },
  { field: "taxaSalWon", label: "SAL → WON", fmt: "pct" },
  { field: "roas", label: "ROAS", fmt: "ratio", emphasize: true },
  { field: "cpl", label: "CPL (inbound)", fmt: "money" },
];

function mesCurto(mes: string): string {
  return formatMesPt(mes).split(" ")[0] ?? mes;
}

function formatar(v: number, fmt: Fmt): string {
  if (fmt === "money") return formatBRL(v);
  if (fmt === "int") return formatInt(v);
  if (fmt === "pct") return formatPercent(v * 100, 1);
  // ratio
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

/**
 * Tabela resumo do funil reverso 2026 — exibida no fim do wizard /iniciar.
 * Linhas = métricas; colunas = 12 meses + Total 2026 (taxas/ROAS/CPL do total
 * são calculados das somas, não médias mensais).
 */
export function ResumoTable({ resumo, title }: Props) {
  const byMes = new Map(resumo.meses.map((m) => [m.mes, m] as const));
  const headerTitle = title ?? "Resumo do funil 2026";

  return (
    <section className="rounded border border-border bg-card mb-4 overflow-x-auto">
      <div className="border-b border-border bg-muted/20 py-2.5 px-4">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-foreground">
          {headerTitle}
        </h3>
      </div>

      <table
        className="text-sm border-collapse table-fixed w-full"
        style={{ minWidth: MIN_WIDTH }}
      >
        <colgroup>
          <col style={{ width: PCT_LABEL }} />
          {MESES.map((m) => (
            <col key={m} style={{ width: PCT_MES }} />
          ))}
          <col style={{ width: PCT_TOTAL }} />
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 z-30 bg-table-header text-table-header-foreground px-3 py-2 text-left text-[10px] uppercase tracking-wider border-r border-border"></th>
            {MESES.map((mes) => (
              <th
                key={mes}
                className="bg-table-header text-table-header-foreground h-9 font-medium px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums"
                title={formatMesPt(mes)}
              >
                {mesCurto(mes)}
              </th>
            ))}
            <th className="bg-accent/15 text-accent h-9 px-3 py-2 text-right text-[10px] uppercase tracking-wider tabular-nums font-semibold border-l-2 border-border">
              Total 2026
            </th>
          </tr>
        </thead>
        <tbody>
          {METRICAS.map((m) => {
            const labelBg = m.emphasize ? "bg-muted/40" : "bg-card";
            const rowBg = m.emphasize ? "bg-muted/30 font-semibold" : "hover:bg-muted/20";
            const labelPad = m.indent ? "pl-8 pr-3" : "px-3";
            const totalValue = resumo.total[m.field];
            const colSpanTotal = 1 + MESES.length + 1;
            return (
              <Fragment key={m.field}>
                {m.section && (
                  <tr className="border-y border-border">
                    <td colSpan={colSpanTotal} className="bg-muted py-1.5">
                      <span className="sticky left-0 inline-block px-3 text-[10px] uppercase tracking-wider font-semibold text-foreground">
                        {m.section}
                      </span>
                    </td>
                  </tr>
                )}
                <tr className={`border-b border-border/60 ${rowBg}`}>
                  <td
                    className={`sticky left-0 z-10 ${labelBg} border-r border-border ${labelPad} py-2 text-xs text-foreground font-medium`}
                  >
                    {m.label}
                  </td>
                  {MESES.map((mes) => {
                    const linha = byMes.get(mes);
                    const v = linha ? linha[m.field] : 0;
                    const fechado = linha?.isFechado ?? false;
                    return (
                      <td
                        key={mes}
                        className={`px-3 py-2 text-xs text-right tabular-nums ${
                          fechado ? "bg-info/5" : ""
                        } ${v === 0 ? "text-muted-foreground/40" : "text-muted-foreground"}`}
                        title={fechado ? "Mês fechado (realizado)" : undefined}
                      >
                        {v === 0 ? "—" : formatar(v, m.fmt)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-xs text-right tabular-nums bg-accent/10 font-semibold text-foreground border-l-2 border-border">
                    {totalValue === 0 ? "—" : formatar(totalValue, m.fmt)}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
