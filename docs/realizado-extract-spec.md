# Especificação de Extração do REALIZADO — V4 GTM OS

> Contrato de dados para o time de tecnologia/dados extrair o **realizado** do
> datalake (exposto via Metabase) e carregá-lo no **Supabase** do GTM OS por uma
> rotina de **Airflow** (sem intervenção manual). Alimenta o **Forecast**
> (`/realizado`) e o **Bowtie** (`/bowtie`).
>
> **Última atualização:** 2026-06-02
> **Público:** time de dados/engenharia (origem) + produto GTM OS (destino)
> **Estado:** proposta de contrato — pendentes: chave de unidade (§4) e 2
> mapeamentos de métrica do BI (§5.1).

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Granularidade: diário (decisão)](#2-granularidade-diário-decisão)
3. [Dataset 1 — Realizado do Funil / Bowtie](#3-dataset-1--realizado-do-funil--bowtie)
4. [Dataset 2 — Realizado Diário (investido + leads/won mensal)](#4-dataset-2--realizado-diário-investido--leadswon)
5. [Chave de unidade (de-para) — bloqueante](#5-chave-de-unidade-de-para--bloqueante)
6. [De-para de métricas do BI](#6-de-para-de-métricas-do-bi)
7. [Domínios e enums](#7-domínios-e-enums)
8. [Regras de coerência](#8-regras-de-coerência)
9. [Mapeamento por fonte ("bancos")](#9-mapeamento-por-fonte-bancos)
10. [Formato de entrega](#10-formato-de-entrega)
11. [Decisões registradas](#11-decisões-registradas)

---

## 1. Visão geral

O GTM OS consome **dois datasets de realizado**, ambos no **grão diário**:

| # | Dataset | Grão | Tabela destino | Alimenta |
|---|---------|------|----------------|----------|
| 1 | **Realizado do Funil** | unidade × **dia** × subcanal × tier | `realizado_funil` | Bowtie (`/bowtie`) |
| 2 | **Realizado Diário** | unidade × **dia** | `realizado_diario` | Forecast (`/realizado`) — via `investido` |

O **Dataset 1 é o detalhado**: somando suas linhas por dia/mês obtém-se faturamento
e won. O **Dataset 2 existe pelo `investido` (mídia)**, que não desce ao grão de
subcanal/tier no realizado e **não está no BI** (vem das plataformas de mídia).

Janela temporal: o sistema modela **2026** (`2026-01-01` → `2026-12-31`).

---

## 2. Granularidade: diário (decisão)

- **Armazenamento do realizado = diário.** A competência é o campo `dia`
  (`YYYY-MM-DD`), não o mês.
- **Faturamento é reconhecido por data de fechamento do deal** → desce ao dia
  naturalmente. Por isso um **grão diário único cobre todas as métricas** do
  funil; não há mistura de grãos.
- **O projetado continua mensal** (forecast, promoção de horizonte, funil-reverso).
  A comparação realizado × projetado **agrega o diário em mês**. No banco, a
  coluna `mes` (`YYYY-MM`) é **derivada** de `dia` automaticamente — a origem
  **não precisa enviar `mes`**.
- **Carga diária e incremental**: o DAG roda todo dia e dá append/upsert do dia
  anterior (e reprocessa o dia corrente, se necessário).

---

## 3. Dataset 1 — Realizado do Funil / Bowtie

Grão: **1 linha por unidade × dia × subcanal × tier.** Tabela `realizado_funil`.

| Campo | Tipo | Obrigatório | Fonte | Notas |
|-------|------|-------------|-------|-------|
| `unidade_ref` | string | sim | cadastro interno | chave de-para (ver §5) |
| `dia` | string `YYYY-MM-DD` | sim | — | dentro de 2026 |
| `subcanal` | enum (8) | sim | CRM | ver §7; **`canal` é derivado, não enviar** |
| `tier` | enum (5) | sim | CRM | porte do cliente; ver §7 |
| `leads` | number ≥ 0 | sim | CRM | topo do funil (ver §6) |
| `mql` | number ≥ 0 | sim | CRM | 0/null quando o subcanal não tem MQL (ver §3.1) |
| `sql` | number ≥ 0 | sim | CRM | — |
| `sal` | number ≥ 0 | sim | CRM | — |
| `won` | number ≥ 0 | sim | CRM | deals fechados nesse dia |
| `faturamento` | number ≥ 0 | sim | Financeiro + CRM | R$ ganho nessas células (por data de fechamento) |

**Chave natural / idempotência:** `(unidade_ref, dia, subcanal, tier)`.

### 3.1 As etapas do funil mudam por subcanal

Não force um esquema único — o modelo varia (campos ausentes vêm `0`/null):

| Subcanal(is) | Etapas | Campos que vêm 0/null |
|--------------|--------|------------------------|
| `lead_broker`, `black_box` | Leads → MQL → SQL → SAL → Won | — (funil completo) |
| `meeting_broker`, `eventos` | (começam no) SQL → SAL → Won | `leads`, `mql` |
| `out_*` (outbound) | Leads → SQL → SAL → Won | `mql` (sem etapa MQL) |

### 3.2 Célula vazia = ausência de linha

Combinação `dia × subcanal × tier` sem movimento **não precisa de linha** — o
sistema trata ausência como zero. Não preencha a matriz inteira.

---

## 4. Dataset 2 — Realizado Diário (investido + leads/won)

Grão: **1 linha por unidade × dia.** Tabela `realizado_diario`.

| Campo | Tipo | Obrigatório | Fonte | Notas |
|-------|------|-------------|-------|-------|
| `unidade_ref` | string | sim | cadastro interno | chave de-para (ver §5) |
| `dia` | string `YYYY-MM-DD` | sim | — | dentro de 2026 |
| `investido` | number ≥ 0 | sim | **Plataformas de mídia** | gasto de mídia do dia (LB + BB). **NÃO vem do BI.** |
| `leads_ib` | number ≥ 0 | sim | CRM | leads inbound do dia |
| `leads_ob` | number ≥ 0 | sim | CRM | leads outbound do dia |
| `faturamento` | number ≥ 0 | conferência | Financeiro | deve bater com Σ do Dataset 1 (§8) |
| `won` | number ≥ 0 | conferência | CRM | deve bater com Σ do Dataset 1 (§8) |

**Chave natural / idempotência:** `(unidade_ref, dia)`.

> Se a origem **conseguir** quebrar `investido` por subcanal/tier no futuro, é
> bem-vindo (o campo já está previsto no Dataset 1), mas **não é bloqueante** hoje.

---

## 5. Chave de unidade (de-para) — bloqueante

**Este é o principal ponto que trava a integração.** O datalake não possui o
`organizationId` (uuid) do GTM OS. Cada linha precisa de uma **chave de unidade
estável** (`unidade_ref`) e de uma **tabela de-para** ligando-a a `organizations`.

Requisitos da chave `unidade_ref`:

- **Estável** no tempo (não muda se a unidade for renomeada).
- **Única** por unidade.
- Candidatos: **CNPJ**, **id interno da unidade**, ou **slug**.

Entregável adicional: **tabela de-para** `unidade_ref → organizations.slug`
(ou `organizations.id`).

```csv
unidade_ref,gtm_os_slug,gtm_os_organization_id
43.123.456/0001-90,sp-pinheiros,
11.222.333/0001-44,rj-centro,
```

> **Pergunta aberta:** qual campo do sistema interno identifica a unidade de forma
> estável, e existe um de-para dele com o cadastro de organizações do GTM OS?

---

## 6. De-para de métricas do BI

Métricas disponíveis no BI: **MQL, SQL, SAL, faturamento, quantitativo**
(granularidade canal → subcanal → TIR). Mapeamento para os campos das tabelas:

| Campo destino | Métrica no BI | Status |
|---|---|---|
| `mql` | MQL | ✅ direto |
| `sql` | SQL | ✅ direto |
| `sal` | SAL | ✅ direto |
| `faturamento` | faturamento | ✅ direto (por data de fechamento) |
| `won` | "quantitativo"? | ⚠️ **confirmar**: "quantitativo" = qtd de deals ganhos (won)? Se for outra coisa, precisamos do `won` explícito. |
| `leads` | — | ⚠️ **falta no BI**: topo de funil (pré-MQL). Se o BI não expõe, enviar `0`/null e avisar. |
| `investido` | — | ⚠️ **não está no BI**: vem das plataformas de mídia (§4). |

> **2 perguntas abertas pro time de dados:** (a) "quantitativo" = `won`?
> (b) o BI expõe `leads` de topo (pré-MQL)?

---

## 7. Domínios e enums

**`subcanal`** (8 valores — string literal exata):

| Canal (derivado) | Valores |
|------------------|---------|
| inbound | `lead_broker`, `black_box`, `meeting_broker`, `eventos` |
| outbound | `out_indicacao`, `out_recovery`, `out_recomendacao`, `out_prospeccao` |

**`tier`** (5 valores — string literal exata): `Tiny`, `Small`, `Medium`,
`Large`, `Enterprise`

**`dia`**: `YYYY-MM-DD`, dentro de `2026-01-01` … `2026-12-31`.

> A origem precisa entregar o **de-para dos nomes de subcanal/tier do BI → essas
> 8/5 chaves exatas**. String fora do domínio é rejeitada na carga.

> **`canal` é derivado do `subcanal`** e **não deve ser enviado** como fonte. Se a
> origem mandar `canal` junto, será tratado só como conferência — nunca como verdade.

---

## 8. Regras de coerência

Validar na origem antes de enviar:

1. `Σ won` do Dataset 1 (todos subcanais/tiers de um dia×unidade) **=** `won` do
   Dataset 2 do mesmo dia×unidade.
2. `Σ faturamento` do Dataset 1 (idem) **=** `faturamento` do Dataset 2.
3. `Σ leads` inbound do Dataset 1 ≈ `leads_ib`; `Σ leads` outbound ≈ `leads_ob`.
4. Todo `subcanal`/`tier`/`dia`/`unidade_ref` deve estar nos domínios de §5 e §7.
5. Funil monotônico por linha (quando aplicável): `leads ≥ mql ≥ sql ≥ sal ≥ won`
   — respeitando as etapas ausentes de §3.1.

---

## 9. Mapeamento por fonte ("bancos")

| Fonte | Entrega |
|-------|---------|
| **CRM** | volumes do funil (`leads/mql/sql/sal/won`) por subcanal × tier × **dia** × unidade |
| **Plataformas de mídia** | `investido` (R$) por **dia** × unidade (idealmente por subcanal/tier) |
| **Financeiro / billing** | `faturamento` (R$) por **dia** × unidade (por data de fechamento do deal) |
| **Cadastro interno** | de-para `unidade_ref → organizations` (§5) |

---

## 10. Formato de entrega

- **Formato:** **NDJSON** (um JSON por linha). CSV ou Parquet também servem.
  **Evitar** JSON em array único (dificulta append incremental).
- **Granularidade da carga:** **incremental diária** — upsert na chave natural.
  Reprocessar um dia deve ser upsert, não duplicar.
- **Não quebrar arquivos por TIR/canal/funil** — essas são colunas/dimensões da
  mesma tabela. A quebra é **por dataset (grão)**:

| Arquivo | Grão | Vira tabela | Chave natural |
|---|---|---|---|
| `realizado_funil_YYYY-MM-DD.ndjson` | unidade × dia × subcanal × tier | `realizado_funil` | `(unidade_ref, dia, subcanal, tier)` |
| `realizado_diario_YYYY-MM-DD.ndjson` | unidade × dia | `realizado_diario` | `(unidade_ref, dia)` |
| `de_para_unidades.csv` | unidade | (concilia com `organizations`) | `unidade_ref` |

> Campos numéricos vão como **número** no JSON (sem aspas). Só texto livre é string.

### 10.1 Exemplo — Dataset 1 (NDJSON)

```json
{"unidade_ref":"43.123.456/0001-90","dia":"2026-04-15","subcanal":"lead_broker","tier":"Small","leads":12,"mql":5,"sql":2,"sal":1,"won":1,"faturamento":9000}
{"unidade_ref":"43.123.456/0001-90","dia":"2026-04-15","subcanal":"out_prospeccao","tier":"Medium","leads":8,"mql":0,"sql":2,"sal":1,"won":0,"faturamento":0}
{"unidade_ref":"43.123.456/0001-90","dia":"2026-04-15","subcanal":"meeting_broker","tier":"Enterprise","leads":0,"mql":0,"sql":1,"sal":1,"won":0,"faturamento":0}
```

### 10.2 Exemplo — Dataset 2 (NDJSON)

```json
{"unidade_ref":"43.123.456/0001-90","dia":"2026-04-15","investido":1250,"leads_ib":18,"leads_ob":7,"faturamento":9000,"won":1}
```

---

## 11. Decisões registradas

- **Grão = diário** (`dia`, `YYYY-MM-DD`). O `mes` é derivado no banco — a origem
  não envia. Uso imediato: acompanhar em tempo real o pace vs projetado.
- **Faturamento por data de fechamento do deal** → desce ao dia; grão diário único
  cobre todas as métricas, sem mistura.
- **Projetado continua mensal**; comparação agrega diário → mês.
- **`canal` é derivado de `subcanal`** — origem manda só `subcanal`.
- **Célula zerada = ausência de linha** no Dataset 1.
- **`investido` não vem do BI** — vem das plataformas de mídia.
- **Bloqueante:** definição da `unidade_ref` + tabela de-para (§5).
- **Abertos (BI):** "quantitativo" = `won`? O BI expõe `leads` de topo? (§6)

---

## Referências de código

- Realizado do Funil (Bowtie): [src/db/repositories/realizado-funil.ts](../src/db/repositories/realizado-funil.ts)
- Agregação do Bowtie: [src/lib/realizado/bowtie.ts](../src/lib/realizado/bowtie.ts)
- Forecast (projetado mensal): [src/lib/realizado/projecao.ts](../src/lib/realizado/projecao.ts)
- Domínio de subcanais/tiers: [src/lib/premissas/funil-reverso.ts](../src/lib/premissas/funil-reverso.ts)
- Catálogo geral de campos: [docs/campos.md](./campos.md)
