"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Layers, Network, Search } from "lucide-react";
import { useSession } from "@/lib/auth/auth-context";
import type { ScopeMode } from "@/lib/auth/types";

/**
 * Switcher de organização ativa no header — 4 escopos (ver docs/escopo-seletor-4-modos.md).
 *
 * Para matriz-user, a lista tem (nesta ordem):
 *   • Resultado geral  (scope=geral)      — matriz + todas as unidades
 *   • Todas Unidades   (scope=todas_unidades) — só as unidades
 *   • <org matriz>     (scope=matriz_propria)  — só a holding
 *   • cada unidade     (scope=unidade)
 * Os 3 primeiros são "visões de rede" e só aparecem pra isMatrizUser. A busca
 * filtra só a lista de unidades. O item ativo e o label do botão derivam do
 * `activeScope` (não do activeOrganization.id, que não existe pros sintéticos).
 *
 * Unidade single-vínculo: não renderiza (texto estático). Ao trocar, vai pra "/".
 */
type ScopeBody =
  | { scope: "geral" }
  | { scope: "todas_unidades" }
  | { scope: "matriz_propria" }
  | { scope: "unidade"; organizationId: string };

export function OrgSwitcher() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const isMatriz = session.isMatrizUser;
  const orgs = session.availableOrganizations;
  const scope = session.activeScope;
  const matrizOrg = orgs.find((o) => o.type === "matriz") ?? null;
  const unidades = orgs.filter((o) => o.type === "unidade");

  // Único vínculo de unidade (não-matriz) → texto estático, sem switcher.
  if (!isMatriz && orgs.length <= 1) {
    const only = orgs[0];
    if (!only) return null;
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        <span>{only.name}</span>
      </div>
    );
  }

  async function switchTo(body: ScopeBody) {
    setPending(true);
    try {
      const res = await fetch("/api/auth/active-organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[OrgSwitcher] PATCH failed", res.status, txt);
        return;
      }
      setOpen(false);
      // Navegação full pra re-resolver a sessão no server e sincronizar os RSC.
      window.location.href = "/";
    } finally {
      setPending(false);
    }
  }

  // Label e ícone do botão derivados do escopo ativo.
  const buttonLabel =
    scope === "geral"
      ? "Resultado geral"
      : scope === "todas_unidades"
        ? "Todas Unidades"
        : (session.activeOrganization?.name ?? "Selecionar organização");
  const isNetworkScope = scope === "geral" || scope === "todas_unidades" || scope === "matriz_propria";

  const filteredUnidades = unidades.filter((o) =>
    o.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const itemCls = "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left disabled:opacity-50";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium border border-border bg-background hover:bg-muted disabled:opacity-50"
      >
        {isNetworkScope ? (
          <Network className="h-3.5 w-3.5 text-accent" />
        ) : (
          <Building2 className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[180px] truncate">{buttonLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 w-72 rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-50 overflow-hidden"
        >
          {/* Visões de rede — só matriz-user, sempre visíveis (fora da busca). */}
          {isMatriz && (
            <div className="py-1 border-b border-border">
              <ScopeItem
                active={scope === "geral"}
                onClick={() => switchTo({ scope: "geral" })}
                disabled={pending}
                icon={<Layers className="h-3.5 w-3.5 text-accent shrink-0" />}
                label="Resultado geral"
                hint="Matriz + todas as unidades"
                cls={itemCls}
              />
              <ScopeItem
                active={scope === "todas_unidades"}
                onClick={() => switchTo({ scope: "todas_unidades" })}
                disabled={pending}
                icon={<Network className="h-3.5 w-3.5 text-accent shrink-0" />}
                label="Todas Unidades"
                hint="Só as unidades"
                cls={itemCls}
              />
              {matrizOrg && (
                <ScopeItem
                  active={scope === "matriz_propria"}
                  onClick={() => switchTo({ scope: "matriz_propria" })}
                  disabled={pending}
                  icon={<Network className="h-3.5 w-3.5 shrink-0" />}
                  label={matrizOrg.name}
                  hint="Só a Matriz"
                  cls={itemCls}
                />
              )}
            </div>
          )}

          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar unidade…"
                className="w-full h-7 rounded border border-input bg-background pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <ul className="max-h-[300px] overflow-auto py-1">
            {filteredUnidades.map((org) => {
              const active = scope === "unidade" && session.activeOrganization?.id === org.id;
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => switchTo({ scope: "unidade", organizationId: org.id })}
                    className={itemCls}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{org.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-accent" />}
                  </button>
                </li>
              );
            })}
            {filteredUnidades.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                Nenhuma unidade encontrada.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScopeItem(props: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  cls: string;
}) {
  return (
    <button type="button" disabled={props.disabled} onClick={props.onClick} className={props.cls}>
      {props.icon}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{props.label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{props.hint}</span>
      </span>
      {props.active && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
    </button>
  );
}

// Mantém o tipo exportável caso outro componente precise referenciar.
export type { ScopeMode };
