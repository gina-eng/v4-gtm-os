import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Frescura > reuso. Zera o Router Cache do cliente para páginas dinâmicas:
    // toda navegação re-busca o RSC do servidor em vez de reaproveitar o payload
    // em cache no cliente. Combinado com a invalidação por tags do forecast
    // (revalidateForecast*), garante que uma edição apareça imediatamente ao
    // navegar (ex.: salvar premissa → abrir Forecast).
    //
    // Trade-off conhecido e aceito: mais requisições de RSC conforme a rede
    // escala. `static` (links com prefetch explícito) fica no default — o schema
    // do Next exige >= 30s e essas rotas mudam pouco.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
