import type { AuthSession } from "@/lib/auth/types";
import type { Organization } from "@/db/schema";

/**
 * Resolve o `activeScope` da sessão nos conjuntos de orgs que o bowtie/realizado
 * agregam. Fonte ÚNICA dessa resolução (bowtie e realizado consomem o mesmo) pra
 * os dois nunca divergirem no mesmo escopo. Ver docs/escopo-seletor-4-modos.md.
 *
 * - `gridOrgIds`: orgs cujo realizado_funil somar.
 * - `baldeOrgIds` + `baldeIncluiNulos`: quais linhas do balde somar (nulos =
 *   tenant não cadastrado, só no 'geral').
 * - `projetadoOrgs`: orgs sobre as quais calcular/agregar o projetado.
 * - `display`: modo do BowtieClient ('unidade' mostra editor; 'matriz' read-only).
 * - `unidadeOrg`: org única quando display='unidade'.
 */
export type ScopeResolution = {
  display: "matriz" | "unidade";
  gridOrgIds: string[];
  baldeOrgIds: string[];
  baldeIncluiNulos: boolean;
  projetadoOrgs: Organization[];
  unidadeOrg: Organization | null;
  label: string;
};

export function resolveScopeOrgs(session: AuthSession): ScopeResolution {
  const orgs = session.availableOrganizations;
  const matriz = orgs.find((o) => o.type === "matriz") ?? null;
  const unidades = orgs.filter((o) => o.type === "unidade");
  const unidadeIds = unidades.map((u) => u.id);

  switch (session.activeScope) {
    case "geral": {
      // Realizado (grid+balde) inclui a matriz + tudo → bate com o banco (5662).
      // Projetado/forecast NÃO inclui a matriz: as premissas dela são um TEMPLATE
      // (herdado pelas unidades), não um plano de venda — somá-la seria uma unidade
      // fantasma. Logo geral e todas_unidades têm o MESMO projetado; diferem só no
      // realizado (a matriz contribui realizado, não meta).
      const gridOrgIds = [...(matriz ? [matriz.id] : []), ...unidadeIds];
      return {
        display: "matriz",
        gridOrgIds,
        baldeOrgIds: gridOrgIds,
        baldeIncluiNulos: true, // tenant não cadastrado entra só aqui
        projetadoOrgs: unidades,
        unidadeOrg: null,
        label: "Resultado geral",
      };
    }
    case "matriz_propria": {
      const ids = matriz ? [matriz.id] : [];
      return {
        display: "matriz",
        gridOrgIds: ids,
        baldeOrgIds: ids,
        baldeIncluiNulos: false,
        projetadoOrgs: matriz ? [matriz] : [],
        unidadeOrg: null,
        label: matriz?.name ?? "Matriz",
      };
    }
    case "unidade": {
      const u = session.activeOrganization;
      const ids = u ? [u.id] : [];
      return {
        display: "unidade",
        gridOrgIds: ids,
        baldeOrgIds: ids,
        baldeIncluiNulos: false,
        projetadoOrgs: u ? [u] : [],
        unidadeOrg: u,
        label: u?.name ?? "Unidade",
      };
    }
    case "todas_unidades":
    default:
      return {
        display: "matriz",
        gridOrgIds: unidadeIds,
        baldeOrgIds: unidadeIds,
        baldeIncluiNulos: false,
        projetadoOrgs: unidades,
        unidadeOrg: null,
        label: "Todas Unidades",
      };
  }
}
