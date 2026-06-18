# Realizado — Contrato de Leitura Direta (time de dados é dono da verdade)

> **Decisão (2026-06-17):** o GTM OS **não trata nada internamente**. As duas
> tabelas abaixo são a **fonte única da verdade**, entregues pelo time de dados já
> no formato final. O sistema lê **direto** — sem derive, sem cron, sem tabela
> derivada, sem view de transformação.
>
> Para isso, o time de dados precisa entregar os dados **já mapeados** para o
> domínio do sistema (chaves de subcanal, tiers, e cada métrica já no mês do seu
> evento). Tudo que hoje o sistema fazia (de-para de canal/tier, bucket por data,
> resolução de unidade) passa a ser **responsabilidade da origem**.

---

## Princípio

| Antes (paliativo) | Agora (este contrato) |
|---|---|
| Extrato cru → o sistema derivava (`realizado_funil`) | Time de dados entrega pronto → sistema lê direto |
| De-para de canal/tier no código | De-para na origem (já vem `black_box`, `Medium`) |
| Métrica bucketizada por data no derive | Cada métrica já vem no **mês do seu evento** |
| Tabela derivada + cron | Só as 2 tabelas, lidas ao vivo |

Se um dado **não mapeia** (canal desconhecido, tier fora dos 5, unidade sem
cadastro), a decisão é **da origem**: ou mapeia, ou entrega num bucket explícito
(ver §4). O sistema **não inventa** nem descarta.

---

## Tabela 1 — `realizado_import_lead` (funil)

**Grão:** uma linha por `unidade × mês × subcanal × tier × categoria`.

> ⚠️ Mudança-chave vs. extrato atual: **não vem mais 1 linha por lead com 4 datas.**
> Cada métrica já entra **no mês em que o evento aconteceu** (lead no mês do
> cadastro, SQL no mês da reunião marcada, venda no mês do fechamento). O time de
> dados faz esse "desempilhamento" por data na origem.

| Coluna | Tipo | Regra |
|---|---|---|
| `id_tenant` | text | Chave da unidade. **Deve casar 1:1** com `unidades.id_tenant`. Sem espaços/quebras. |
| `mes` | `YYYY-MM` | Competência. Cada métrica no mês do seu evento. Só 2026. |
| `subcanal` | enum (§Domínios) | **Já mapeado** para uma das 8 chaves. |
| `tier` | enum (§Domínios) | **Já normalizado** para um dos 5 tiers. |
| `categoria` | enum/`''` | `''` nas linhas de topo (leads→sal); `Saber/Ter/Executar` nas linhas de venda. |
| `leads` | int | Leads cadastrados no mês. |
| `mql` | int | MQL no mês. **Só `lead_broker` e `black_box`** têm MQL; os demais = **0**. |
| `sql` | int | Reuniões marcadas (RM) no mês. |
| `sal` | int | Reuniões realizadas (RR) no mês. |
| `won` | int | Vendas fechadas no mês. |
| `faturamento` | numeric | Receita das vendas do mês (R$). |

**Como preencher categoria (importante):** as métricas de topo (`leads`, `mql`,
`sql`, `sal`) vão em linha(s) com `categoria = ''`. As de venda (`won`,
`faturamento`) vão em linha(s) com a `categoria` do produto. Ou seja, um mesmo
`(mes, subcanal, tier)` pode ter 1 linha de topo (`categoria=''`) + N linhas de
venda (uma por categoria).

---

## Tabela 2 — `realizado_import_investimento` (investido)

**Grão:** uma linha por `unidade × mês × subcanal`.

| Coluna | Tipo | Regra |
|---|---|---|
| `id_tenant` | text | Casa 1:1 com `unidades.id_tenant`. |
| `mes` | `YYYY-MM` | Competência do investido. Só 2026. |
| `subcanal` | enum (§Domínios) | Já mapeado para uma das 8 chaves. |
| `invest` | numeric | Investido de mídia no mês, naquele subcanal, **daquela unidade** (R$). |

> ⚠️ **Ponto a decidir com o time de dados:** o bowtie mostra custo por **tier**
> (CPMQL/CAC por tier). Se o investido só vier por subcanal (sem tier), o sistema
> mostra custo **por subcanal** (sem quebra por tier) — sem rateio interno. Se
> quiserem custo por tier, a origem precisa entregar `tier` também nesta tabela.
> **Não haverá rateio interno** (era tratamento que estamos removendo).

---

## Domínios (enums fechados)

**Subcanal** (8 — exatamente estas chaves):
`lead_broker`, `black_box`, `meeting_broker`, `eventos`, `out_indicacao`,
`out_recovery`, `out_recomendacao`, `out_prospeccao`.

**Tier** (5): `Tiny`, `Small`, `Medium`, `Large`, `Enterprise`.

**Categoria** (3 + vazio): `Saber`, `Ter`, `Executar`, ou `''`.

> De-para de referência (o que a origem deve aplicar), conforme o paliativo atual:
> `Blackbox / LP Matriz / LP Franquia / Inside Box → black_box` · `Leadbroker →
> lead_broker` · `Meetingbroker → meeting_broker` · `Recovery / Reativação →
> out_recovery` · `Indicação / Networking → out_indicacao` · `Prospecção Fria →
> out_prospeccao` · `Recomendação → out_recomendacao` · `Eventos → eventos`.

---

## Regras de coerência (a origem garante)

1. `id_tenant` **único por unidade** em `unidades` (hoje houve duplicata que
   inflava o realizado). Cada `id_tenant` do extrato casa com **uma** unidade.
2. Sem trailing space/`\n` no `id_tenant`.
3. Só competência **2026** (eventos fora de 2026 não entram).
4. `mql = 0` fora de `lead_broker`/`black_box` (espelha o projetado).
5. Idealmente, monotonicidade do funil por célula (`leads ≥ sql ≥ sal ≥ won`) —
   desejável, não bloqueante.

---

## O que muda no sistema quando isto chegar

- Removemos: `scripts/derive-realizado-funil.ts`, o cron (`vercel.json`), a rota
  `/api/realizado/derive`, e as tabelas/views derivadas (`realizado_funil`,
  `realizado_nao_classificado`, `realizado_total`).
- O `/bowtie` passa a ler **direto** destas duas tabelas (mesmo grão que ele já
  consome: `mês × subcanal × tier`).
- Fonte da verdade = só estas duas tabelas. Zero tratamento interno.

## Transição (enquanto a origem não migra)

O extrato atual ainda vem no formato antigo (cohort + datas + rótulos crus). Até a
origem entregar neste novo formato, o **derive segue ligado como ponte temporária**
(senão o bowtie fica sem dado). Assim que a entrega mudar pra este contrato,
desligamos o derive e ligamos a leitura direta — sem o bowtie parar.
