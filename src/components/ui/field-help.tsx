"use client";

import { HelpCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Ícone "?" inline com tooltip explicativo no hover/focus.
 *
 * Uso típico:
 *   <label>
 *     WIP Limit <FieldHelp text="Capacidade máxima do cargo por mês." />
 *   </label>
 *
 * Acessibilidade:
 * - `aria-label` permite leitor de tela ler a descrição
 * - tabIndex=0 permite foco por teclado (tooltip aparece em :focus-visible)
 * - usa <span> ao invés de <button> pra não criar form submit acidental
 *
 * Posicionamento: o tooltip é renderizado via portal direto no `<body>`
 * com `position: fixed` — ancestrais com `overflow: hidden` (modais, cards,
 * tabelas com scroll horizontal) **não** cortam. A coordenada é recalculada
 * a cada abertura via `getBoundingClientRect()` do ícone. Auto-flip pra
 * baixo quando não tem espaço em cima e vice-versa.
 */
type Props = {
  text: string;
  position?: "top" | "bottom";
  size?: "sm" | "md";
  className?: string;
};

type Coords = { x: number; y: number; placement: "top" | "bottom" };

export function FieldHelp({
  text,
  position = "top",
  size = "sm",
  className = "",
}: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const compute = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const cx = r.left + r.width / 2;

    // Auto-flip: usa o lado pedido a menos que não caiba e o outro tenha
    // mais folga. ESTIMATED_H cobre tooltips de ~3 linhas (w-60 ~ 240px).
    const ESTIMATED_H = 80;
    const roomTop = r.top;
    const roomBottom = window.innerHeight - r.bottom;
    const wantTop = position === "top";
    const useTop = wantTop
      ? !(roomTop < ESTIMATED_H && roomBottom > roomTop)
      : roomBottom < ESTIMATED_H && roomTop > roomBottom;

    setCoords({
      x: cx,
      y: useTop ? r.top - 6 : r.bottom + 6,
      placement: useTop ? "top" : "bottom",
    });
  }, [position]);

  // Fecha em scroll/resize pra não ficar com tooltip "voando" longe do trigger.
  useEffect(() => {
    if (!coords) return;
    const close = () => setCoords(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [coords]);

  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <>
      <span
        ref={triggerRef}
        role="img"
        aria-label={`Ajuda: ${text}`}
        tabIndex={0}
        onMouseEnter={compute}
        onMouseLeave={() => setCoords(null)}
        onFocus={compute}
        onBlur={() => setCoords(null)}
        className={`relative inline-flex items-center align-middle group focus:outline-none ${className}`}
      >
        <HelpCircle
          className={`${iconSize} text-current opacity-90 group-hover:opacity-100 group-hover:text-accent group-focus:opacity-100 group-focus:text-accent cursor-help transition-all`}
          aria-hidden
        />
      </span>
      {mounted &&
        coords &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y,
              transform:
                coords.placement === "top"
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
              maxWidth: "min(15rem, calc(100vw - 16px))",
            }}
            className="z-[100] w-60 px-2.5 py-1.5 rounded bg-popover text-popover-foreground text-[11px] font-normal normal-case tracking-normal leading-snug border border-border shadow-lg pointer-events-none whitespace-normal text-left"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
