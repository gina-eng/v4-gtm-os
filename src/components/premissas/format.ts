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

/**
 * Parser tolerante para entrada do usuário em pt-BR. Aceita "R$ 1.234,56",
 * "1.234", "1234,5", "1234.5", "15 %" e devolve o número correspondente.
 * Heurística: o último separador (vírgula ou ponto) define o decimal; os
 * anteriores são milhares.
 */
export function parseBR(s: string): number {
  if (!s) return 0;
  let cleaned = s.replace(/[^\d,.\-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma && lastComma >= 0) {
    cleaned = cleaned.replace(/,/g, "");
  } else if (lastDot >= 0 && lastComma < 0) {
    // Só pontos — ambíguo. Trata como separador de milhar (ex.: "1.234").
    cleaned = cleaned.replace(/\./g, "");
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Retorna classe Tailwind do farol V4 baseada em % atingido. */
export function farolColorClass(pct: number): string {
  if (pct >= 120) return "text-success";
  if (pct >= 100) return "text-[hsl(142,71%,45%)]";
  if (pct >= 80) return "text-warning";
  return "text-foreground";
}
