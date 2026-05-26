"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Pencil } from "lucide-react";
import type { Organization } from "@/db/schema";
import {
  HORIZONTES,
  ORG_STATUS,
  REGIONAIS,
  regionalLabel,
  type Horizonte,
  type OrgStatus,
  type RegionalSigla,
} from "@/lib/validations/organizations";
import { PermissionGate } from "@/components/permission-gate";
import { FieldHelp } from "@/components/ui/field-help";
import { AddUnitModal } from "./add-unit-modal";
import { EditUnitModal } from "./edit-unit-modal";
import { HorizonteBadge, StatusBadge } from "./badges";

type Props = {
  initialUnits: Organization[];
  /** % de preenchimento do wizard /iniciar por unidade. Matriz nunca aparece aqui. */
  setupCompletionByOrgId: Record<string, number>;
};

const statusOptionLabel: Record<OrgStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
};

export function UnidadesClient({ initialUnits, setupCompletionByOrgId }: Props) {
  const [horizonteFilter, setHorizonteFilter] = useState<Horizonte | "all">("all");
  const [statusFilter, setStatusFilter] = useState<OrgStatus | "all">("all");
  const [regionalFilter, setRegionalFilter] = useState<RegionalSigla | "all">("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<Organization | null>(null);

  const filtered = useMemo(() => {
    return initialUnits.filter((u) => {
      if (horizonteFilter !== "all" && u.horizonteAtual !== horizonteFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (regionalFilter !== "all" && u.regional !== regionalFilter) return false;
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const haystack = [
          u.name,
          u.slug,
          u.socioExecutivoNome,
          u.regional,
          u.estado,
          u.cidade,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [initialUnits, horizonteFilter, statusFilter, regionalFilter, search]);

  const isEmpty = initialUnits.length === 0;
  const noResults = !isEmpty && filtered.length === 0;

  return (
    <>
      {/* Header da página */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <h1 className="text-xl font-semibold text-foreground">Unidades da rede</h1>
        <PermissionGate action="organization.create">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Adicionar unidade
          </button>
        </PermissionGate>
      </div>

      {/* Filtros */}
      {!isEmpty && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar:</span>

          <select
            value={horizonteFilter}
            onChange={(e) =>
              setHorizonteFilter(e.target.value as Horizonte | "all")
            }
            className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos horizontes</option>
            {HORIZONTES.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrgStatus | "all")}
            className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos status</option>
            {ORG_STATUS.map((s) => (
              <option key={s} value={s}>
                {statusOptionLabel[s]}
              </option>
            ))}
          </select>

          <select
            value={regionalFilter}
            onChange={(e) =>
              setRegionalFilter(e.target.value as RegionalSigla | "all")
            }
            className="h-8 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            title="Filtrar por regional V4 (gerente regional responsável)"
          >
            <option value="all">Todas regionais</option>
            {REGIONAIS.map((r) => (
              <option key={r.sigla} value={r.sigla}>
                {r.sigla} — {r.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome, sócio, regional, cidade…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-72 rounded border border-input bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filtered.length} de {initialUnits.length}
          </div>
        </div>
      )}

      {/* Conteúdo: empty / no-results / tabela */}
      {isEmpty ? (
        <EmptyState onCreate={() => setModalOpen(true)} />
      ) : noResults ? (
        <NoResults />
      ) : (
        <UnitsTable
          units={filtered}
          setupCompletionByOrgId={setupCompletionByOrgId}
          onEdit={setEditUnit}
        />
      )}

      <AddUnitModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <EditUnitModal unit={editUnit} onClose={() => setEditUnit(null)} />
    </>
  );
}

function UnitsTable({
  units,
  setupCompletionByOrgId,
  onEdit,
}: {
  units: Organization[];
  setupCompletionByOrgId: Record<string, number>;
  onEdit: (unit: Organization) => void;
}) {
  return (
    <div className="rounded border border-border overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-30 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)]">
          <tr className="border-b">
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Nome
                <FieldHelp text="Nome público da unidade. Matriz aparece com badge especial." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Sócio Executivo
                <FieldHelp text="Pessoa responsável pela operação da unidade e e-mail principal de contato." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Regional
                <FieldHelp text="Regional V4 (sigla) a que a unidade pertence. Passe o mouse na sigla pra ver o nome do gerente regional." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Estado / Cidade
                <FieldHelp text="UF e cidade onde a unidade opera." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Horizonte
                <FieldHelp text="Etapa de maturidade da unidade (H1–H5), definida pela Matriz no cadastro." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Modelo
                <FieldHelp text="% de preenchimento do setup do modelo (wizard /iniciar). 100% = todos os steps concluídos pela unidade. Matriz não preenche modelo." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1">
                Status
                <FieldHelp text="Estado da unidade no sistema: ativo, inativo ou pendente de ativação." position="bottom" />
              </span>
            </th>
            <th className="bg-table-header text-table-header-foreground h-8 font-medium text-right px-3 py-1.5 text-[10px] uppercase tracking-wider">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {units.map((u, idx) => (
            <tr
              key={u.id}
              className={`${idx % 2 === 0 ? "bg-card" : "bg-muted/30"} border-b hover:bg-muted transition-colors`}
            >
              <td className="px-3 py-1.5 text-xs">
                <a href={`/unidades/${u.id}`} className="font-medium hover:underline">
                  {u.name}
                </a>
                {u.type === "matriz" && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-accent text-accent-foreground px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider">
                    Matriz
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs">
                {u.socioExecutivoNome ? (
                  <div className="flex flex-col">
                    <span>{u.socioExecutivoNome}</span>
                    {u.socioExecutivoEmail && (
                      <span className="text-[11px] text-muted-foreground">
                        {u.socioExecutivoEmail}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs">
                {u.regional ? (
                  <span title={regionalLabel(u.regional)} className="font-mono">
                    {u.regional}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs">
                {u.estado || u.cidade ? (
                  <span>
                    {[u.cidade, u.estado].filter(Boolean).join(" / ")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs">
                <HorizonteBadge horizonte={u.horizonteAtual} />
              </td>
              <td className="px-3 py-1.5 text-xs">
                <ModeloProgress unit={u} pct={setupCompletionByOrgId[u.id]} />
              </td>
              <td className="px-3 py-1.5 text-xs">
                <StatusBadge status={u.status} />
              </td>
              <td className="px-3 py-1.5 text-xs text-right">
                {u.type === "matriz" ? (
                  <span className="text-muted-foreground/40">—</span>
                ) : (
                  <PermissionGate action="organization.update">
                    <button
                      type="button"
                      onClick={() => onEdit(u)}
                      className="inline-flex items-center gap-1 px-2 h-7 rounded text-[11px] border border-border hover:bg-muted"
                      title="Editar dados da unidade"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                  </PermissionGate>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Coluna "Modelo" — barra horizontal + percentual.
 * Matriz não preenche modelo, então renderiza um "—" discreto.
 * Cor da barra acompanha um farol simples: vermelho < 50%, amarelo 50-99%, verde 100%.
 */
function ModeloProgress({
  unit,
  pct,
}: {
  unit: Organization;
  pct: number | undefined;
}) {
  if (unit.type === "matriz") {
    return (
      <span className="text-muted-foreground" title="Matriz não preenche o modelo">
        —
      </span>
    );
  }
  const safePct = Math.max(0, Math.min(100, pct ?? 0));
  const barColor =
    safePct >= 100
      ? "bg-success"
      : safePct >= 50
        ? "bg-warning"
        : "bg-destructive";
  return (
    <div
      className="flex items-center gap-2 min-w-[8rem]"
      title={`Setup do modelo: ${safePct}% preenchido`}
    >
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${barColor} transition-[width]`}
          style={{ width: `${safePct}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground w-9 text-right">
        {safePct}%
      </span>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center bg-card border border-border rounded">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Plus className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        Nenhuma unidade cadastrada ainda
      </h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Adicione a primeira franquia para começar a estruturar a rede.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Adicionar primeira unidade
      </button>
    </div>
  );
}

function NoResults() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center bg-card border border-border rounded">
      <p className="text-sm text-muted-foreground">
        Nenhuma unidade encontrada com os filtros aplicados.
      </p>
    </div>
  );
}
