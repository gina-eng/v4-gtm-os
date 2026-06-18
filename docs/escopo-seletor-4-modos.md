# Seletor Global — 4 Escopos (plano de implementação)

> Decisão (Gina): o seletor global de organização passa a ter 4 escopos. Feito com
> calma, em fases, 100% funcional. Modelo validado por mapeamento + 2 revisões
> adversariais (workflow `escopo-global-4-modos`).

## Modelo: 2 eixos ortogonais

- **`actingMode: 'matriz' | 'unidade'`** — INALTERADO. É o eixo de permissão/nav.
  Os 3 escopos "matriz-like" (geral / todas_unidades / matriz_propria) **todos**
  resolvem `actingMode='matriz'` → ~40 telas/rotas **não mudam**.
- **`activeScope: 'geral' | 'todas_unidades' | 'matriz_propria' | 'unidade'`** — NOVO.
  Lido **só** por bowtie/realizado (e header/home cosmético). Refina o "matriz".

| Escopo | Conjunto de orgs | activeOrg | actingMode |
|---|---|---|---|
| `geral` | matriz + todas unidades (+ balde) | null | matriz |
| `todas_unidades` | só unidades (= hoje) | null | matriz |
| `matriz_propria` | só a holding | org matriz | matriz |
| `unidade` | uma unidade | a unidade | unidade |

## Storage
Coluna nova `users.matriz_scope` (enum `'geral'|'todas_unidades'`, **nullable**).
Só relevante quando `activeOrganizationId IS NULL`. NULL = retrocompat = `todas_unidades`.
`matriz_propria`/`unidade` continuam representados por `activeOrganizationId`.
Aplicar via **db:push/DDL direto** (NUNCA db:migrate).

## ⚠️ Gotchas críticos (achados pela revisão — NÃO esquecer)

1. **QUEBRA A CONTA DA GINA no deploy.** O seed cria o admin com
   `activeOrganizationId = matriz.id`. No modelo novo isso vira `matriz_propria`
   (holding, quase vazia) → bowtie/realizado abririam **vazios** no 1º login.
   **Fix obrigatório:** DATA-FIX `UPDATE users SET active_organization_id=NULL,
   matriz_scope='todas_unidades' WHERE active_organization_id = <org matriz>` +
   corrigir `seed.ts`. Usar `'todas_unidades'` (idêntico a hoje), não `'geral'`.

2. **Única brecha de segurança = o PATCH.** `/api/auth/active-organization` deve
   exigir `isMatrizUser` para geral/todas_unidades/matriz_propria (espelha a regra
   do `null` de hoje). Extrair `assertScopeAllowed(session, scope)` + teste de 403
   pra user de unidade. Sem isso, unidade forja `{scope:'geral'}` e vê a rede toda.

3. **OrgSwitcher é REESCRITA, não "+2 itens".** Label/ativo/ícone hoje dependem de
   `activeOrganization.id`; os itens sintéticos (geral/todas_unidades) não têm id →
   quebram o marcador de ativo, o filtro de busca e o ícone. Label tem que derivar
   do `activeScope`. Esconder sintéticos para não-matriz.

4. **bowtie ↔ realizado têm que concordar.** Extrair `resolveScopeOrgs(session)` →
   `{orgIds, incluiBalde}` consumido pelos dois, senão `geral` mostra números
   diferentes em cada tela.

5. **Header (app-shell)** mostra "V4 Company" pra geral E todas_unidades (ambos
   activeOrg=null) — rótulo tem que vir do `activeScope`.

## Decisão de produto (pré-requisito da Fase 2)
- A holding tem realizado próprio? **Sim hoje** (70 won, via id_tenant `eaf9a890`
  cadastrado na org matriz). Então `geral` ≠ `todas_unidades` (difere pelos 70 +
  balde da matriz). `matriz_propria` mostra esses 70.
- As linhas `org=null` do balde (tenant não cadastrado) entram em qual escopo?
  Proposta: só em `geral` (é a visão "tudo da rede").

## Faseamento (cada fase é mergeável e não quebra nada)
- **Fase 0 — Fundação (zero mudança de comportamento):** coluna `matriz_scope`,
  `AuthSession.activeScope` derivado, DATA-FIX do admin, `seed.ts`. Tudo continua
  se comportando como hoje (`todas_unidades`).
- **Fase 1 — Seletor:** reescrever OrgSwitcher (2 itens + label por escopo +
  esconder p/ não-matriz), PATCH com `assertScopeAllowed` + validação, header label.
- **Fase 2 — Dados:** bowtie/realizado por `activeScope` via `resolveScopeOrgs`,
  getter do balde, empty-state de `matriz_propria`. (Depende da decisão de produto.)
