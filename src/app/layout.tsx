import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/lib/auth/auth-context";
import { getCurrentSession } from "@/lib/auth/current-user";
import "./globals.css";

/** Rotas liberadas mesmo com o setup da unidade incompleto. /iniciar (concluir o
 *  setup), /usuarios (gestão de acessos) e /login. /api não passa por este layout. */
function rotaLiberadaSemSetup(pathname: string): boolean {
  return (
    pathname === "/iniciar" ||
    pathname.startsWith("/iniciar/") ||
    pathname === "/usuarios" ||
    pathname.startsWith("/usuarios/") ||
    pathname === "/login"
  );
}

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "V4 GTM OS",
  description: "Plataforma GTM da V4 Company",
};

// O layout lê cookies via getCurrentSession() — precisa ser sempre dinâmico
// para que a sessão (e activeOrganization) sejam re-resolvidas em cada request.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve sessão no server. Se houver, embrulha em AuthProvider + AppShell.
  // Se não houver, renderiza o children "nu" — usado pelas rotas públicas (/login).
  // O middleware (src/middleware.ts) garante que rotas protegidas nunca chegam aqui sem sessão.
  const session = await getCurrentSession();

  // Gate de setup (defesa real — esconder na nav é burlável por URL): unidade com
  // setup incompleto só acessa /iniciar e /usuarios; o resto redireciona pro wizard.
  // setupConcluido já é true pra matriz/consolidado, então só trava unidade mesmo.
  if (session && !session.setupConcluido) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (!rotaLiberadaSemSetup(pathname)) {
      redirect("/iniciar");
    }
  }

  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans">
        {session ? (
          <AuthProvider session={session}>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
