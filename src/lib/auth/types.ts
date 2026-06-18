import type { Membership, Organization, User } from "@/db/schema";

export type Role = "admin" | "gerente" | "coordenador";

/**
 * Membership "rico" — combina o vínculo com a organization a que pertence.
 * É o que o front consome via /api/auth/me.
 *
 * Quando o membership é regional (`regional` setado, `organizationId` null),
 * `organization` aponta para a Matriz (origem da delegação) e `regionalUnits`
 * traz as unidades cobertas pelo vínculo.
 */
export type MembershipWithOrg = Membership & {
  organization: Organization;
  regionalUnits: Organization[] | null;
};

/**
 * Modo "atuante" derivado da combinação isMatrizUser + activeOrganization.
 *
 * - `matriz`: vendo como matriz (consolidado da rede ou a própria org matriz).
 *   Acontece quando activeOrganization é null OU é a org matriz.
 * - `unidade`: vendo como unidade — seja porque é user de unidade, seja porque
 *   é matriz "impersonando" uma franquia via switcher. As telas devem filtrar
 *   pela activeOrganization e ocultar afford ances exclusivas da matriz.
 */
export type ActingMode = "matriz" | "unidade";

/**
 * Escopo fino do seletor global (eixo ortogonal a actingMode). Refina os 3 modos
 * "matriz-like" e é lido SÓ por bowtie/realizado (+ header/home cosmético) — NÃO
 * por permissões/nav, que seguem usando actingMode. Ver docs/escopo-seletor-4-modos.md.
 * - `geral`: matriz + todas as unidades.
 * - `todas_unidades`: só as unidades (= comportamento histórico do consolidado).
 * - `matriz_propria`: só os dados da org matriz.
 * - `unidade`: uma unidade específica.
 */
export type ScopeMode = "geral" | "todas_unidades" | "matriz_propria" | "unidade";

/**
 * Sessão do usuário ativo — o que /api/auth/me retorna.
 */
export type AuthSession = {
  user: User;
  memberships: MembershipWithOrg[];
  activeOrganization: Organization | null;
  /** True se o user tem ao menos 1 membership ativa em organization.type=matriz. */
  isMatrizUser: boolean;
  /** Lista de orgs em que o user pode atuar (todas as orgs se Matriz; apenas as próprias se Unidade). */
  availableOrganizations: Organization[];
  /** Em qual contexto o user está operando agora (deriva de isMatrizUser + activeOrganization). */
  actingMode: ActingMode;
  /** Escopo fino da visão (geral/todas_unidades/matriz_propria/unidade). Lido só por bowtie/realizado. */
  activeScope: ScopeMode;
  /** Setup da unidade concluído. SEMPRE true pra matriz-user (nunca travado) e pra
   *  visão consolidada; false só quando uma UNIDADE (não-matriz) não terminou o setup.
   *  Usado pra travar a navegação até o setup (só /usuarios + /iniciar liberadas). */
  setupConcluido: boolean;
};

/** Nome do cookie usado em dev para identificar o usuário "logado". */
export const AUTH_COOKIE_NAME = "v4_user_id";
