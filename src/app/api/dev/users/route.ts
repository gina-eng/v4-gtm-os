import { NextResponse } from "next/server";
import { listAllUsersForDev, listMembershipsByUser } from "@/db/repositories/users";
import { getOrganizationById } from "@/db/repositories/organizations";

/**
 * GET /api/dev/users
 *
 * ⚠️ Endpoint apenas para DEV — retorna 404 em prod.
 * Lista os usuários seedados com seus memberships, pra popular o painel
 * "login de teste" da página /login.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const users = await listAllUsersForDev();
  const enriched = [];
  for (const u of users) {
    const memberships = await listMembershipsByUser(u.id);
    const orgs = [];
    for (const m of memberships) {
      if (m.organizationId) {
        const org = await getOrganizationById(m.organizationId);
        if (org) orgs.push({ role: m.role, orgName: org.name, orgType: org.type });
      } else if (m.regional) {
        orgs.push({
          role: m.role,
          orgName: `Regional ${m.regional}`,
          orgType: "unidade" as const,
        });
      }
    }
    enriched.push({
      id: u.id,
      name: u.name,
      email: u.email,
      memberships: orgs,
    });
  }

  return NextResponse.json({ data: enriched });
}
