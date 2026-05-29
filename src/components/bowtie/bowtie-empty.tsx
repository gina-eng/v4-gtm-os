import { Workflow } from "lucide-react";

type Props = {
  mode: "matriz-sem-unidades" | "unidade-sem-org";
};

/**
 * Empty states de /bowtie — mesmas duas situações do /realizado:
 * - matriz-sem-unidades: matriz sem unidades cadastradas/visíveis.
 * - unidade-sem-org: usuário de unidade chegou sem org ativa.
 */
export function BowtieEmpty({ mode }: Props) {
  const isMatrizEmpty = mode === "matriz-sem-unidades";
  const eyebrow = isMatrizEmpty
    ? "V4 OS · CONSOLIDADO DA REDE · 2026"
    : "V4 OS · FUNIL BOWTIE 2026";

  return (
    <>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Funil Bowtie 2026</h1>
      </div>

      <div className="rounded border border-border bg-card px-6 py-10 flex flex-col items-center text-center gap-3">
        <Workflow className="h-8 w-8 text-muted-foreground" />
        {isMatrizEmpty ? (
          <>
            <h2 className="text-base font-semibold text-foreground">
              Nenhuma unidade visível ainda
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              A Matriz consolida o funil bowtie das unidades cadastradas. Cadastre uma unidade em <em>Unidades</em> e peça pra ela completar o wizard <em>/iniciar</em> — os outputs aparecem aqui automaticamente.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-foreground">
              Selecione uma unidade
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Esta tela depende de uma unidade ativa. Use o seletor no topo para escolher uma e voltar pra cá.
            </p>
          </>
        )}
      </div>
    </>
  );
}
