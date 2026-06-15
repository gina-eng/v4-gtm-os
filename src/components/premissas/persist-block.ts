import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PremissaBlockPatch } from "@/db/repositories/premissas";

export type PersistBlock = (patch: PremissaBlockPatch) => Promise<boolean>;

/**
 * PATCH granular por bloco na entidade ativa (matriz ou unidade — o servidor
 * resolve pelo actingMode da sessão). Retorna true em caso de sucesso.
 *
 * Compartilhado entre /premissas (edição da matriz) e /premissas-unidade
 * (edição das premissas da própria unidade).
 */
export async function persistBlock(patch: PremissaBlockPatch): Promise<boolean> {
  try {
    const res = await fetch("/api/premissas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) console.error("[premissas] falha ao salvar bloco", patch.block, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[premissas] erro de rede ao salvar bloco", patch.block, err);
    return false;
  }
}

/**
 * `persistBlock` + `router.refresh()` no sucesso. O servidor já invalida as tags
 * do forecast no PATCH; o refresh re-busca o RSC desta rota (em vez de servir o
 * Router Cache do cliente), garantindo que a edição — e qualquer valor derivado
 * que o servidor recalcula ao salvar — apareça imediatamente. Use este hook em
 * vez de importar `persistBlock` direto.
 */
export function usePersistBlock(): PersistBlock {
  const router = useRouter();
  return useCallback(
    async (patch: PremissaBlockPatch) => {
      const ok = await persistBlock(patch);
      if (ok) router.refresh();
      return ok;
    },
    [router],
  );
}
