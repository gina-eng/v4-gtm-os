// Helpers de formatação numérica usados pela tela Premissas.
// Tudo pt-BR — separador de milhar com ponto, decimal com vírgula quando aplicável.

export function formatBRL(n: number): string {
  return `R$${Math.round(n).toLocaleString("pt-BR")}`;
}

export function formatBRLk(n: number): string {
  if (n >= 1_000_000) return `R$${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `R$${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}K`;
  return formatBRL(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

/** Retorna classe Tailwind do farol V4 baseada em % atingido. */
export function farolColorClass(pct: number): string {
  if (pct >= 120) return "text-success";
  if (pct >= 100) return "text-[hsl(142,71%,45%)]";
  if (pct >= 80) return "text-warning";
  return "text-foreground";
}
