# V4 Design Tokens

Todos os tokens extraídos do CSS real do dashboard V4. Use estes valores; não invente cores próximas.

## Variáveis CSS — tema light (padrão)

Cole este bloco dentro de `<style>` no `<head>` ou no boilerplate (já está lá).

```css
:root {
  /* Backgrounds e texto */
  --background: 0 0% 99%;          /* quase branco */
  --foreground: 0 0% 9%;           /* quase preto */
  --card: 0 0% 100%;               /* branco puro */
  --card-foreground: 0 0% 9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 9%;

  /* Primário (preto) */
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 99%;

  /* Secundário (cinza claro) */
  --secondary: 0 0% 96%;
  --secondary-foreground: 0 0% 9%;

  /* Muted (cinza claro, texto cinza) */
  --muted: 0 0% 96%;
  --muted-foreground: 0 0% 45%;

  /* Accent — VERMELHO V4 (bordô) — cor distintiva */
  --accent: 355 59% 26%;
  --accent-foreground: 0 0% 100%;

  /* Destructive (vermelho saturado) */
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;

  /* Borders e inputs */
  --border: 0 0% 90%;
  --input: 0 0% 90%;
  --ring: 0 0% 9%;

  /* Radius padrão (cantos discretos) */
  --radius: 0.25rem;

  /* Sidebar — tons ligeiramente distintos do background principal */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 0 0% 9%;
  --sidebar-primary: 0 0% 9%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 0 0% 94%;
  --sidebar-accent-foreground: 0 0% 9%;
  --sidebar-border: 0 0% 90%;
  --sidebar-ring: 0 0% 9%;

  /* Sistema de farol (semáforo de metas) */
  --success: 142 71% 25%;          /* verde escuro — ≥120% meta */
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;           /* amarelo/laranja — 80-99% */
  --warning-foreground: 0 0% 10%;

  /* Header de tabelas — bordô V4 */
  --table-header: 0 43% 35%;
  --table-header-foreground: 0 0% 100%;
}
```

## Variáveis CSS — tema dark

```css
.dark {
  --background: 0 0% 4%;
  --foreground: 0 0% 93%;
  --card: 0 0% 6%;
  --card-foreground: 0 0% 93%;
  --popover: 0 0% 6%;
  --popover-foreground: 0 0% 93%;
  --primary: 0 0% 93%;
  --primary-foreground: 0 0% 4%;
  --secondary: 0 0% 12%;
  --secondary-foreground: 0 0% 93%;
  --muted: 0 0% 12%;
  --muted-foreground: 0 0% 60%;
  --accent: 355 40% 40%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 62% 30%;
  --destructive-foreground: 0 0% 93%;
  --border: 0 0% 15%;
  --input: 0 0% 15%;
  --ring: 0 0% 93%;
  --sidebar-background: 0 0% 4%;
  --sidebar-foreground: 0 0% 93%;
  --sidebar-primary: 0 0% 93%;
  --sidebar-primary-foreground: 0 0% 4%;
  --sidebar-accent: 0 0% 10%;
  --sidebar-accent-foreground: 0 0% 93%;
  --sidebar-border: 0 0% 15%;
  --sidebar-ring: 0 0% 93%;
  --table-header: 0 43% 35%;       /* mantém bordô no dark */
  --table-header-foreground: 0 0% 100%;
}
```

## Config Tailwind — extend (no boilerplate)

```js
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        'table-header': {
          DEFAULT: 'hsl(var(--table-header))',
          foreground: 'hsl(var(--table-header-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
};
```

## Sistema de farol (semáforo de metas)

Cores que indicam atingimento em tabelas de OKR/KR. **Não invente outras cores pra status numérico.**

| Faixa | Cor | Classe Tailwind | HSL |
|---|---|---|---|
| < 80% | Preto | `bg-foreground` ou `bg-black` | `0 0% 9%` |
| 80-99% | Amarelo/laranja | `bg-warning` | `38 92% 50%` |
| 100-119% | Verde médio | `bg-[hsl(142,71%,45%)]` | `142 71% 45%` |
| ≥ 120% | Verde escuro | `bg-success` | `142 71% 25%` |

Em badges/legendas use quadradinhos: `<span class="h-2.5 w-2.5 rounded-sm bg-warning"></span>`.

## Tipografia

- **Família primária**: `Inter` (Google Fonts, pesos 400/500/600/700)
- **Família mono**: ui-monospace (para números tabulares, mas use `tabular-nums` em vez de mudar família)
- **Tamanhos comuns**:
  - `text-xs` (12px) — tabelas, badges, metadados
  - `text-sm` (14px) — corpo, formulários, navegação
  - `text-base` (16px) — texto longo
  - `text-xl` (20px) — títulos de tela (`<h1>`)
  - `text-2xl`+ — só em hero/landing
- **Peso**:
  - `font-medium` (500) — padrão para títulos
  - `font-semibold` (600) — para ênfase moderada (h1)
  - `font-bold` (700) — raro, só destaques fortes
- **Tracking**:
  - Headers de tabela: `uppercase tracking-wider text-[10px]`
  - Badges "breve": `uppercase tracking-widest text-[8px]`

## Espaçamento

- **Paddings de células de tabela**: `px-3 py-1.5` (denso)
- **Padding de botão padrão**: `px-3 py-2 h-8` ou `h-9 px-4`
- **Padding de card**: `p-4` ou `p-6` para destaque
- **Gap entre elementos**: `gap-2` (8px) é o padrão, `gap-3` (12px) para grupos
- **Margem entre seções**: `mb-3` ou `mb-4`

## Sombras

V4 é minimalista — quase sem sombras. Use só:

- **Sticky header de tabela**: `shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)]`
- **Card flutuante** (raro): `shadow-sm`

## Border radius

- **Padrão**: `rounded` (0.25rem) — botões, inputs, cards
- **Botões pequenos**: `rounded-md` (calc - 2px ≈ 0.125rem)
- **Pílulas/badges circulares**: `rounded-full`
- **Quadradinhos de legenda**: `rounded-sm`
- **NUNCA**: `rounded-2xl`, `rounded-3xl` — destoa do V4

## Classes utilitárias customizadas

```css
/* Garante números monoespaçados em colunas numéricas */
.tabular-nums { font-variant-numeric: tabular-nums; }

/* Linha alternada em tabelas */
.bg-muted\/30 { background-color: hsl(var(--muted) / 0.3); }
```
