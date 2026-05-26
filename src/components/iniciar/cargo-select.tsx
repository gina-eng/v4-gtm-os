"use client";

import { CARGOS_COMERCIAIS } from "@/lib/premissas/matriz-defaults";

/**
 * Select padronizado de cargo do time comercial. Reusado no wizard de
 * setup da unidade e no cadastro de premissas da Matriz pra garantir
 * o mesmo vocabulário em todo o sistema.
 *
 * Comportamento:
 * - Mostra LDR / BDR / SDR / CLOSER / KAM como opções da lista.
 * - "OUTRO" no fim libera um input de texto pra digitar um cargo
 *   customizado — sempre normalizado em UPPERCASE pra padronizar.
 * - Valores fora da lista padrão (ex.: legados como "Closer") são
 *   tratados como custom e aparecem com o select em "OUTRO".
 */
type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Largura do select e do input customizado (Tailwind class). */
  widthClass?: string;
  disabled?: boolean;
};

const SENTINEL_OUTRO = "OUTRO";

export function CargoSelect({
  value,
  onChange,
  widthClass = "w-20",
  disabled,
}: Props) {
  const isStandard = (CARGOS_COMERCIAIS as readonly string[]).includes(value);
  const selectValue = isStandard ? value : SENTINEL_OUTRO;

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === SENTINEL_OUTRO) {
      // Limpa pra convidar o user a digitar — input customizado aparece logo abaixo.
      onChange("");
    } else {
      onChange(next);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
        <select
          value={selectValue}
          onChange={handleSelectChange}
          disabled={disabled}
          className={`bg-transparent text-xs focus:outline-none text-foreground font-medium ${widthClass}`}
        >
          {CARGOS_COMERCIAIS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={SENTINEL_OUTRO}>OUTRO…</option>
        </select>
      </span>
      {selectValue === SENTINEL_OUTRO && (
        <span className="inline-flex items-center px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="DIGITE O CARGO"
            disabled={disabled}
            className={`bg-transparent text-xs focus:outline-none text-foreground font-medium uppercase placeholder:text-muted-foreground/60 placeholder:normal-case ${widthClass}`}
          />
        </span>
      )}
    </span>
  );
}
