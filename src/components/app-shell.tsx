"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ClipboardList,
  FlagTriangleRight,
  LayoutDashboard,
  LineChart,
  Lock,
  LogOut,
  Network,
  Rocket,
  PanelLeft,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";
import { V4Logo } from "@/design-system/components/V4Logo";
import { useSession } from "@/lib/auth/auth-context";
import { OrgSwitcher } from "@/components/org-switcher";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/realizado", label: "Forecast", icon: LineChart },
  { href: "/bowtie", label: "Funil Bowtie", icon: Workflow },
  { href: "/time-comercial", label: "Time Comercial", icon: UserCog },
  { href: "/unidades", label: "Unidades", icon: Building2 },
  { href: "/validacao-crescimento", label: "Validação de Crescimento", icon: TrendingUp },
  { href: "/usuarios", label: "Usuários", icon: Users },
  { href: "/premissas", label: "Premissas", icon: SlidersHorizontal },
  { href: "/premissas-unidade", label: "Premissas da Unidade", icon: ClipboardList },
  { href: "/mapa-estrategico", label: "Mapa Estratégico", icon: Target, disabled: true },
  { href: "/em-breve", label: "Em breve", icon: FlagTriangleRight, disabled: true },
];

const roleLabel: Record<string, string> = {
  admin: "Admin",
  gerente: "Gerente",
  coordenador: "Coordenador",
};

// Cores do badge de horizonte no header — mesma paleta do HorizonteBadge
// (src/components/unidades/badges.tsx) só que ligeiramente maior pra aparecer
// ao lado do nome da unidade em destaque.
const horizonteHeaderColors: Record<string, string> = {
  H1: "bg-muted text-muted-foreground border-border",
  H2: "bg-sky-100 text-sky-900 border-sky-200",
  H3: "bg-blue-100 text-blue-900 border-blue-200",
  H4: "bg-purple-100 text-purple-900 border-purple-200",
  H5: "bg-red-100 text-red-900 border-red-200",
};

/**
 * Shell global V4 — sidebar + header (h-12) + slot pro conteúdo.
 * Aplicado via `src/app/layout.tsx` para que toda rota herde automaticamente.
 *
 * Estado da sidebar:
 * - `collapsed=false` (default): w-64, labels visíveis, ocupa espaço no layout.
 * - `collapsed=true`: rail w-14 com só ícones. No hover do mouse, expande para
 *   w-64 como overlay absoluto (sem reflow do conteúdo); recolhe ao sair.
 * - Logo da V4 sempre visível em ambos os modos.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Default colapsado pra dar mais espaço horizontal ao conteúdo (tabelas
   // largas como /premissas). User pode expandir pelo botão PanelLeft.
  const [collapsed, setCollapsed] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const session = useSession();

  // Sidebar mostra labels quando: usuário deixou expandido, OU está em hover-expand.
  const showLabels = !collapsed || hovering;
  // Aside vira overlay absoluto só quando o user fechou e está com o mouse em cima.
  const isOverlay = collapsed && hovering;

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // Full-nav (não router.push): o cookie acabou de ser limpo; soft-nav podia
      // re-resolver a sessão antiga e dar tela branca no caminho logout→login.
      window.location.href = "/login";
      return;
    } finally {
      setLoggingOut(false);
    }
  }

  // Membership "principal" mostrado no header (preferindo Matriz, depois primeira unidade)
  const primaryMembership =
    session.memberships.find((m) => m.organization.type === "matriz") ??
    session.memberships[0];

  // Org exibida no header: a ativa (se houver) tem prioridade — assim o matriz
  // vê a unidade que está visualizando no momento. Sem ativa, cai no primary.
  const displayedOrg = session.activeOrganization ?? primaryMembership?.organization;

  // Rótulo do escopo no header: 'geral'/'todas_unidades' não têm org ativa (ambos
  // cairiam no nome da matriz), então derivamos do activeScope. Ver org-switcher.
  const scopeLabel =
    session.activeScope === "geral"
      ? "Resultado geral"
      : session.activeScope === "todas_unidades"
        ? "Todas Unidades"
        : (session.activeOrganization?.name ?? displayedOrg?.name ?? "");

  const isUnidade = session.actingMode === "unidade";
  // Unidade com setup incompleto: trava TODA a nav menos /usuarios (e o link
  // "Concluir setup"). setupConcluido já é true pra matriz, então isto só afeta
  // unidade. O bloqueio real é no layout server; aqui é a affordance visual.
  const setupTravado = !session.setupConcluido;

  // Renderiza um item da nav (link ativo ou botão desabilitado "breve").
  // Extraído pra reaproveitar tanto na lista principal quanto no rodapé.
  function renderNavItem(item: NavItem) {
    const Icon = item.icon;
    // Visto de uma unidade, "Premissas" são as da Matriz; na própria
    // matriz fica só "Premissas".
    const label =
      item.href === "/premissas" && isUnidade ? "Premissas Matriz" : item.label;
    // Travado pelo setup: tudo menos /usuarios fica desabilitado até concluir.
    if (setupTravado && item.href !== "/usuarios") {
      return (
        <li key={item.href}>
          <button
            disabled
            title={`Conclua o setup da unidade pra liberar${!showLabels ? ` — ${label}` : ""}`}
            className={`flex items-center gap-2 rounded-md h-8 w-full text-sidebar-foreground opacity-35 cursor-not-allowed whitespace-nowrap ${
              showLabels ? "p-2 text-left" : "justify-center"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {showLabels && (
              <>
                <span className="flex-1">{label}</span>
                <Lock className="h-3 w-3 text-muted-foreground/60" />
              </>
            )}
          </button>
        </li>
      );
    }
    if (item.disabled) {
      return (
        <li key={item.href}>
          <button
            disabled
            title={!showLabels ? label : undefined}
            className={`flex items-center gap-2 rounded-md h-8 w-full text-sidebar-foreground opacity-35 cursor-not-allowed whitespace-nowrap ${
              showLabels ? "p-2 text-left" : "justify-center"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {showLabels && (
              <>
                <span className="flex-1">{label}</span>
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                  breve
                </span>
              </>
            )}
          </button>
        </li>
      );
    }
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={!showLabels ? label : undefined}
          className={`flex items-center gap-2 rounded-md h-8 whitespace-nowrap ${
            showLabels ? "p-2" : "justify-center"
          } ${
            active
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {showLabels && <span>{label}</span>}
        </Link>
      </li>
    );
  }

  // Itens da nav principal. Filtra telas exclusivas de matriz/unidade e, na
  // visão de unidade, remove "Premissas Matriz" daqui — ele desce pro rodapé.
  const topNavItems = navItems.filter((item) => {
    // Telas exclusivas da matriz consolidada.
    if (["/unidades", "/validacao-crescimento"].includes(item.href)) {
      return session.isMatrizUser && session.actingMode === "matriz";
    }
    // Revisão do setup é específica da unidade ativa.
    if (item.href === "/premissas-unidade") {
      return isUnidade;
    }
    // Em unidade, "Premissas Matriz" sai da lista e vai pro rodapé do menu.
    if (item.href === "/premissas") {
      return !isUnidade;
    }
    return true;
  });

  // Item "Premissas Matriz" fixado no rodapé da sidebar (só na visão de unidade).
  const premissasMatrizItem = isUnidade
    ? navItems.find((i) => i.href === "/premissas")
    : undefined;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* ====================  SIDEBAR  ====================
          Wrapper externo reserva espaço no layout (w-14 quando colapsado, w-64
          quando expandido). O <aside> interno é absolute para poder virar overlay
          em hover-expand sem empurrar o conteúdo.
          z-[60] no wrapper + aside pra que o sidebar SEMPRE fique acima do
          conteúdo da <main>, inclusive de elementos sticky com z-50 (corner
          cell da tabela, header de meses, etc). z-[60] > qualquer z usado em
          conteúdo de página. */}
      <div
        className={`${collapsed ? "w-14" : "w-64"} shrink-0 relative z-[60] transition-[width] duration-200 ease-in-out`}
      >
        <aside
          onMouseEnter={() => collapsed && setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={`absolute inset-y-0 left-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out z-[60] ${
            showLabels ? "w-64" : "w-14"
          } ${isOverlay ? "shadow-2xl" : ""}`}
        >
          {/* Logo header — V4Logo sempre visível, texto some no rail */}
          <div className={`h-12 flex items-center gap-2 border-b border-sidebar-border whitespace-nowrap shrink-0 ${showLabels ? "px-4" : "px-3 justify-center"}`}>
            <V4Logo className="h-6 w-6 shrink-0" />
            {showLabels && (
              <span className="text-sm font-semibold text-sidebar-foreground">V4 GTM OS</span>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-x-hidden overflow-y-auto p-2">
            {/* Header "Navegação" sempre presente pra reservar altura — texto
                fica invisível no modo rail, mas o espaço continua ocupado
                pros ícones abaixo ficarem na mesma posição vertical em
                ambos os modos (rail e expandido). */}
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 py-2">
              <span className={showLabels ? "" : "invisible"}>Navegação</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {/* Caminho de volta ao wizard enquanto o setup não conclui — sempre
                  liberado (o resto fica travado). */}
              {setupTravado && (
                <li>
                  <Link
                    href="/iniciar"
                    title={!showLabels ? "Concluir setup" : undefined}
                    className={`flex items-center gap-2 rounded-md h-8 whitespace-nowrap bg-accent/15 text-accent font-medium hover:bg-accent/25 ${
                      showLabels ? "p-2" : "justify-center"
                    }`}
                  >
                    <Rocket className="h-4 w-4 shrink-0" />
                    {showLabels && <span>Concluir setup</span>}
                  </Link>
                </li>
              )}
              {topNavItems.map(renderNavItem)}
            </ul>
          </nav>

          {/* Rodapé da sidebar: "Premissas Matriz" fica fixo embaixo quando
              navegando como unidade — separado da nav principal por uma borda. */}
          {premissasMatrizItem && (
            <div className="border-t border-sidebar-border p-2 shrink-0">
              <ul className="flex flex-col gap-1 text-sm">
                {renderNavItem(premissasMatrizItem)}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* ====================  MAIN  ==================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header superior */}
        <header className="h-12 flex items-center justify-between border-b border-border bg-card px-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Abrir menu lateral" : "Fechar menu lateral"}
              aria-expanded={!collapsed}
              className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-foreground shrink-0"
            >
              <PanelLeft className="h-4 w-4" />
            </button>

            {/* Nome da unidade ativa (texto grande) + badge de horizonte.
                Matriz não tem horizonte vinculado — esconde o badge. */}
            {displayedOrg && (
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="text-lg font-semibold text-foreground truncate" title={scopeLabel}>
                  {scopeLabel}
                </span>
                {displayedOrg.type === "unidade" && (
                  <span
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider shrink-0 ${
                      horizonteHeaderColors[displayedOrg.horizonteAtual]
                    }`}
                    title={`Horizonte atual da unidade: ${displayedOrg.horizonteAtual}`}
                  >
                    {displayedOrg.horizonteAtual}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Switcher de organização ativa */}
            <OrgSwitcher />

            {/* Info do usuário logado */}
            {primaryMembership && displayedOrg && (
              <div className="flex items-center gap-2 text-xs">
                <div className="flex flex-col text-right leading-tight">
                  <span className="font-medium text-foreground">{session.user.name}</span>
                  <span className="text-muted-foreground inline-flex items-center gap-1 justify-end">
                    {displayedOrg.type === "matriz" ? (
                      <Network className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {roleLabel[primaryMembership.role] ?? primaryMembership.role} ·{" "}
                    {scopeLabel}
                  </span>
                </div>
                <div className="h-8 w-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-semibold uppercase">
                  {session.user.name.slice(0, 1)}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center justify-center h-9 w-9 rounded hover:bg-muted disabled:opacity-50"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" style={{ color: "hsl(0, 84%, 41%)" }} />
            </button>
          </div>
        </header>

        {/* Conteúdo da rota */}
        <main className="flex-1 min-h-0 overflow-auto p-5">{children}</main>
      </div>
    </div>
  );
}
