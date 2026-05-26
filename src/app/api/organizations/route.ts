import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  createOrganization,
  listOrganizations,
  OrganizationConflictError,
} from "@/db/repositories/organizations";
import {
  ForbiddenError,
  UnauthorizedError,
  requireAuth,
  requirePermission,
} from "@/lib/auth/current-user";
import {
  createOrganizationSchema,
  listOrganizationsQuerySchema,
} from "@/lib/validations/organizations";

/**
 * GET /api/organizations
 * Query: ?type=&status=&horizonte=&search=
 *
 * Scoping:
 * - Matriz: vê todas as orgs
 * - Unidade: vê apenas as orgs em que tem membership ativo
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, "organization.list");

    const params = Object.fromEntries(req.nextUrl.searchParams);
    const query = listOrganizationsQuerySchema.parse(params);
    const all = await listOrganizations(query);

    const scoped = session.isMatrizUser
      ? all
      : all.filter((o) =>
          session.memberships.some((m) => m.organizationId === o.id),
        );

    return NextResponse.json({ data: scoped, total: scoped.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Parâmetros inválidos", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[GET /api/organizations]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

/**
 * POST /api/organizations
 * Body: { name, slug?, horizonteAtual? }
 *
 * Cria sempre uma unidade. Apenas Admin Matriz.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, "organization.create");

    const body = await req.json();
    const input = createOrganizationSchema.parse(body);
    const org = await createOrganization(input);
    return NextResponse.json({ data: org }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof OrganizationConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON inválido no corpo da requisição" }, { status: 400 });
    }
    console.error("[POST /api/organizations]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
