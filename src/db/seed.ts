// .env.local é carregado pelo Node antes deste arquivo via `tsx --env-file=.env.local`
// (configurado no script `db:seed` em package.json). Não usar `dotenv.config()` aqui:
// imports são hoisted, então qualquer require de @/lib/env rodaria antes do dotenv.

import { db } from "./index";
import { organizations, users, memberships } from "./schema";
import { eq } from "drizzle-orm";

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
        activeOrganizationId: matriz.id,
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

  console.log("[seed] concluído.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] erro:", err);
  process.exit(1);
});
