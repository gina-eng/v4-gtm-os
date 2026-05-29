import { Users } from "lucide-react";

type Props = {
  mode: "matriz" | "unidade-sem-org";
};

export function TimeComercialEmpty({ mode }: Props) {
  const isMatriz = mode === "matriz";
  return (
    <>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
          V4 OS · TIME COMERCIAL · 2026
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Time Comercial</h1>
      </div>
      <div className="rounded border border-border bg-card px-6 py-10 flex flex-col items-center text-center gap-3">
        <Users className="h-8 w-8 text-muted-foreground" />
        {isMatriz ? (
          <>
            <h2 className="text-base font-semibold text-foreground">
              Selecione uma unidade
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              O time comercial é cadastrado por unidade. Use o seletor no topo para escolher a unidade que você quer editar.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-foreground">
              Nenhuma unidade ativa
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
