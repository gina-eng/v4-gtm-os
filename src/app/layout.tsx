import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/lib/auth/auth-context";
import { getCurrentSession } from "@/lib/auth/current-user";
import "./globals.css";

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
