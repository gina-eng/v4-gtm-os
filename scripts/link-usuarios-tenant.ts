/**
 * Vincula usuários já existentes (com users.id_tenant preenchido) à unidade:
 * cruza id_tenant → unidades.id, grava active_organization_id + cria membership.
 * Lógica em src/lib/usuarios/vincular-tenant.ts (compartilhada com load:usuarios).
 *
 * Rodar:
 *   npm run link:usuarios
 *   npm run link:usuarios -- --role=gerente
 */
import { vincularUsuariosPorTenant, type RoleVinculo } from "../src/lib/usuarios/vincular-tenant";

const ROLES: RoleVinculo[] = ["admin", "gerente", "coordenador"];
function parseRole(): RoleVinculo {
  const v = process.argv.find((a) => a.startsWith("--role="))?.split("=")[1] as RoleVinculo | undefined;
  return v && ROLES.includes(v) ? v : "coordenador";
}

async function main() {
  const role = parseRole();
  const r = await vincularUsuariosPorTenant(role);
  console.log("── vínculo de usuários por id_tenant ──");
  console.log(`role p/ novos memberships:     ${role}`);
  console.log(`usuários com id_tenant:        ${r.comIdTenant}`);
  console.log(`vinculados (active_org setado):${r.vinculados}`);
  console.log(`novos memberships criados:     ${r.novosMemberships}`);
  console.log(`id_tenant SEM unidade:         ${r.naoCasaram.length}`);
  r.naoCasaram.slice(0, 40).forEach((x) => console.log(`   • ${x.email} → "${x.idTenant}"`));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
