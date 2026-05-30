import { config } from "dotenv";
config({ path: "/Users/rafaelcorazza/Documents/Antigravity/V4 GTM Os/.env.local" });
import postgres from "postgres";

const MATRIZ = "64e3d380-39ae-438a-a2a5-cffa566bdd9f";

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT, { prepare: false });
  const matrizPrem = await sql`SELECT id FROM premissas WHERE entidade_id = ${MATRIZ}`;
  if (!matrizPrem.length) {
    console.error("Matriz sem linha em premissas — abortando.");
    process.exit(1);
  }
  const matrizId = matrizPrem[0].id;
  const horizMatriz = await sql`
    SELECT h, split_ev FROM premissa_horizonte WHERE premissa_id = ${matrizId}
  `;
  const splitEvByH = new Map(horizMatriz.map((r) => [r.h, r.split_ev]));
  const evCusto = (await sql`SELECT custo_sql, meta, pipeline FROM premissa_eventos_custo WHERE premissa_id = ${matrizId}`)[0];
  const evConv = await sql`SELECT tier, cr3, cr4 FROM premissa_conversao_eventos WHERE premissa_id = ${matrizId}`;
  console.log("Matriz lida:", { splitEv: Object.fromEntries(splitEvByH), evCusto, evConvCount: evConv.length });

  const unidades = await sql`
    SELECT o.id, o.name, p.id AS premissa_id
    FROM organizations o
    JOIN premissas p ON p.entidade_id = o.id
    WHERE o.type = 'unidade'
  `;
  console.log(`\nUnidades a propagar (${unidades.length}):`);
  for (const u of unidades) console.log(`  - ${u.name} (${u.id})`);

  for (const u of unidades) {
    const pid = u.premissa_id;
    // Atualiza splitEv por horizonte
    for (const [h, splitEv] of splitEvByH) {
      await sql`UPDATE premissa_horizonte SET split_ev = ${splitEv} WHERE premissa_id = ${pid} AND h = ${h}`;
    }
    // Upsert eventos_custo
    if (evCusto) {
      await sql`
        INSERT INTO premissa_eventos_custo (premissa_id, custo_sql, meta, pipeline)
        VALUES (${pid}, ${evCusto.custo_sql}, ${evCusto.meta}, ${evCusto.pipeline})
        ON CONFLICT (premissa_id) DO UPDATE
          SET custo_sql = EXCLUDED.custo_sql, meta = EXCLUDED.meta, pipeline = EXCLUDED.pipeline
      `;
    }
    // Upsert conversao_eventos por tier
    for (const c of evConv) {
      await sql`
        INSERT INTO premissa_conversao_eventos (premissa_id, tier, cr3, cr4)
        VALUES (${pid}, ${c.tier}, ${c.cr3}, ${c.cr4})
        ON CONFLICT (premissa_id, tier) DO UPDATE
          SET cr3 = EXCLUDED.cr3, cr4 = EXCLUDED.cr4
      `;
    }
    console.log(`✓ ${u.name} propagado`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
