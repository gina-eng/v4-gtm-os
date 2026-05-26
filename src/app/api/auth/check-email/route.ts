import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getUserByEmail } from "@/db/repositories/users";
import { checkEmailSchema } from "@/lib/validations/auth";

/**
 * POST /api/auth/check-email
 * Body: { email }
 *
 * Primeiro passo do fluxo de login em duas etapas. Decide qual tela mostrar
 * em seguida (definir senha vs digitar senha).
 *
 * Retornos:
 *   200 { exists: false }              → email não cadastrado (mostrar erro)
 *   200 { exists: true, needsPasswordSetup: true,  name }  → primeiro acesso
 *   200 { exists: true, needsPasswordSetup: false, name }  → digitar senha
 *   403 { error }                      → conta inativa
 *
 * Nota: este endpoint vaza "existe vs não existe" pra qualquer um que tenha
 * a URL. Aceitável pra ferramenta interna com domínio @v4company.com fechado;
 * se virar SaaS público, trocar por resposta unificada + rate limit.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = checkEmailSchema.parse(body);

    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ exists: false });
    }
    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Conta inativa. Procure o administrador da sua organização." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      exists: true,
      needsPasswordSetup: !user.passwordHash,
      name: user.name,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    console.error("[POST /api/auth/check-email]", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
