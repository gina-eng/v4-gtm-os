// .env.local é carregado pelo Node antes deste arquivo via `tsx --env-file=.env.local`
// (configurado no script `db:seed` em package.json). Não usar `dotenv.config()` aqui:
// imports são hoisted, então qualquer require de @/lib/env rodaria antes do dotenv.

import { db } from "./index";
import { organizations, users, memberships, premissas, premissaDistSplit } from "./schema";
import { eq } from "drizzle-orm";
import { matrizDefaultBlocks, savePremissas, savePremissasBlock } from "./repositories/premissas";
import { DIST_SPLIT_DEFAULT } from "@/lib/premissas/matriz-defaults";

/**
 * Seed do banco V4 OS.
 *
 * Roda com: `npm run db:seed`
 *
 * Day 1 (migração pra Supabase + Vercel):
 * - Matriz V4 (única organization type='matriz' permitida — uniqueIndex no schema)
 * - User admin: gina@v4company.com
 * - Membership: gina → Matriz com role=admin
 *
 * Todos os blocos são idempotentes: re-rodar não duplica nada.
 */

const MATRIZ_SLUG = "matriz";
const GINA_EMAIL = "gina@v4company.com";

async function main() {
  console.log("[seed] iniciando seed do V4 OS…");

  // ---- Matriz V4 ----------------------------------------------------------
  let [matriz] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, MATRIZ_SLUG))
    .limit(1);

  if (!matriz) {
    [matriz] = await db
      .insert(organizations)
      .values({
        type: "matriz",
        slug: MATRIZ_SLUG,
        name: "V4 Company",
        status: "active",
        horizonteAtual: "H1",
      })
      .returning();
    console.log(`[seed] criada Matriz V4 (${matriz.id})`);
  } else {
    console.log(`[seed] Matriz V4 já existe (${matriz.id})`);
  }

  // ---- User admin (gina) --------------------------------------------------
  let [gina] = await db
    .select()
    .from(users)
    .where(eq(users.email, GINA_EMAIL))
    .limit(1);

  if (!gina) {
    [gina] = await db
      .insert(users)
      .values({
        email: GINA_EMAIL,
        name: "Gina",
        status: "active",
        // Consolidado por padrão: null + matriz_scope='todas_unidades' (= visão de
        // rede de hoje). NÃO apontar pra matriz.id, que no modelo de escopos viraria
        // 'matriz_propria' (só a holding). Ver docs/escopo-seletor-4-modos.md.
        activeOrganizationId: null,
        matrizScope: "todas_unidades",
      })
      .returning();
    console.log(`[seed] criado user admin gina (${gina.id})`);
  } else {
    console.log(`[seed] user gina já existe (${gina.id})`);
  }

  // ---- Membership gina → Matriz (role=admin) ------------------------------
  const [existingMembership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, gina.id))
    .limit(1);

  if (!existingMembership) {
    const [m] = await db
      .insert(memberships)
      .values({
        userId: gina.id,
        organizationId: matriz.id,
        role: "admin",
        status: "active",
      })
      .returning();
    console.log(`[seed] criada membership gina→Matriz role=admin (${m.id})`);
  } else {
    console.log(`[seed] membership gina já existe (${existingMembership.id})`);
  }

  // ---- Premissas da Matriz (defaults do modelo) --------------------------
  // A matriz "vira uma entidade" na tabela premissas: 1 linha + filhas com os
  // defaults. Idempotente: só semeia se ainda não existe (não sobrescreve
  // edições feitas via /premissas).
  const [premissaMatriz] = await db
    .select({ id: premissas.id })
    .from(premissas)
    .where(eq(premissas.entidadeId, matriz.id))
    .limit(1);

  if (!premissaMatriz) {
    await savePremissas(matriz.id, matrizDefaultBlocks());
    console.log(`[seed] semeadas premissas da Matriz (entidade ${matriz.id})`);
  } else {
    // Backfill do split de distribuição (P4 direita) — tabela nova; preenche
    // só se ainda não houver linhas pra não sobrescrever edições.
    const [split] = await db
      .select({ id: premissaDistSplit.id })
      .from(premissaDistSplit)
      .where(eq(premissaDistSplit.premissaId, premissaMatriz.id))
      .limit(1);
    if (!split) {
      await savePremissasBlock(matriz.id, { block: "distSplit", data: DIST_SPLIT_DEFAULT });
      console.log(`[seed] backfill do split P4 da Matriz`);
    } else {
      console.log(`[seed] premissas da Matriz já existem (split ok)`);
    }
  }

  console.log("[seed] concluído.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] erro:", err);
  process.exit(1);
});
