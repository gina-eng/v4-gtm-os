import { Network } from "lucide-react";

type Props = {
  mode: "matriz-sem-unidades" | "unidade-sem-org";
};

/**
 * Empty states de /realizado:
 * - matriz-sem-unidades: usuário tem perfil matriz mas a rede não tem nenhuma
 *   unidade cadastrada/visível pra ele.
 * - unidade-sem-org: usuário de unidade chegou na rota sem org ativa (estado
 *   intermediário raro — normalmente o middleware/menu já garante uma).
 */
export function RealizadoEmpty({ mode }: Props) {
  const isMatrizEmpty = mode === "matriz-sem-unidades";
  const eyebrow = isMatrizEmpty
    ? "V4 OS · CONSOLIDADO DA REDE"
    : "V4 OS · REALIZADO";

  return (
    <>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          Realizado vs Projetado
        </h1>
      </div>

      <div className="rounded border border-border bg-card px-6 py-10 flex flex-col items-center text-center gap-3">
        <Network className="h-8 w-8 text-muted-foreground" />
        {isMatrizEmpty ? (
          <>
            <h2 className="text-base font-semibold text-foreground">
              Nenhuma unidade visível ainda
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              A Matriz consolida os números a partir das unidades cadastradas. Cadastre uma unidade em <em>Unidades</em> e peça pra ela completar o wizard <em>/iniciar</em> — o realizado e o projetado vão aparecer aqui automaticamente.
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
