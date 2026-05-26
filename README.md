# V4 GTM OS

Sistema operacional da rede de franquias V4 Company. Matriz define premissas estratégicas, ~80 unidades consomem e fazem input mensal de realizado.

Este repositório está em **Sub-fase 1A** — fundação técnica: organizações, usuários, papéis, escopo e mock de autenticação para dev.

---

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Estilo:** Tailwind v3 + Design System V4 ([design-system/](design-system/))
- **Banco:** PostgreSQL (Supabase)
- **ORM:** Drizzle ORM + drizzle-kit
- **Validação:** Zod
- **Ícones:** lucide-react

---

## Setup local

### 1. Criar projeto Supabase

1. Crie um projeto novo em [supabase.com](https://supabase.com) (free tier basta).
2. Em **Project Settings → Database**, copie duas connection strings:
   - **Transaction Pooler** (porta 6543) — usado pelo app em runtime
   - **Direct Connection** (porta 5432) — usado pelas migrations

### 2. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` e cole as connection strings:

```
DATABASE_URL=postgresql://postgres.xxx:senha@aws-0-xxx.pooler.supabase.com:6543/postgres
DATABASE_URL_DIRECT=postgresql://postgres:senha@db.xxx.supabase.co:5432/postgres
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Rodar migrations (quando houver schema)

```bash
npm run db:generate   # gera SQL diff a partir do schema.ts
npm run db:migrate    # aplica no banco
npm run db:seed       # popula com dados iniciais (Matriz + unidades dummies + usuários de teste)
```

> Em F1.0 (esta fase) o schema ainda está vazio. As primeiras tabelas entram em F1.1.

### 5. Subir o dev server

```bash
npm run dev
```

App em http://localhost:3000.

---

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe Next.js dev server (Turbopack) na porta 3000 |
| `npm run build` | Build de produção |
| `npm run start` | Roda build de produção |
| `npm run lint` | Lint via eslint-config-next |
| `npm run db:generate` | Gera migration SQL a partir de mudanças em `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migrations pendentes no banco |
| `npm run db:push` | (Atalho dev) Empurra schema direto sem gerar migration — não usar em prod |
| `npm run db:studio` | Abre Drizzle Studio (GUI do banco) em http://localhost:4983 |
| `npm run db:seed` | Roda script de seed em `src/db/seed.ts` |

---

## Estrutura

```
.
├── src/
│   ├── app/                  ← rotas (Next.js App Router)
│   │   ├── layout.tsx        ← root layout com AppShell
│   │   ├── page.tsx          ← home (placeholder)
│   │   └── globals.css       ← Tailwind + import dos tokens V4
│   ├── components/
│   │   └── app-shell.tsx     ← shell global (sidebar + header)
│   ├── db/
│   │   ├── index.ts          ← cliente Postgres + Drizzle
│   │   ├── schema.ts         ← definição de tabelas (cresce por sub-fase)
│   │   ├── seed.ts           ← script de seed
│   │   └── migrations/       ← SQL gerado por drizzle-kit
│   └── lib/
│       └── env.ts            ← validação de env vars com zod
├── design-system/            ← Design System V4 (tokens, componentes, patterns)
│   ├── README.md
│   ├── tokens.css
│   ├── tailwind.config.ts
│   ├── components/
│   ├── references/
│   └── assets/
├── drizzle.config.ts         ← config do drizzle-kit
├── tailwind.config.ts        ← config Tailwind (estende do DS)
├── .env.example              ← template de env vars
└── package.json
```

---

## Documentação de desenvolvimento

- **Design System:** [design-system/README.md](design-system/README.md)
- **Plano da Sub-fase 1A:** `V4_OS_plano_subfase_1A.md` (raiz do projeto)

---

## Convenções

- **Idioma do produto:** pt-BR. Labels, mensagens de erro, validações — tudo em português.
- **Idioma do código:** identificadores em inglês (variáveis, funções, tabelas). Comentários em pt-BR.
- **Auditoria:** toda alteração relevante grava em `audit_log`. Auditoria não é feature — é fundação.
- **Princípios visuais:** consulte [design-system/README.md](design-system/README.md). Densidade alta, cor como informação, tabelas estilo dashboard V4.
