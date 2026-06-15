# V4 Design System

Design system oficial da V4 Company — paleta bordô/branco, tipografia Inter, tokens shadcn-style, densidade alta estilo dashboard de OKRs, sidebar lateral, sistema de farol por cor.

Esta é a fonte da verdade para qualquer interface do GTM OS V4. Telas, protótipos, artifacts e componentes de produto seguem o que está aqui.

---

## Estrutura

```
design-system/
├── README.md                  ← você está aqui — overview, princípios, workflow
├── package.json               ← manifesto do pacote (@v4/design-system) — exports p/ uso externo
├── index.ts                   ← barrel dos componentes React (export { V4Logo })
├── tokens.css                 ← variáveis CSS (light + dark) — importe no entrypoint global
├── tailwind.config.ts         ← preset Tailwind com todos os tokens V4 mapeados
├── references/
│   ├── tokens.md              ← referência humana: cores HSL, tipografia, espaçamento
│   ├── components.md          ← componentes primitivos: botões, inputs, badges, cards…
│   └── patterns.md            ← padrões compostos: tabela densa, sidebar, KPI, filtros…
├── components/
│   └── V4Logo.tsx             ← logo da V4 como componente React (use em qualquer tela)
└── assets/
    ├── boilerplate.html       ← playground HTML standalone (Tailwind CDN + tokens prontos)
    └── v4-logo.svg            ← logo oficial em SVG (fonte canônica do `V4Logo.tsx`)
```

> **Pacote:** `@v4/design-system`. É distribuído como **código-fonte** (`.ts`/`.tsx`, sem etapa de build) — o app consumidor transpila via bundler. Dentro deste repo o consumo é por caminho relativo/alias; em outros apps, pelo nome do pacote (ver "Como usar").

### Como usar o logo

**Em React:**
```tsx
import { V4Logo } from "@/design-system/components/V4Logo";

<V4Logo className="h-6 w-6" />
```

**Em HTML standalone:** inline o SVG de `assets/v4-logo.svg` ou referencie via `<img src="…/v4-logo.svg" alt="V4" />`.

---

## Como usar

### 1. Em OUTRO app React/Next (kit portável) — `@v4/design-system`

O pacote é distribuído como **código-fonte** (sem build). Escolha um método pra trazer a pasta pro projeto e depois faça o _wiring_ (passos A–E).

#### Instalar (escolha um)

```bash
# a) Git submodule (recomendado p/ time interno — atualiza com `git submodule update --remote`)
git submodule add <url-do-repo> vendor/v4-design-system
npm i ./vendor/v4-design-system          # registra @v4/design-system no node_modules

# b) Tarball (snapshot versionado, sem registry)
#   no repo do DS:    npm pack            → gera v4-design-system-0.1.0.tgz
#   no app consumidor: npm i ../caminho/v4-design-system-0.1.0.tgz

# c) Cópia simples (mais rápido, menos sustentável)
cp -R caminho/design-system ./src/design-system   # e importe por caminho relativo
```

> Para publicar num **registry privado** (npm/GitHub Packages) e instalar com `npm i @v4/design-system`, remova `"private": true` do `package.json` e configure o registry. Submodule/tarball não exigem isso.

#### Wiring (Next.js)

**A. Tokens CSS** — importe antes do seu CSS global (define as variáveis `--accent`, etc.):

```ts
// app/layout.tsx
import "@v4/design-system/tokens.css";
import "./globals.css"; // seu CSS continua só com @tailwind base/components/utilities
```

**B. Preset do Tailwind** — herda cores, radius e fontes V4:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";
import v4Preset from "@v4/design-system/tailwind";

export default {
  presets: [v4Preset],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
} satisfies Config;
// (alternativa equivalente: `...v4Preset` em vez de `presets: [v4Preset]`)
```

**C. Transpilar o pacote** — ele ship’a `.ts/.tsx` crus:

```ts
// next.config.ts
export default { transpilePackages: ["@v4/design-system"] };
```

**D. Fonte Inter** — os tokens assumem Inter:

```tsx
// app/layout.tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-inter" });
// <html className={inter.variable}><body className="font-sans">…
```

**E. Dark mode** (opcional) — adicione/remova a classe `dark` no `<html>`.

#### Usar

```tsx
import { V4Logo } from "@v4/design-system";

<V4Logo className="h-6 w-6" />
<button className="bg-accent text-accent-foreground h-9 px-4 rounded text-sm font-medium">
  Confirmar
</button>
```

### 1.b. Dentro deste repo (monorepo do GTM OS)

Aqui o consumo é por caminho relativo/alias — não pelo nome do pacote:

```ts
// src/app/globals.css → @import "../../design-system/tokens.css";
// tailwind.config.ts   → import v4Config from "./design-system/tailwind.config"; export default { ...v4Config, content: [...] }
// componentes          → import { V4Logo } from "@/design-system/components/V4Logo";
```

### 2. Em um protótipo HTML standalone (mockup rápido)

Copie `assets/boilerplate.html`, renomeie e edite. Já vem com Tailwind CDN, tokens injetados, fonte Inter carregada, lucide icons e layout sidebar+header pronto. Abra direto no browser.

### 3. Como referência consultiva

Os três arquivos em `references/` são docs lidas por humanos (e por LLMs gerando UI). Sempre consulte `references/tokens.md` antes de adicionar qualquer cor; `references/components.md` antes de criar um botão/input/badge novo; `references/patterns.md` antes de montar uma tela do zero.

---

## Princípios visuais V4

Não são opcionais. É isso que dá identidade V4:

- **Densidade alta.** Tabelas com `text-xs`, padding `px-3 py-1.5`, linhas alternadas (`bg-card` / `bg-muted/30`). Nada de "espaço respirável" demais — V4 mostra muita informação na tela.
- **Cor é informação.** O bordô (`--accent`) marca header de tabela e ações primárias. Verde escuro (`--success`) = ≥120% meta. Amarelo (`--warning`) = 80-99%. Verde médio (`hsl(142,71%,45%)`) = 100-119%. Preto = <80%. **Nunca use cores fora desse vocabulário sem justificar.**
- **Tipografia tabular.** Números em tabelas sempre com `tabular-nums`. Headers de coluna em `text-xs font-medium uppercase tracking-wider`.
- **Cantos discretos.** `rounded` (0.25rem) na maioria, nada de `rounded-2xl`.
- **Sidebar lateral fixa.** Largura 16rem, fundo `bg-sidebar`, header com logo V4 + nome do app.
- **Header superior fino.** Altura `h-12`, com toggle de sidebar à esquerda e ações à direita.
- **Ícones lucide.** 16px em menus, 14px em ações inline. Carregar via CDN `lucide.js` ou `lucide-react` no Next.

### Sistema de farol (semáforo de metas)

| Faixa     | Cor           | Classe                          | HSL              |
| --------- | ------------- | ------------------------------- | ---------------- |
| < 80%     | Preto         | `bg-foreground` / `bg-black`    | `0 0% 9%`        |
| 80–99%    | Amarelo       | `bg-warning`                    | `38 92% 50%`     |
| 100–119%  | Verde médio   | `bg-[hsl(142,71%,45%)]`         | `142 71% 45%`    |
| ≥ 120%    | Verde escuro  | `bg-success`                    | `142 71% 25%`    |

---

## Estrutura padrão de uma tela V4

```
┌─────────┬────────────────────────────────────────┐
│ Sidebar │ Header (h-12, breadcrumb + ações)      │
│ (16rem) ├────────────────────────────────────────┤
│         │ Title + filtros (h1 + chips/selects)   │
│  Logo   │                                        │
│  Menu   │ Legenda (se tabela com farol)          │
│         │                                        │
│         │ Conteúdo principal (scroll próprio)    │
└─────────┴────────────────────────────────────────┘
```

Vide `assets/boilerplate.html` para esqueleto pronto, ou `references/patterns.md` para snippets de cada bloco.

---

## Workflow para gerar uma tela nova

1. **Entender o que é.** Se for ambíguo, pergunte 1-2 coisas curtas antes de codar.
2. **Ler `references/tokens.md`.** Confirme cores/espaçamento antes de escrever classes.
3. **Identificar o padrão.** Se for sidebar+tabela / formulário / dashboard de KPIs, copie de `references/patterns.md`. Se for novo, componha a partir de `references/components.md`.
4. **Começar do boilerplate** (`assets/boilerplate.html`) para HTML, ou do layout em `references/patterns.md` para React.
5. **Dados reais > Lorem.** Se houver dados (CSV, lista de KRs), use-os.

---

## Stack alvo

**Next.js 15 + TypeScript + Tailwind v3 + shadcn/ui pattern.** Os tokens já foram desenhados para esse ecossistema (HSL via variáveis CSS, dark mode via classe `.dark`, fonte Inter). Pra protótipos rápidos sem build, o `boilerplate.html` resolve com Tailwind CDN.

---

## Mobile

V4 dashboards são **desktop-first**. Se algo precisar de mobile, ok, mas o default é desktop. Densidade alta não funciona em telas <1024px sem reflow custoso.

---

## Quando NÃO usar este DS

- Apresentação para cliente externo que não conhece V4 → considere neutralizar a identidade.
- Documento Word / PDF / planilha → use ferramentas próprias (docx, pdf, xlsx), não interface.
- Diagrama de processo com swimlanes → use ferramenta de diagrama (Excalidraw, draw.io).
- Slide deck → PowerPoint/Keynote, não HTML.

---

## Manutenção

- Mudou uma cor? Atualize **3 lugares**: `tokens.css`, `references/tokens.md`, e a tabela no topo deste README.
- Adicionou componente novo? Exporte no `index.ts`, documente em `references/components.md` e mantenha as classes Tailwind dele dentro do vocabulário de tokens.
- Criou um pattern composto reutilizável? Adicione em `references/patterns.md` para evitar reinvenção.
- Mudança que os apps externos vão puxar? Suba a `version` no `package.json` (semver) — quebra de tokens/API = major.
