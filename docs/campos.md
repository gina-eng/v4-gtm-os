# Catálogo de Campos — V4 GTM OS

> Inventário exaustivo de **todos os campos** do sistema, separando o que é input do usuário, default da Matriz e o que é calculado/derivado. Inclui tipos TypeScript, unidades, validações Zod, onde aparecem na UI e fórmulas.
>
> **Última atualização:** 2026-05-25
> **Versão do schema mock:** `__v4UnitSetupsV5` (após adição do step `realizado-historico`)

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Convenções de leitura](#2-convenções-de-leitura)
3. [Entidades persistidas (DB)](#3-entidades-persistidas-db)
4. [Setup da unidade (`UnitSetup`)](#4-setup-da-unidade-unitsetup)
5. [Realizado Histórico Mensal](#5-realizado-histórico-mensal)
6. [Campos calculados / derivados](#6-campos-calculados--derivados)
7. [Enums e tipos compartilhados](#7-enums-e-tipos-compartilhados)
8. [Auth, ACL e schemas de API (infraestrutura)](#8-auth-acl-e-schemas-de-api-infraestrutura)
9. [Estado de UI (não persistido)](#9-estado-de-ui-não-persistido)
10. [Gaps de validação e dívida técnica](#10-gaps-de-validação-e-dívida-técnica)
11. [Mapa de rotas → campos](#11-mapa-de-rotas--campos)

---

## 1. Visão geral

O sistema modela uma **rede de franquias** com dois níveis:

- **Matriz**: define as premissas-padrão do modelo (P1–P17) e administra a rede.
- **Unidades**: clonam as premissas e personalizam para sua realidade no wizard `/iniciar`.

Os campos se dividem em quatro grandes blocos:

| Bloco | Tabela / Tipo | Persistido? | Quem preenche |
|------|---------------|------------|---------------|
| Entidades de cadastro | `organizations`, `users`, `memberships`, `sessions`, `audit_log` | Sim (Drizzle schema) | Matriz / admin |
| Setup da unidade (premissas P1–P17 + time) | `UnitSetup` (mock in-memory) | Mock — vai para `unit_setups` JSONB | Unidade no `/iniciar` |
| Realizado mensal | `RealizadoMensal[]` dentro de `UnitSetup.realizadoHistorico` | Mock | Unidade |
| Calculados | Fórmulas em `src/lib/` e nos componentes | Não persiste — recomputa a cada render | — |

Hoje **nada está em banco real**: tudo é mock em memória (`globalThis`). Quando `DATABASE_URL` conectar, este documento ainda serve de fonte: os tipos TS e os schemas Zod já estão prontos.

---

## 2. Convenções de leitura

- **Origem** indica de onde o valor vem:
  - `input unidade`: a unidade digita no wizard ou na tela de edição contínua.
  - `input matriz`: a Matriz digita (ou via API admin).
  - `default matriz`: vem de uma constante em [matriz-defaults.ts](../src/lib/premissas/matriz-defaults.ts) e funciona como pré-preenchimento.
  - `auto`: gerado pelo sistema (uuid, timestamp, etc.).
  - `derivado`: calculado a partir de outros campos.
- **Validação Zod**: trecho do schema em [unit-setup.ts (validations)](../src/lib/validations/unit-setup.ts). `—` significa "sem schema explícito".
- **Unidades**: `R$` (BRL), `%`, `qtd`, `dias`, `meses`, `mês ISO` (YYYY-MM), `—` (sem unidade aplicável).
- Quando um campo aceita `null` significativo (ex.: `faixaMax: null` = "aberto à direita"), está marcado explicitamente.

---

## 3. Entidades persistidas (DB)

Definidas em [src/db/schema.ts](../src/db/schema.ts).

### 3.1 `organizations`

Cada Matriz/unidade da rede. Matriz tem `type="matriz"` e `parentId=null`; unidades têm `type="unidade"` e `parentId` apontando para a Matriz.

| Campo | Tipo | Unidade | Origem | Validação Zod | Notas |
|------|------|--------|-------|---------------|-------|
| `id` | uuid | — | auto (`defaultRandom`) | — | PK |
| `type` | enum `"matriz" \| "unidade"` | — | seed/criação | enum | Existe **uma** matriz por instalação |
| `parentId` | uuid \| null | — | criação | FK | Sempre aponta para a Matriz nas unidades |
| `slug` | varchar(60) | — | input | `min(1)`, `max(60)`, `^[a-z0-9-]+$` | Único; usado em URLs |
| `name` | varchar(120) | — | input | `min(3)`, `max(120)`, trim | Nome exibido no header |
| `status` | enum `"active" \| "inactive" \| "pending"` | — | admin | enum | Controla visibilidade |
| `horizonteAtual` | enum `"H1"–"H5"` | — | admin | enum | Define qual horizonte de P1 a unidade aplica |
| `socioExecutivoNome` | varchar(120) \| null | — | input | `max(120)`, trim | Responsável pela unidade |
| `socioExecutivoEmail` | varchar(255) \| null | — | input | email válido ou vazio | Domínio sugerido `@v4company.com` |
| `regional` | varchar(30) \| null | — | input | enum `REGIONAL_SIGLAS` | RS, MG1–3, RJ, SP1–3, NE, SC, PR, MATRIZ, NUNES, COLLI, SEM_PREENCHIMENTO |
| `estado` | varchar(60) \| null | UF | input | `max(60)`, trim | — |
| `cidade` | varchar(120) \| null | — | input | `max(120)`, trim | — |
| `telefone` | varchar(30) \| null | — | input | `max(30)`, trim | Formato livre |
| `dataInicio` | date \| null | — | input | `^\d{4}-\d{2}-\d{2}$` | Inauguração da unidade |
| `createdAt` | timestamptz | — | auto | — | `defaultNow()` |
| `updatedAt` | timestamptz | — | auto | — | atualizado a cada mudança |

**Índices:** `idx_organizations_single_matriz` (única matriz ativa), `idx_organizations_parent`, `idx_organizations_type_status`, `idx_organizations_regional`.

### 3.2 `users`

| Campo | Tipo | Origem | Validação | Notas |
|------|------|-------|-----------|-------|
| `id` | uuid | auto | — | PK |
| `email` | varchar(255) | input (convite) | email, lowercase, único, domínio `@v4company.com` | login |
| `name` | varchar(120) | input | `min(2)`, `max(120)`, trim | — |
| `passwordHash` | varchar(255) \| null | auth backend | — | `null` em dev (auth mockada) |
| `status` | enum `"pending" \| "active" \| "inactive"` | sistema | enum | em dev nasce `active`; em prod, `pending` até ativar |
| `activeOrganizationId` | uuid \| null | user escolhe via switcher | FK | matriz vê null para "consolidado" |
| `lastLoginAt` | timestamptz \| null | auto | — | atualizado em cada login |
| `activationToken` | varchar(255) \| null | auth | — | TTL controlado por `activationExpiresAt` |
| `activationExpiresAt` | timestamptz \| null | auth | — | — |
| `resetToken` | varchar(255) \| null | auth | — | recovery de senha |
| `resetExpiresAt` | timestamptz \| null | auth | — | — |
| `createdAt` | timestamptz | auto | — | — |
| `updatedAt` | timestamptz | auto | — | — |

**Índices:** `idx_users_email_lower` (case-insensitive), `idx_users_active_org`.

### 3.3 `memberships`

Vínculo usuário ↔ organização. Pode ser direto (`organizationId` setado) ou regional (`regional` setado — cobre várias unidades da regional).

| Campo | Tipo | Origem | Notas |
|------|------|-------|-------|
| `id` | uuid | auto | PK |
| `userId` | uuid | input | FK; cascade delete |
| `organizationId` | uuid \| null | input | **Mutuamente exclusivo com `regional`** |
| `regional` | varchar(30) \| null | input | sigla regional; concede acesso a todas as unidades dela |
| `role` | enum `"admin" \| "gerente" \| "coordenador"` | input | controla ACL |
| `status` | enum `"active" \| "inactive"` | admin | revogar = `inactive`, não delete |
| `createdAt` | timestamptz | auto | — |
| `updatedAt` | timestamptz | auto | — |

**Constraints:**
- `UNIQUE (user_id, organization_id)` quando `organizationId` não é null
- `UNIQUE (user_id, regional)` quando `regional` não é null
- Check (a nível de código): exatamente um entre `organizationId` e `regional`

### 3.4 `sessions`

| Campo | Tipo | Origem | Notas |
|------|------|-------|-------|
| `id` | uuid | auto | PK |
| `userId` | uuid | auth | FK |
| `token` | varchar(255) | auto | único, usado como bearer/cookie |
| `expiresAt` | timestamptz | auth (TTL) | — |
| `createdAt` | timestamptz | auto | — |
| `lastUsedAt` | timestamptz | auto | atualizado a cada request |
| `ip` | varchar(45) \| null | request metadata | IPv4/IPv6 |
| `userAgent` | varchar(255) \| null | request metadata | — |

### 3.5 `audit_log`

| Campo | Tipo | Origem | Notas |
|------|------|-------|-------|
| `id` | uuid | auto | PK |
| `actorUserId` | uuid \| null | session | null = ação do sistema |
| `organizationId` | uuid \| null | contexto | null = ação global da Matriz |
| `action` | varchar(60) | código | `create`, `update`, `delete`, `invite`, ... |
| `entity` | varchar(60) \| null | código | `organization`, `user`, `membership`, `setup-step`, ... |
| `entityId` | uuid \| null | código | qual recurso foi afetado |
| `changes` | jsonb \| null | código | diff before/after (estrutura ainda não validada) |
| `ts` | timestamptz | auto | — |
| `ip` | varchar(45) \| null | request | — |
| `userAgent` | varchar(255) \| null | request | — |

---

## 4. Setup da unidade (`UnitSetup`)

Mock in-memory em [src/db/repositories/unit-setup.ts](../src/db/repositories/unit-setup.ts). Cada unidade tem um `UnitSetup` próprio. Os campos abaixo viram colunas/JSONB quando a tabela `unit_setups` for criada.

### 4.0 Controle de progresso

| Campo | Tipo | Notas |
|------|------|-------|
| `organizationId` | uuid | chave do setup |
| `completedSteps` | `SetupStep[]` | lista de steps já salvos |
| `completedAt` | Date \| null | quando todos os steps foram concluídos |
| `updatedAt` | Date | última modificação |

**`SetupStep` (ordem do wizard):**

1. `horizontes` — *Horizontes de Crescimento* (read-only, balizamento)
2. `time-comercial` — *Time Comercial*
3. `metricas-operacionais` — *Capacidade Operacional* (P17)
4. `tiers-receita` — *Tiers & Receita* (P2 + P3)
5. `leads-investimento` — *Leads & Investimento* (P4 + P6)
6. `conversoes-inbound` — *Conversões Inbound* (P8 + P9 + P10)
7. `conversoes-outbound` — *Conversões Outbound* (P11–P15)
8. `mix-subcanais` — *Mix Subcanais* (P16)
9. `realizado-historico` — *Realizado Histórico* (novo — alimenta `/realizado`)

### 4.1 P1 — Horizontes de Crescimento (`HorizonteCrescimento`)

Read-only no wizard. Define a taxa de crescimento mensal aplicada na projeção da unidade.

| Campo | Tipo | Unidade | Origem | Validação | Notas |
|------|------|--------|-------|-----------|-------|
| `h` | enum `"H1"–"H5"` | — | default matriz | enum | identificador |
| `faixaMin` | number | R$ | default matriz | `min(0)` | piso de faturamento mensal |
| `faixaMax` | number \| null | R$ | default matriz | `min(0)`, nullable, `refine ≥ faixaMin` | `null` = aberto à direita (H5) |
| `tempoMaxMeses` | number \| null | meses | default matriz | `min(0)`, `max(120)`, nullable | `null` = sem prazo (H5) |
| `crescMensalPct` | number | % | default matriz | `min(0)`, `max(1000)` | taxa de crescimento mensal mínima |

**Defaults atuais:**

| H | faixaMin | faixaMax | tempoMax | cresc% |
|---|---------|---------|---------|-------|
| H1 | 0 | 60.000 | 3 | 40 |
| H2 | 60.000 | 150.000 | 6 | 30 |
| H3 | 150.000 | 450.000 | 12 | 20 |
| H4 | 450.000 | 900.000 | 18 | 7 |
| H5 | 900.000 | null | null | 2.5 |

### 4.2 P2 — Tiers de Cliente (`TierCliente`)

Definido na Matriz; **read-only na unidade** (a unidade não negocia faixa, TCV ou CPL).

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `tier` | enum `"Tiny"–"Enterprise"` | — | enum | 5 segmentos |
| `faturamentoMin` | number | R$/ano | `min(0)` | piso anual do cliente |
| `faturamentoMax` | number \| null | R$/ano | `min(0)`, nullable, `≥ faturamentoMin` | `null` em Enterprise |
| `tcvBooking` | number | R$ | `min(0)` | TCV típico inbound |
| `tcvProdCom` | number | R$ | `min(0)` | TCV típico outbound |
| `cplLb` | number | R$ | `min(0)` | CPL Lead Broker |
| `cplBb` | number | R$ | `min(0)` | CPL Black Box |

### 4.3 P3 — Receita por Produto / Tier (`ReceitaProduto`)

Distribui o TCV em três produtos (Saber/Ter/Exec). Editável na unidade.

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `tier` | enum tier | — | enum | linha por tier |
| `saberPct` | number | % | `min(0)`, `max(100)` | Saber = consultoria |
| `saberAt` | number | R$ | `min(0)` | ticket Saber |
| `terPct` | number | % | `min(0)`, `max(100)` | Ter = plataforma |
| `terAt` | number | R$ | `min(0)` | ticket Ter |
| `execPct` | number | % | `min(0)`, `max(100)` | Exec = implementação |
| `execAt` | number | R$ | `min(0)` | ticket Exec |

### 4.4 P4 — Distribuição de Mercado (`DistMercado`)

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `tier` | enum tier | — | enum | — |
| `pctMercado` | number | % | `min(0)`, `max(100)` | participação do tier no mercado |
| `entraHorizonte` | enum `"H1"–"H5"` | — | enum | em qual horizonte o tier começa a entrar |

> **Regra:** a soma de `pctMercado` dos tiers **ativos no horizonte da unidade** deve totalizar 100% (renormaliza no `useState`).

### 4.5 P6 — Investimento em Mídia (`InvestimentoMidia`)

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `h` | enum horizonte | — | enum | — |
| `pctProducao` | number | % | `min(0)`, `max(100)` | % da receita que volta como mídia |
| `splitLb` | number | % | `min(0)`, `max(100)` | parcela direcionada a Lead Broker |
| `splitBb` | number | % | `min(0)`, `max(100)` | parcela direcionada a Black Box |
| `bbPiso` | number | R$ | `min(0)` | piso mensal de BB (lockable — 0 = não disponível) |
| `regra` | string | — | `max(255)`, trim | nota qualitativa |

> Em P6 vale a convenção **lockableZero**: `bbPiso` e `splitBb=0` significam "não liberado neste horizonte", não "valor zero".

### 4.6 P8 / P9 — Conversões Inbound (`ConversaoInbound`)

Mesmo shape para Lead Broker (P8) e Black Box (P9).

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `tier` | enum tier | — | enum | — |
| `cr1` | number | % | `min(0)`, `max(100)` | Lead → MQL |
| `cr2` | number | % | `min(0)`, `max(100)` | MQL → SQL |
| `cr3` | number | % | `min(0)`, `max(100)` | SQL → SAL |
| `cr4` | number | % | `min(0)`, `max(100)` | SAL → Won |
| `cr5` | number | % | `min(0)`, `max(200)` | Won → Ativação (>100% = upsell) |
| `cr6` | number | % | `min(0)`, `max(200)` | Ativação → Renovação |
| `cr7` | number | % | `min(0)`, `max(200)` | Renovação → Expansão |

### 4.7 P10 — Meeting Broker (`ConversaoMeetingBroker`)

Canal Enterprise-only, sem tier.

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `custoSql` | number | R$ | `min(0)` | CPL por SQL pronto |
| `cr3` | number | % | `min(0)`, `max(100)` | SQL → SAL |
| `cr4` | number | % | `min(0)`, `max(100)` | SAL → Won |
| `meta` | string | — | `max(255)`, trim | texto livre (ex.: "~2 deals/tri") |
| `pipeline` | string | — | `max(255)`, trim | texto livre |

### 4.8 P11–P15 — Conversões Outbound (`ConversaoOutbound`)

Mesmo shape para os 5 subcanais (`indicacao`, `eventos`, `recovery`, `recomendacao`, `prospeccao`). Funil curto: `L → SQL → SAL → Won → Ren → Exp` (sem etapa MQL).

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `tier` | enum tier | — | enum | — |
| `cr1` | number | % | `min(0)`, `max(100)` | Lead → SQL |
| `cr3` | number | % | `min(0)`, `max(100)` | SQL → SAL |
| `cr4` | number | % | `min(0)`, `max(100)` | SAL → Won |
| `cr6` | number | % | `min(0)`, `max(200)` | Ativação → Renovação |
| `cr7` | number | % | `min(0)`, `max(200)` | Renovação → Expansão |

### 4.9 P16 — Mix Subcanais Outbound (`MixOutboundHorizonte`)

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `h` | enum horizonte | — | enum | — |
| `indicacao` | number | % | `min(0)`, `max(100)` | — |
| `eventos` | number | % | `min(0)`, `max(100)` | — |
| `recovery` | number | % | `min(0)`, `max(100)` | — |
| `recomendacao` | number | % | `min(0)`, `max(100)` | — |
| `prospeccao` | number | % | `min(0)`, `max(100)` | — |

> **Regra:** soma das 5 colunas por linha deve dar 100% (validação visual em verde/vermelho).

### 4.10 P17 — Métricas Operacionais (`MetricaOperacional`)

Capacidade-base por cargo. Editável na unidade.

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `cargo` | string | — | `min(1)`, `max(60)`, trim | LDR / BDR / SDR / CLOSER / KAM (livre) |
| `wipLimit` | number | qtd/mês | `min(0)`, `max(100_000)` | capacidade máxima mensal do cargo |
| `contratacao` | number | dias | `min(0)`, `max(1095)` | tempo médio de contratação (~3 anos teto) |
| `onboarding` | number | dias | `min(0)`, `max(1095)` | tempo de onboarding |
| `rampagem` | number | meses | `min(0)`, `max(120)` | tempo até produção plena |
| `atingimentoMes` | number | mês sequencial | `min(0)`, `max(120)` | mês em que atinge 100% do WIP |
| `permanencia` | number | meses | `min(0)`, `max(600)` | tempo médio no cargo |
| `turnoverMesPct` | number | % | `min(0)`, `max(100)` | turnover mensal |
| `ligacoesMes` | number | qtd | `min(0)`, `max(1_000_000)` | volume médio de calls; 0 = não se aplica |
| `conexaoPct` | number | % | `min(0)`, `max(100)` | taxa de conexão; 0 = não se aplica |
| `extra` | string | — | `max(255)`, trim | observação livre (não entra em fórmulas) |

### 4.11 Time Comercial (`TimeComercialMembro`)

Pessoas reais da unidade. Cada linha é um investidor.

| Campo | Tipo | Unidade | Validação | Notas |
|------|------|--------|-----------|-------|
| `email` | string | — | `""` OU `email`, lowercase, trim | identificador da pessoa; pode ficar vazio no draft |
| `cargo` | string | — | `min(1)`, `max(60)`, trim | livre, mas geralmente um de LDR/BDR/SDR/CLOSER/KAM |
| `salario` | number | R$ | `min(0)`, `max(1_000_000)` | salário mensal base |
| `comissaoPct` | number | % | `min(0)`, `max(100)` | comissão sobre salário |
| `capacidadePct` | number | % discreto | enum `{0, 25, 50, 75, 90, 100}` | quanto a pessoa entrega da capacidade-padrão do cargo |

---

## 5. Realizado Histórico Mensal

Input da unidade — base da projeção em `/realizado`. Tipo `RealizadoMensal` em [matriz-defaults.ts](../src/lib/premissas/matriz-defaults.ts) e schema em [unit-setup.ts (validations)](../src/lib/validations/unit-setup.ts).

| Campo | Tipo | Unidade | Origem | Validação | Notas |
|------|------|--------|-------|-----------|-------|
| `mes` | string | mês ISO | sistema gera esqueleto | `^\d{4}-\d{2}$` | formato `YYYY-MM` |
| `faturamento` | number | R$ | input unidade | `min(0)` | receita do mês; 0 = ainda não preenchido |
| `investido` | number | R$ | input unidade | `min(0)` | mídia (LB + BB) no mês |
| `leadsIb` | number | qtd | input unidade | `min(0)` | leads inbound |
| `leadsOb` | number | qtd | input unidade | `min(0)` | leads outbound |
| `won` | number | qtd | input unidade | `min(0)` | deals fechados |

**Janela atual:** Jan/2026 → Abr/2026 (`REALIZADO_HISTORICO_DEFAULT`). `ULTIMO_MES_FECHADO` está fixo em `"2026-04"` em [projecao.ts](../src/lib/realizado/projecao.ts). Quando o mês corrente avançar, atualizar essas duas constantes.

---

## 6. Campos calculados / derivados

Não persistem em lugar nenhum — são recomputados a cada render. Mantemos as fórmulas centralizadas em `src/lib/` quando reutilizadas, e inline quando são derivações triviais de uma tela só.

### 6.1 Projeção Realizado vs Projetado

Definida em [src/lib/realizado/projecao.ts](../src/lib/realizado/projecao.ts).

**Modelo:** o Projetado é uma curva **independente do Realizado** dos meses fev–dez. Parte de uma **âncora** (faturamento de Janeiro/2026, único valor do realizado que entra) e capitaliza pela taxa do **horizonte atual da unidade**, fixa o ano inteiro.

```
ancora     = realizadoHistorico["2026-01"].faturamento
taxa       = horizontes.find(h.h === horizonteAtual).crescMensalPct
projetado[2026-01] = ancora
projetado[2026-02] = ancora × (1 + taxa/100)
projetado[2026-03] = projetado[2026-02] × (1 + taxa/100)
...
projetado[2026-12] = ancora × (1 + taxa/100)^11
```

Se `ancora = 0`, todo o ano fica com `projetado = 0`. A curva **não troca de horizonte automaticamente** quando ultrapassa `faixaMax` — a unidade aparece "superando o horizonte", que é a leitura desejada.

| Campo / Label | Fórmula | Dependências | Onde aparece |
|--------------|--------|--------------|-------------|
| `Projetado[mes]` | âncora × `(1 + crescMensalPct/100)^n` | `realizadoHistorico["2026-01"].faturamento`, `horizontes` (P1), `organizations.horizonteAtual` | `/realizado` e preview no step 9 |
| Horizonte aplicado | `organizations.horizonteAtual` (fixo) | `horizonteAtual` | coluna "Horiz." em `/realizado` |
| `aderencia(linha)` | `(realizado ÷ projetado) × 100` | `realizado`, `projetado` | coluna "Aderência" |
| `cacMes({investido, won})` | `investido ÷ won`, 0 quando `won ≤ 0` | `investido`, `won` | coluna "CAC" |
| Realizado acumulado | `Σ linha.realizado` | linhas calculadas | card "Realizado acumulado" |
| Projetado acumulado | `Σ linha.projetado` | linhas calculadas | card "Projetado acumulado" |
| Aderência do ano | `(totalRealizado ÷ totalProjetado) × 100` | acumulados | card "Aderência do ano" |
| `formatMesPt(mes)` | `"2026-03"` → `"Mar 2026"` | `mes` | render das colunas/cards |
| `agregarLinhasMatriz(conjuntos)` | soma mês a mês `realizado` e `projetado` de cada unidade | `LinhaRealizadoProjetado[][]` | `/realizado` no modo Matriz — cada unidade calcula com seu próprio horizonte e a Matriz soma |

**Regra de cor (farol)** — [src/components/premissas/format.ts](../src/components/premissas/format.ts):
- `≥ 120%` → `text-success`
- `100–119%` → verde claro `hsl(142,71%,45%)`
- `80–99%` → `text-warning`
- `< 80%` → `text-foreground` (sem destaque positivo)

### 6.2 Wizard step 2 — Time Comercial

[src/components/iniciar/step-time-comercial.tsx](../src/components/iniciar/step-time-comercial.tsx)

| Campo / Label | Fórmula | Dependências |
|--------------|--------|--------------|
| Custo/Mês por pessoa (`custoLinhaMes`) | `salario × (1 + comissaoPct / 100)` | `salario`, `comissaoPct` |
| Custo total mensal do time | `Σ custoLinhaMes` | todas as linhas |
| Capacidade efetiva por cargo | `Σ (wipLimit × capacidadePct / 100)` agrupado por `cargo` | `TimeComercialMembro[]` + `MetricaOperacional[]` (P17) |
| Capacidade máxima por cargo | `Σ wipLimit` (1 por pessoa do cargo) | `wipLimit` |
| % do potencial | `(capacidade ÷ capacidadeMax) × 100` | derivados acima |
| Cor da barra | `≥90 success`, `≥50 warning`, `<50 destructive` | `%` calculado |

### 6.3 Wizard step 4 — Tiers & Receita

[src/components/iniciar/step-tiers-receita.tsx](../src/components/iniciar/step-tiers-receita.tsx)

| Campo / Label | Fórmula | Dependências |
|--------------|--------|--------------|
| `tcvPond` (TCV ponderado por tier) | `(saberPct/100 × saberAt) + (terPct/100 × terAt) + (execPct/100 × execAt)` | `ReceitaProduto` |

### 6.4 Wizard step 5 — Leads & Investimento

[src/components/iniciar/step-leads-investimento.tsx](../src/components/iniciar/step-leads-investimento.tsx)

| Campo / Label | Fórmula | Dependências |
|--------------|--------|--------------|
| `tierAtivo(entra, atual)` | `horizonteIndex(entra) ≤ horizonteIndex(atual)` | `entraHorizonte`, `horizonteAtual` |
| Renormalização inicial da distribuição | `pctMercado / activeTotal × 100` (só para tiers ativos quando vem da Matriz) | `pctMercado`, tiers ativos |
| Total Mercado (visualização) | `Σ pctMercado` filtrado por `tierAtivo` | distribuição |
| P7 (CPL LB pond. e TCV médio pond. por horizonte) | `Σ(pctMercado × cplLb_tier) / Σ pctMercado` e `Σ(pctMercado × tcvProdCom_tier) / Σ pctMercado`, só tiers ativos no horizonte | `dist` (P4), `tiers` (P2) — `calcularP7` em [p7-derivado.ts](../src/lib/premissas/p7-derivado.ts) |

### 6.5 Wizard step 8 — Mix Subcanais

[src/components/iniciar/step-mix-subcanais.tsx](../src/components/iniciar/step-mix-subcanais.tsx)

| Campo / Label | Fórmula |
|--------------|--------|
| `mixTotal` (soma da linha) | `indicacao + eventos + recovery + recomendacao + prospeccao` (precisa = 100%, tolerância 0.5) |

### 6.6 Wizard step 9 — Realizado Histórico

[src/components/iniciar/step-realizado-historico.tsx](../src/components/iniciar/step-realizado-historico.tsx)

| Campo / Label | Fórmula |
|--------------|--------|
| Acumulado do período | `Σ faturamento` dos meses fechados |
| Preview projetado (mai–dez) | filtra `calcularRealizadoVsProjetado` por `mes > ULTIMO_MES_FECHADO` |

### 6.7 Tela `/premissas` — exemplo de CAC dinâmico

[src/components/premissas/tabs/premissas-modelo-tab.tsx](../src/components/premissas/tabs/premissas-modelo-tab.tsx)

| Campo / Label | Fórmula | Notas |
|--------------|--------|-------|
| `custoMes(membro)` | `salario × (1 + comissaoPct/100)` | mesma do step 2 |
| Custo total do time | `Σ custoMes` | — |
| CAC calculado (últ. mês fechado) | `(custoTimeTotal + investidoUltMes) / wonUltMes` | `investidoUltMes` e `wonUltMes` vêm de `realizadoHistorico[ULTIMO_MES_FECHADO]`. Em modo Matriz, soma de todas as unidades visíveis. Quando não há dado, a tela exibe "—" e instrui a preencher em /realizado. |

### 6.8 Listagem de unidades e Home

[src/app/unidades/page.tsx](../src/app/unidades/page.tsx) e [src/app/page.tsx](../src/app/page.tsx)

| Campo | Fórmula |
|------|--------|
| % de setup concluído | `(completedSteps.length ÷ SETUP_STEPS.length) × 100` arredondado |
| Render de barras de progresso | 1 barra por step; verde se `completedSteps.includes(step)` |

### 6.9 Formatação compartilhada

[src/components/premissas/format.ts](../src/components/premissas/format.ts)

| Função | Saída |
|-------|------|
| `formatBRL(n)` | `R$1.234` (arredonda) |
| `formatBRLk(n)` | `R$1,2M` / `R$1K` quando aplicável |
| `formatPercent(n, digits)` | `12,5%` |
| `formatInt(n)` | `1.234` |
| `farolColorClass(pct)` | classe Tailwind (regra acima) |

---

## 7. Enums e tipos compartilhados

| Enum / Tipo | Valores | Onde aparece |
|-------------|---------|--------------|
| `Horizonte` | `"H1" \| "H2" \| "H3" \| "H4" \| "H5"` | `organizations.horizonteAtual`, P1, P4 (`entraHorizonte`), P6, P16 |
| `Tier` | `"Tiny" \| "Small" \| "Medium" \| "Large" \| "Enterprise"` | P2, P3, P4, P8–P15 |
| `Cargo` (livre) | `LDR`, `BDR`, `SDR`, `CLOSER`, `KAM` (sugestões) | P17, Time Comercial |
| `OrgType` | `"matriz" \| "unidade"` | `organizations.type` |
| `OrgStatus` | `"active" \| "inactive" \| "pending"` | `organizations.status` |
| `UserStatus` | `"pending" \| "active" \| "inactive"` | `users.status` |
| `Role` | `"admin" \| "gerente" \| "coordenador"` | `memberships.role` |
| `MembershipStatus` | `"active" \| "inactive"` | `memberships.status` |
| `RegionalSigla` | `RS, MG1, MG2, MG3, RJ, SP1, SP2, SP3, NE, SC, PR, MATRIZ, NUNES, COLLI, SEM_PREENCHIMENTO` | `organizations.regional`, `memberships.regional` |
| `SetupStep` | 9 valores (ver §4.0) | `UnitSetup.completedSteps` |
| `ActingMode` | `"matriz" \| "unidade"` | derivado de `isMatrizUser + activeOrganization` em `AuthSession` |
| `CapacidadeOption` | `0 \| 25 \| 50 \| 75 \| 90 \| 100` | `TimeComercialMembro.capacidadePct` |
| `CargoComercial` (sugestões) | `LDR, BDR, SDR, CLOSER, KAM` | select de cargos do time |

---

## 8. Auth, ACL e schemas de API (infraestrutura)

Campos e tipos que sustentam autenticação, autorização e contratos de payload das rotas `/api/*`. Não são "campos de negócio" no mesmo sentido das premissas, mas qualquer alteração na app esbarra neles — então também precisam estar mapeados.

### 8.1 Sessão e contexto de autenticação

Definidos em [src/lib/auth/types.ts](../src/lib/auth/types.ts).

#### `MembershipWithOrg`

`Membership` enriquecido com a organização à qual está vinculado. É o shape que o front consome via `/api/auth/me`.

| Campo | Tipo | Notas |
|------|------|-------|
| `...Membership` | (ver §3.3) | herda todos os campos persistidos |
| `organization` | `Organization` | quando o vínculo é direto: a unidade. Quando é regional: aponta para a Matriz (origem da delegação) |
| `regionalUnits` | `Organization[] \| null` | só para vínculos regionais — lista as unidades cobertas pela delegação |

#### `AuthSession`

Estado completo da sessão ativa — entregue ao client via `AuthProvider`.

| Campo | Tipo | Notas |
|------|------|-------|
| `user` | `User` | dados básicos do usuário logado |
| `memberships` | `MembershipWithOrg[]` | todos os vínculos ativos |
| `activeOrganization` | `Organization \| null` | org selecionada no switcher; `null` = matriz vendo consolidado |
| `isMatrizUser` | `boolean` | `true` se possui pelo menos um membership com `organization.type === "matriz"` |
| `availableOrganizations` | `Organization[]` | orgs visíveis pra esse user (todas se matriz; só as próprias se unidade) |
| `actingMode` | `ActingMode` | derivado de `isMatrizUser + activeOrganization` — define se a tela renderiza no modo Matriz ou Unidade |

#### Cookie de autenticação

| Constante | Valor | Notas |
|----------|------|-------|
| `AUTH_COOKIE_NAME` | `"v4_user_id"` | nome do cookie usado em dev para identificar o "logado" |

### 8.2 Permissões (ACL)

Definidas em [src/lib/auth/permissions.ts](../src/lib/auth/permissions.ts). A função `hasPermission(action, role, scope)` decide acesso. No client há o hook `useCan()` em [auth-context.tsx](../src/lib/auth/auth-context.tsx).

#### Tipos

| Tipo | Valores | Notas |
|------|--------|-------|
| `OrgScope` | `"matriz" \| "unidade"` | mesmo `OrgType`, redefinido localmente — o que controla a ACL é o tipo da org do membership, não o `organizationId` |
| `PermissionAction` | union derivada de `keyof typeof PERMISSIONS` | strings dotted como `"organization.list"`, `"user.invite"` |

#### Matriz de permissões (`PERMISSIONS`)

| Ação | Matriz | Unidade |
|------|-------|---------|
| `organization.list` | admin, gerente, coordenador | admin, gerente, coordenador |
| `organization.create` | admin | — |
| `organization.update` | admin | admin |
| `organization.delete` | admin | — |
| `user.list` | admin, gerente | admin |
| `user.invite` | admin, gerente | admin |
| `user.update` | admin | admin |
| `user.deactivate` | admin | admin |
| `membership.create` | admin | admin |
| `membership.update` | admin | admin |
| `membership.revoke` | admin | admin |
| `audit.view` | admin, gerente | admin |

> **Regra adicional (alinhada com PM, ainda não em código):** Matriz tem visibilidade total dos dados das unidades mas **não edita** dados operacionais (Reality Check, KRs, métricas). Restrição entrará como permissões `data.*` em fase futura.

### 8.3 Schemas Zod de input das APIs

Cada API route valida o body/query com um schema. São esses tipos que o front consome (via `z.infer`) para tipar formulários e fetches.

#### Login — [auth.ts](../src/lib/validations/auth.ts)

| Tipo | Endpoint | Campos |
|------|---------|--------|
| `LoginInput` | `POST /api/auth/login` | `email` (corporativo, `@v4company.com`), `password` (opcional em dev) |

Constante `ALLOWED_EMAIL_DOMAIN = "v4company.com"` (hard-coded, decisão de produto).

#### Organizations — [organizations.ts](../src/lib/validations/organizations.ts)

| Tipo | Endpoint | Campos |
|------|---------|--------|
| `CreateOrganizationInput` | `POST /api/organizations` | `name`, `slug?` (auto-gera de name), `horizonteAtual` (default `H1`), `socioExecutivoNome?`, `socioExecutivoEmail?`, `regional?`, `estado?`, `cidade?`, `telefone?`, `dataInicio?` |
| `UpdateOrganizationInput` | `PATCH /api/organizations/:id` | qualquer subset dos campos acima + `status`. `.refine(keys>0)` |
| `ListOrganizationsQuery` | `GET /api/organizations?...` | `type?`, `status?`, `horizonte?`, `search?` |

Helpers exportados:
- `regionalLabel(sigla)` → string para UI (ex.: `"RS"` → `"Alex Peretto"`)
- `generateSlug(name)` → slug kebab-case normalizado
- `REGIONAIS` (com `sigla` + `label` do gerente regional)

#### Users e Memberships — [users.ts](../src/lib/validations/users.ts)

| Tipo | Endpoint | Campos |
|------|---------|--------|
| `InviteUserInput` | `POST /api/users/invite` | `email` + `name` + `role` + discriminado por `scope`: `"unidade"` (com `organizationId`) ou `"regional"` (com `regional`) |
| `UpdateUserInput` | `PATCH /api/users/:id` | `name?`, `status?` |
| `CreateMembershipInput` | `POST /api/memberships` | mesma discriminação por `scope` |
| `UpdateMembershipInput` | `PATCH /api/memberships/:id` | `role?`, `status?` |
| `ListUsersQuery` | `GET /api/users?...` | `organizationId?`, `status?`, `role?`, `search?` |
| `UpdateActiveOrgInput` | `PATCH /api/auth/active-organization` | `organizationId: uuid \| null` |

Labels de UI: `ROLE_LABEL` e `USER_STATUS_LABEL`.

#### Save Step do wizard — [unit-setup.ts (validations)](../src/lib/validations/unit-setup.ts)

| Tipo | Endpoint | Campos |
|------|---------|--------|
| `SaveStepBody` | `PATCH /api/units/:id/setup` | discriminated union por `step` — 9 variantes, uma por SetupStep (ver §4.0) |

Cada variante carrega `data` no shape do step correspondente — todos os schemas de premissa (P1–P17), time comercial e realizado histórico já validados nesta página.

### 8.4 Erros de auth/autorização

| Erro | Onde | HTTP |
|------|------|------|
| `UnauthorizedError` | [current-user.ts](../src/lib/auth/current-user.ts) `requireAuth()` | 401 |
| `ForbiddenError` | mesmo arquivo `requirePermission()` | 403 |
| `ZodError` | qualquer route com `.parse(body)` | 400 |

### 8.5 Tipos de saída usados na UI

Embora não persistam, esses tipos circulam pelos componentes e merecem catálogo.

| Tipo | Onde | Notas |
|------|------|-------|
| `LinhaRealizadoProjetado` | [projecao.ts](../src/lib/realizado/projecao.ts) | shape de cada linha da tabela `/realizado`: `{ mes, realizado, projetado, isProjetado, horizonteAplicado }` — consumido tanto pelo client de unidade quanto pelo agregador de Matriz |

---

## 9. Estado de UI (não persistido)

Esses campos vivem só em `useState` ou em filtros — não viram input persistido. Listados aqui para ninguém confundir com dados reais.

| Campo | Tela | Tipo | Notas |
|------|------|------|-------|
| `tab` ativo em `/premissas` | premissas-client | `"premissas" \| "conversoes"` | aba selecionada |
| `alertOpen` | premissas-client | boolean | dismiss do banner LTV/CAC |
| `isEditing`, `saving`, `error` | todos os steps + realizado-client | — | controle de edição/salvamento |
| `collapsed`, `hovering` da sidebar | app-shell | boolean | UX do sidebar |
| `loggingOut` | app-shell | boolean | spinner do botão logout |
| `releasing` | NumberCell (`lockableZero`) | boolean | controla o botão "Liberar" antes de digitar valor |
| Filtros `"Todas as Franquias"`, `"Abril 2026"` em `/premissas` | premissas-client | — | botões placeholder — ainda sem estado real |

---

## 10. Gaps de validação e dívida técnica

### Campos sem schema Zod
- `sessions.ip`, `sessions.userAgent` — metadata passiva
- `audit_log.ip`, `audit_log.userAgent`, `audit_log.changes` — `changes` é JSONB sem shape definido
- `users.passwordHash`, `activationToken`, `resetToken` — gerados pelo auth backend, nunca vêm de input cliente

### Campos com valor placeholder / convenção
- **Ano modelado fixo (2026)**: `ANO_MODELADO` e `MESES_ANO_2026` em [projecao.ts](../src/lib/realizado/projecao.ts) ainda são hard-coded. Quando o sistema modelar outros anos, vai precisar virar lista/seletor.

### Resolvidos nesta passada (registro)
- ✅ **P7** agora é derivado de P2 + P4 em tempo real ([p7-derivado.ts](../src/lib/premissas/p7-derivado.ts)) — `calcularP7(dist, tiers)`.
- ✅ **CAC em `/premissas`** lê o último mês fechado de `realizadoHistorico` (unidade ativa ou soma das unidades em modo Matriz). Quando não há dado, mostra "—" + instrução.
- ✅ **`MES_REFERENCIA_ATUAL` / `ULTIMO_MES_FECHADO`** agora derivam de `new Date()` com clamp em 2026 — `getMesReferenciaAtual()` e `getUltimoMesFechado()`.
- ✅ **Soma=100% em P16 e P4** validada via `superRefine` em [validations/unit-setup.ts](../src/lib/validations/unit-setup.ts).
- ✅ **Âncora flexível** — `getMesAncora(dataInicio)` escolhe o mês de início da unidade quando posterior a jan/2026.
- ✅ **`TimeComercialMembro.email` obrigatório** no save final via `superRefine` (drafts ainda aceitam vazio).
- ✅ **`RealizadoMensal.mes`** agora é enum sobre `MESES_ANO_2026` — impossível enviar mês fora da janela.
- ✅ **Fallback H4 em `step-horizontes`** removido — agora exige `horizonteAtual` explícito (vem sempre da org).

---

## 11. Mapa de rotas → campos

| Rota | Componente raiz | Campos lidos | Campos escritos |
|------|----------------|-------------|----------------|
| `/` | [app/page.tsx](../src/app/page.tsx) | `availableOrganizations`, `UnitSetup.completedSteps` | — |
| `/unidades` | [app/unidades/page.tsx](../src/app/unidades/page.tsx) | `organizations`, `UnitSetup` | — |
| `/usuarios` | [app/usuarios/page.tsx](../src/app/usuarios/page.tsx) | `users`, `memberships`, `organizations` | convite (cria `users` + `memberships`) |
| `/premissas` | [premissas-client.tsx](../src/components/premissas/premissas-client.tsx) | premissas P1–P17 (defaults Matriz) | premissas P1–P17 quando `actingMode="matriz"` |
| `/realizado` | [realizado-client.tsx](../src/components/realizado/realizado-client.tsx) | `realizadoHistorico`, `horizontes` (P1) | `realizadoHistorico` (unidade) |
| `/iniciar` (layout) | [iniciar/layout.tsx](../src/app/iniciar/layout.tsx) | `UnitSetup.completedSteps` | — |
| `/iniciar/horizontes` | step-horizontes | P1 (read-only) | marca step concluído |
| `/iniciar/time-comercial` | step-time-comercial | `timeComercial`, P17 (consultivo) | `timeComercial` |
| `/iniciar/metricas-operacionais` | step-metricas-operacionais | P17 | P17 |
| `/iniciar/tiers-receita` | step-tiers-receita | P2 (RO), P3 | P3 |
| `/iniciar/leads-investimento` | step-leads-investimento | P4, P6 | P4, P6 |
| `/iniciar/conversoes-inbound` | step-conversoes-inbound | P8, P9, P10 | P8, P9, P10 |
| `/iniciar/conversoes-outbound` | step-conversoes-outbound | P11–P15 | P11–P15 |
| `/iniciar/mix-subcanais` | step-mix-subcanais | P16 | P16 |
| `/iniciar/realizado-historico` | step-realizado-historico | `realizadoHistorico`, P1 | `realizadoHistorico` |
| `/api/units/[id]/setup` (GET/PATCH) | [route.ts](../src/app/api/units/[id]/setup/route.ts) | `UnitSetup` completo | qualquer `SaveStepInput` |

---

## Referências de código

- Defaults da Matriz: [src/lib/premissas/matriz-defaults.ts](../src/lib/premissas/matriz-defaults.ts)
- Validações Zod: [src/lib/validations/unit-setup.ts](../src/lib/validations/unit-setup.ts)
- Repository do setup (mock + tipos `UnitSetup`, `SaveStepInput`): [src/db/repositories/unit-setup.ts](../src/db/repositories/unit-setup.ts)
- Schema do banco: [src/db/schema.ts](../src/db/schema.ts)
- Projeção realizado vs projetado: [src/lib/realizado/projecao.ts](../src/lib/realizado/projecao.ts)
- Formatação compartilhada: [src/components/premissas/format.ts](../src/components/premissas/format.ts)
- Tipos de sessão/auth: [src/lib/auth/types.ts](../src/lib/auth/types.ts)
