"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Unlock, X } from "lucide-react";
import { formatBRL, formatInt, formatPercent, parseBR } from "./format";

/**
 * Input numérico com máscara — base dos wrappers Currency/Percent/Integer.
 *
 * - `format(n)` define a apresentação ("R$ 1.234", "12,5%", "1.234").
 * - `parse(s)` extrai o número do texto digitado (default: parser PT-BR).
 * - `realtime`: quando true, reformata a cada keystroke ("12300" → "R$ 12.300").
 *   Quando false, mantém o texto cru enquanto o usuário digita e só formata
 *   ao perder foco — ideal para campos com decimais (ex.: 12,5 %).
 *
 * O estado interno `text` segue o que o usuário vê no input. Sincroniza com
 * `value` (prop) apenas quando o input não está focado — assim mudanças
 * externas (router.refresh, reset) refletem sem atrapalhar a digitação.
 */
function MaskedNumberInput({
  value,
  onChange,
  format,
  parse,
  step,
  min,
  max,
  realtime,
  inputMode,
  align,
  inputClassName,
}: {
  value: number;
  onChange: (v: number) => void;
  format: (n: number) => string;
  parse: (s: string) => number;
  step?: number;
  min?: number;
  max?: number;
  realtime: boolean;
  inputMode: "numeric" | "decimal";
  align: "left" | "center" | "right";
  inputClassName: string;
}) {
  const [text, setText] = useState(() => format(value));
  const focusedRef = useRef(false);

  // Mudanças externas (router.refresh, reset de form) só refletem quando o
  // usuário não está digitando — evita pular o cursor no meio da edição.
  useEffect(() => {
    if (!focusedRef.current) setText(format(value));
  }, [value, format]);

  function clamp(n: number): number {
    let v = Number.isFinite(n) ? n : 0;
    if (typeof min === "number" && v < min) v = min;
    if (typeof max === "number" && v > max) v = max;
    return v;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const parsed = clamp(parse(raw));
    onChange(parsed);
    if (realtime && raw.trim().length > 0) {
      setText(format(parsed));
    } else {
      setText(raw);
    }
  }

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    focusedRef.current = true;
    e.currentTarget.select();
  }

  function handleBlur() {
    focusedRef.current = false;
    setText(format(value));
  }

  return (
    <input
      type="text"
      inputMode={inputMode}
      value={text}
      step={step}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={`bg-transparent text-xs tabular-nums focus:outline-none text-foreground ${inputClassName} ${cellAlignClass(align)}`}
    />
  );
}

/**
 * Célula que alterna entre exibição formatada (read-only) e input editável.
 *
 * Visual em edit mode: borda pontilhada amarela + padding pequeno — segue o padrão
 * dos mockups onde células editáveis ficam destacadas com `dashed warning`.
 *
 * Quando `matrizValue` é passado e o valor atual difere, mostra um badge ao lado
 * indicando o delta percentual em relação à premissa da Matriz — usado nos
 * wizards de setup de unidade pra deixar visível o quanto o user se afastou
 * do baseline.
 */
type BaseProps = {
  isEditing: boolean;
  value: number;
  onChange: (v: number) => void;
  align?: "left" | "right" | "center";
  className?: string;
  /** Largura mínima do input em modo edit (default: w-14 / 3.5rem). */
  inputClassName?: string;
  /** Valor da premissa da Matriz pra comparação (delta % aparece quando difere). */
  matrizValue?: number;
};

function cellAlignClass(align: BaseProps["align"]) {
  if (align === "left") return "text-left";
  if (align === "center") return "text-center";
  return "text-right";
}

function editingWrapperClass(align: BaseProps["align"]) {
  // Wrapper visual com borda pontilhada amarela — `flex max-w-full` permite
  // que a caixa encolha junto com a célula quando a tabela fica responsiva
  // (colunas em %). O `min-w-0` evita que o flex item force overflow.
  return `flex max-w-full min-w-0 items-center justify-${
    align === "left" ? "start" : align === "center" ? "center" : "end"
  } gap-1 px-1.5 py-0.5 border border-dashed border-warning bg-warning/5 rounded`;
}

/** Input numérico genérico (sem formatação de moeda/%). */
export function NumberCell({
  isEditing,
  value,
  onChange,
  align = "right",
  className = "",
  inputClassName = "w-12",
  format = formatInt,
  parse = parseBR,
  step = 1,
  min,
  max,
  matrizValue,
  lockableZero = false,
  realtime = true,
  inputMode = "numeric",
}: BaseProps & {
  format?: (n: number) => string;
  parse?: (s: string) => number;
  step?: number;
  min?: number;
  max?: number;
  /**
   * Quando true, o valor 0 representa "não liberado para este horizonte/linha".
   * - Matriz (sem matrizValue): em read-only mostra "Não disponível"; em edit
   *   mostra botão "Liberar" no lugar do input enquanto valor=0 e o user não
   *   clicou em liberar. Botão de cadeado ao lado do input zera de volta.
   * - Unidade (matrizValue === 0): célula vem travada com "Não liberado pela
   *   matriz" — não há como digitar valor local.
   */
  lockableZero?: boolean;
  /** Quando true, reformata o texto a cada keystroke (default). Para campos
   *  decimais (%) prefira false — formata só ao perder o foco. */
  realtime?: boolean;
  /** Hint do teclado mobile: "numeric" sem decimal, "decimal" com vírgula. */
  inputMode?: "numeric" | "decimal";
}) {
  // Unidade: matriz não liberou esta linha → célula travada.
  const lockedByMatriz = lockableZero && matrizValue === 0;

  // Estado local: usuário clicou "Liberar" mesmo com valor ainda 0.
  // Reseta ao sair do modo edit pra não vazar entre ciclos.
  const [releasing, setReleasing] = useState(false);
  useEffect(() => {
    if (!isEditing) setReleasing(false);
  }, [isEditing]);

  // Delta vs premissa da Matriz: só mostra se foi passado, é > 0 (evita div/0)
  // e o user já alterou o valor (diferença > 0.01 pra ignorar ruído de float).
  const showDelta =
    matrizValue !== undefined &&
    matrizValue !== 0 &&
    Math.abs(value - matrizValue) > 0.01;
  const deltaPct = showDelta ? ((value - matrizValue!) / matrizValue!) * 100 : 0;
  const deltaLabel = showDelta
    ? `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(deltaPct >= 10 || deltaPct <= -10 ? 0 : 1)}%`
    : null;

  // Read-only
  if (!isEditing) {
    if (lockableZero && value === 0) {
      return (
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 ${
            align === "right" ? "justify-end w-full" : align === "center" ? "justify-center w-full" : ""
          } ${className}`}
        >
          <Lock className="h-2.5 w-2.5" />
          Não disponível
        </span>
      );
    }
    return (
      <span className={`tabular-nums ${cellAlignClass(align)} ${className}`}>{format(value)}</span>
    );
  }

  // Edit mode, unidade travada pela matriz
  if (lockedByMatriz) {
    return (
      <span
        className={`inline-flex items-center ${
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        }`}
      >
        <span
          title="Não liberado pela matriz para este horizonte"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-dashed border-border bg-muted/20 rounded text-[10px] uppercase tracking-wider text-muted-foreground/70 cursor-not-allowed"
        >
          <Lock className="h-2.5 w-2.5" />
          Não disponível
        </span>
      </span>
    );
  }

  // Edit mode, matriz não liberou ainda → botão "Liberar" no lugar do input
  if (lockableZero && value === 0 && !releasing) {
    return (
      <span
        className={`inline-flex items-center ${
          align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
        }`}
      >
        <button
          type="button"
          onClick={() => setReleasing(true)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-dashed border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40"
          title="Liberar este campo para o horizonte"
        >
          <Unlock className="h-2.5 w-2.5" />
          Liberar
        </button>
      </span>
    );
  }

  // Slot do delta tem largura fixa reservada sempre que `matrizValue` é passado
  // — mesmo quando matriz=0 (sem delta possível) ou ainda não há diferença.
  // Assim a coluna mantém alinhamento perfeito entre linhas; o badge só
  // "preenche" o espaço já reservado quando há delta de verdade.
  //
  // O slot fica do lado OPOSTO ao alinhamento da coluna para que o input
  // continue encostando na mesma borda do header. Ex: coluna right-aligned
  // tem o input grudado na direita e o delta à esquerda dele.
  const hasMatrizCompare = matrizValue !== undefined;
  const deltaOnLeft = align === "right";
  const deltaSlot = hasMatrizCompare ? (
    <span
      className={`w-10 shrink-0 ${deltaOnLeft ? "text-right" : "text-left"} text-[10px] font-semibold tabular-nums`}
      aria-hidden={!deltaLabel}
    >
      {deltaLabel && (
        <span
          title={`Premissa da Matriz: ${format(matrizValue!)}`}
          className={deltaPct > 0 ? "text-success" : "text-destructive"}
        >
          {deltaLabel}
        </span>
      )}
    </span>
  ) : null;
  const inputSlot = (
    <span className={editingWrapperClass(align)}>
      <MaskedNumberInput
        value={Number.isFinite(value) ? value : 0}
        onChange={onChange}
        format={format}
        parse={parse}
        step={step}
        min={min}
        max={max}
        realtime={realtime}
        inputMode={inputMode}
        align={align}
        inputClassName={inputClassName}
      />
      {lockableZero && (
        <button
          type="button"
          onClick={() => {
            onChange(0);
            setReleasing(false);
          }}
          title="Travar (marcar como não disponível para este horizonte)"
          className="ml-1 inline-flex items-center justify-center h-3.5 w-3.5 text-muted-foreground/60 hover:text-destructive"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-1 ${align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end"}`}>
      {deltaOnLeft && deltaSlot}
      {inputSlot}
      {!deltaOnLeft && deltaSlot}
    </span>
  );
}

/** Moeda R$ — máscara em tempo real "R$1.234"; sem centavos. */
export function CurrencyCell(props: BaseProps & { step?: number; lockableZero?: boolean }) {
  return (
    <NumberCell
      {...props}
      format={formatBRL}
      step={props.step ?? 100}
      min={0}
      realtime
      inputMode="numeric"
    />
  );
}

/** Percentual — máscara "12,5%". Formata só ao perder o foco para não atrapalhar
 *  a digitação de decimais com vírgula. */
export function PercentCell(
  props: BaseProps & { digits?: number; step?: number; lockableZero?: boolean },
) {
  const digits = props.digits ?? 1;
  return (
    <NumberCell
      {...props}
      format={(n) => formatPercent(n, digits)}
      step={props.step ?? 0.1}
      min={0}
      max={100}
      realtime={false}
      inputMode="decimal"
    />
  );
}

/** Inteiro com separador de milhar "1.234". */
export function IntegerCell(props: BaseProps & { lockableZero?: boolean }) {
  return (
    <NumberCell
      {...props}
      format={formatInt}
      step={1}
      min={0}
      inputClassName={props.inputClassName ?? "w-12"}
      realtime
      inputMode="numeric"
    />
  );
}

/**
 * Célula numérica com suporte a valor "aberto" (null) — usada para faixas
 * abertas à direita ou prazos sem teto. Ex: faturamento Enterprise (R$500M+)
 * ou tempo máximo de H5 (sem prazo, unidade consolidada).
 *
 * Em modo edit: input numérico + checkbox `openLabel`. Quando marcado, valor
 * vira null e o input é desabilitado. Em read-only, null vira `openLabel`.
 */
export function NullableNumberCell({
  isEditing,
  value,
  onChange,
  align = "right",
  className = "",
  inputClassName = "w-14",
  matrizValue,
  step = 1,
  format = formatInt,
  openLabel = "Aberto",
}: {
  isEditing: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
  align?: "left" | "right" | "center";
  className?: string;
  inputClassName?: string;
  matrizValue?: number | null;
  step?: number;
  format?: (n: number) => string;
  openLabel?: string;
}) {
  const isOpen = value === null;

  if (!isEditing) {
    return (
      <span className={`tabular-nums ${align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right"} ${className}`}>
        {isOpen ? <span className="text-muted-foreground">{openLabel}</span> : format(value)}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end"}`}>
      <span className={`inline-flex items-center px-1.5 py-0.5 border border-dashed rounded ${isOpen ? "border-border bg-muted/30 opacity-60" : "border-warning bg-warning/5"}`}>
        {isOpen ? (
          <input
            type="text"
            value=""
            disabled
            className={`bg-transparent text-xs tabular-nums focus:outline-none text-foreground ${inputClassName} text-right disabled:cursor-not-allowed`}
          />
        ) : (
          <MaskedNumberInput
            value={Number.isFinite(value) ? (value as number) : 0}
            onChange={(v) => onChange(v)}
            format={format}
            parse={parseBR}
            step={step}
            min={0}
            realtime
            inputMode="numeric"
            align="right"
            inputClassName={inputClassName}
          />
        )}
      </span>
      <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => {
            if (e.target.checked) onChange(null);
            else onChange(matrizValue ?? 0);
          }}
          className="h-3 w-3 accent-warning"
        />
        {openLabel}
      </label>
    </span>
  );
}

export function NullableCurrencyCell(
  props: Omit<Parameters<typeof NullableNumberCell>[0], "format" | "openLabel"> & {
    openLabel?: string;
  },
) {
  return (
    <NullableNumberCell
      {...props}
      format={formatBRL}
      step={props.step ?? 100}
      openLabel={props.openLabel ?? "Sem teto"}
    />
  );
}

export function NullableIntegerCell(
  props: Omit<Parameters<typeof NullableNumberCell>[0], "format" | "openLabel"> & {
    openLabel?: string;
  },
) {
  return (
    <NullableNumberCell
      {...props}
      format={formatInt}
      step={1}
      openLabel={props.openLabel ?? "Sem prazo"}
      inputClassName={props.inputClassName ?? "w-12"}
    />
  );
}
