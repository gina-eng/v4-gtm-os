import type { Horizonte, OrgStatus } from "@/lib/validations/organizations";

const horizonteColors: Record<Horizonte, string> = {
  H1: "bg-muted text-muted-foreground border-border",
  H2: "bg-sky-100 text-sky-900 border-sky-200",
  H3: "bg-blue-100 text-blue-900 border-blue-200",
  H4: "bg-purple-100 text-purple-900 border-purple-200",
  H5: "bg-red-100 text-red-900 border-red-200",
};

export function HorizonteBadge({ horizonte }: { horizonte: Horizonte }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${horizonteColors[horizonte]}`}
    >
      {horizonte}
    </span>
  );
}

const statusLabel: Record<OrgStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

const statusColors: Record<OrgStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/15 text-warning-foreground border-warning/40",
};

export function StatusBadge({ status }: { status: OrgStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColors[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

/**
 * Tempo relativo em pt-BR. Ex: "há 2 horas", "há 3 dias".
 */
export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);

  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 3600],
    ["month", 30 * 24 * 3600],
    ["day", 24 * 3600],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [unit, sec] of units) {
    if (Math.abs(diffSec) >= sec || unit === "second") {
      return rtf.format(-Math.round(diffSec / sec), unit);
    }
  }
  return "agora";
}
