"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Network, Search } from "lucide-react";
import { useSession } from "@/lib/auth/auth-context";

/**
 * Switcher de organização ativa no header.
 *
 * Visibilidade:
 * - Matriz (qualquer papel): sempre visível, lista matriz + todas as franquias.
 *   A própria matriz nessa lista É a visão consolidada (não há "Todas as Franquias").
 * - Unidade multi-vínculo (>1 membership): visível com as orgs do user.
 * - Unidade single-vínculo: não renderiza (mostra texto estático no header).
 *
 * Ao trocar de org, redireciona para "/" — assim o user nunca fica preso em
 * uma tela que não se aplica ao novo contexto (ex.: /unidades quando atuando
 * como unidade).
 */
export function OrgSwitcher() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Limpa busca quando fecha
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const isMatriz = session.isMatrizUser;
  const orgs = session.availableOrganizations;

  // Único membership de unidade → nada de switcher
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

  async function switchTo(orgId: string) {
    setPending(true);
    try {
      const res = await fetch("/api/auth/active-organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[OrgSwitcher] PATCH failed", res.status, body);
        return;
      }
      setOpen(false);
      // Sempre volta pra Início ao trocar — evita ficar em tela inválida pro
      // novo contexto (ex.: /unidades quando passou a atuar como unidade).
      // Navegação full (não router.push) pra forçar re-resolução da sessão
      // no server e sincronizar todos os RSC.
      window.location.href = "/";
    } finally {
      setPending(false);
    }
  }

  const filtered = orgs.filter((o) =>
    o.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  // Label do botão: nome da org ativa. Se por algum motivo não houver, cai
  // pra primeira disponível (defesa contra estados inválidos).
  const active = session.activeOrganization ?? orgs[0] ?? null;

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
        {active?.type === "matriz" ? (
          <Network className="h-3.5 w-3.5 text-accent" />
        ) : (
          <Building2 className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[180px] truncate">
          {active?.name ?? "Selecionar organização"}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 w-72 rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-50 overflow-hidden"
        >
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
            {filtered.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => switchTo(org.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left"
                >
                  {org.type === "matriz" ? (
                    <Network className="h-3.5 w-3.5 text-accent shrink-0" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{org.name}</span>
                  {active?.id === org.id && <Check className="h-3.5 w-3.5 text-accent" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                Nenhuma organização encontrada.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
