# Relatório de Pente-Fino — V4 GTM OS

> Auditoria ponta-a-ponta da estrutura do sistema + varredura de persistência de **todos** os campos
> (UI → payload → validação Zod → repository → coluna do banco).
> Data: 2026-06-17 · Método: typecheck/lint estático + 12 agentes de varredura + verificação adversarial de cada achado acionável + crítico de completude.

## ✅ Correções aplicadas (2026-06-17)

| # | Achado | Correção | Arquivos |
|---|---|---|---|
| A1 | Eventos (Custo/SQL + CR3/CR4) não persiste (400) | Adicionados os blocos `eventosCusto` e `conversaoEventos` ao `discriminatedUnion` da rota | [validations/premissas.ts](src/lib/validations/premissas.ts) |
| A2 | Wizard step Inbound trava em 400 | Schema do step agora cobre só os 3 sub-blocos que a tela edita; eventos é herdado da Matriz via merge em `applyStepToBlocks` (sem perder dado) | [unit-setup-types.ts](src/lib/unit-setup-types.ts), [validations/unit-setup.ts](src/lib/validations/unit-setup.ts), [premissas.ts](src/db/repositories/premissas.ts) |
| A3 | `invest` sempre 0 (landing sem loader) | Criado loader `load:investimento` da landing `realizado_import_investimento` (substituição total, idempotente) | [scripts/load-realizado-investimento.ts](scripts/load-realizado-investimento.ts), [package.json](package.json) |
| A4 | Override de subcanal gravado reduzido por cima do digitado | Editor passa a persistir o valor **cru** do usuário; o hard-cap é aplicado só no cálculo, pelo motor (`alocacaoInboundEfetiva`). Removido o clamp-que-persistia | [editor-subcanal-mensal.tsx](src/components/realizado/editor-subcanal-mensal.tsx) |
| A5 | Descartes silenciosos no import | Derive agora reporta **magnitude** (leads/won/receita) e **rótulos crus** (canal/tier) de cada descarte, para estender o de-para e recuperar | [scripts/derive-realizado-funil.ts](scripts/derive-realizado-funil.ts) |

> Verificação: `tsc --noEmit` limpo (0 erros) após as correções. Restante do relatório abaixo é o estado original da auditoria.

---


## Sumário executivo

| Métrica | Valor |
|---|---|
| Módulos auditados | 12 |
| Campos rastreados ponta a ponta | 207 |
| Campos em risco (status ≠ ok) | 29 |
| Achados totais | 77 |
| Confirmados na verificação | 35 |
| Refutados na verificação | 2 |
| `tsc --noEmit` (typecheck) | ✅ 0 erros |
| Drift schema ↔ migrations | ✅ ZERO |

**Veredito:** o núcleo de dados é sólido (zero drift schema↔banco, tipos consistentes), mas há **3 caminhos de perda de dado confirmados**, **1 falha de autenticação crítica** (sessão forjável) e **ausência de checagem de permissão de escrita** nas rotas operacionais. Nada disso é "estrutura quebrada" no sentido de não compilar — é dado que o usuário digita e não chega ao banco, ou chega sem proteção.

---

## 🔴 BLOCO A — Perda de dado confirmada (sua prioridade #1)

### A1. Eventos (Custo/SQL e CR3/CR4) NUNCA persiste — raiz única
Três achados, **mesma causa-raiz**: o `discriminatedUnion` da rota `PATCH /api/premissas` ([validations/premissas.ts:26-60](src/lib/validations/premissas.ts#L26-L60)) tem 12 blocos e **não inclui `eventosCusto` nem `conversaoEventos`**. O repository até suporta o patch (`applyBlockPatch` casos `eventosCusto`/`conversaoEventos`, [premissas.ts:737-746](src/db/repositories/premissas.ts#L737-L746)), mas é **inalcançável** — o Zod rejeita com 400 antes.

- **MODELO-001** (crítico): editar "Custo/SQL Eventos" na aba **Modelo** → 400 → `premissa_eventos_custo.custo_sql` nunca grava. UI fecha a edição como se tivesse salvo. [modelo-tab.tsx:172-177](src/components/premissas/tabs/premissas-modelo-tab.tsx#L172)
- **F1-conversoes** (crítico): editar **CR3/CR4 de Eventos por tier** na aba Conversões → 400 → `premissa_conversao_eventos.cr3/cr4` nunca grava. Perda total e silenciosa (erro só no console). [conversoes-tab.tsx:50-54](src/components/premissas/tabs/conversoes-tab.tsx#L50)
- **F3-api-auth** (alto): mesma rota não aceita esses dois blocos — confirma o gap pelo lado da API.

> **Correção:** adicionar os literais `eventosCusto` e `conversaoEventos` ao `discriminatedUnion` (o resto do caminho já existe). 1 arquivo.

### A2. Wizard `/iniciar` — step Conversões Inbound trava em 400 e não salva nada
**INI-001** (crítico). O componente envia `{ leadBroker, blackBox, meetingBroker }`, mas `conversoesInboundSchema` exige também `eventosCusto` e `eventos` (`.min(1)`) — campos que o form **nem coleta nem envia**. `saveStepBodySchema.parse` → 400 sempre.
Efeito dominó: o inbound não grava, `completedAt` nunca seta, e como o wizard avança só em sucesso, os steps 7 (outbound), 8 (mix) e 9 (realizado) ficam **inacessíveis** pela navegação guiada.
[step-conversoes-inbound.tsx:59-62](src/components/iniciar/step-conversoes-inbound.tsx#L59) · [unit-setup.ts:217-223](src/lib/validations/unit-setup.ts#L217) · [setup/route.ts:59-75](src/app/api/units/[id]/setup/route.ts#L59)

> **Correção:** tornar `eventosCusto`/`eventos` opcionais no schema do step, OU fazer o form carregá-los/enviá-los do default da matriz.

### A3. `invest` realizado fica sempre 0 — landing sem loader
**REAL-001** (crítico) + **WIRE-04** (médio). A derivação lê `realizado_import_investimento` (lb/mb/bb) para preencher `realizado_funil.invest`, mas **nenhum script popula essa tabela** (grep exaustivo só achou migration + schema + o derive que lê). Enquanto vazia, todo `invest = 0` → CPMQL/CPSQL/CPSAL/CAC do bowtie saem zerados.
[derive-realizado-funil.ts:202-224](scripts/derive-realizado-funil.ts#L202) · [load-realizado-import.ts:139-160](scripts/load-realizado-import.ts#L139)

> **Correção:** criar o loader da landing de investimento (espelho do `load-realizado-import.ts`) e um script em `package.json`.

### A4. Override por subcanal é gravado REDUZIDO por cima do que o usuário digitou
**REAL-01** (alto). `clampToCaps` reduz proporcionalmente todos os overrides do grupo quando o cap do mês cai, e o `lastSavedRef` força gravar o valor reduzido. O usuário digita X, o banco guarda Y < X sem aviso claro.
[editor-subcanal-mensal.tsx:134-152](src/components/realizado/editor-subcanal-mensal.tsx#L134)

### A5. Import descarta métricas silenciosamente
- **REAL-005** (alto): `tier_lead`/`tier_venda` inválido → `normalizeTier()→null` → leads/mql/sql/sal (topo) ou won/faturamento (venda) descartados.
- **REAL-006** (médio): data ausente ou fora de 2026 → métrica do estágio descartada.
- **REAL-002** (médio): `canal_origem` é lido e gravado na landing mas **nunca** chega ao funil (downstream cego).
- **REAL-003** (médio): MQL de subcanais fora de lead_broker/black_box é descartado na derivação (por design, mas é métrica do extrato que não persiste no funil).

### A6. Overrides de investimento mensal descartados em recarga
- **REAL-02** (médio): valor que coincide com o baseline (tolerância 1%) é filtrado fora do payload e some na recarga (vira "auto"). [editor-investimento-mensal.tsx:204-212](src/components/realizado/editor-investimento-mensal.tsx#L204)
- **REAL-03** (médio): override de mês cujo horizonte difere do horizonte atual é descartado no `buildInitial` → linha deletada.

---

## 🔴 BLOCO B — Segurança / integridade estrutural

### B1. ⚠️ Autenticação forjável (verificado manualmente, fora do workflow)
A sessão é o **UUID cru do usuário** gravado no cookie `v4_user_id`, sem assinatura/HMAC ([login/route.ts:60](src/app/api/auth/login/route.ts#L60)) e lido direto de volta ([current-user.ts:27-28](src/lib/auth/current-user.ts#L27)). O login com senha (bcrypt) é real, mas a sessão não é à prova de adulteração: quem conhecer um UUID de usuário válido (eles vazam em respostas de API) pode forjar `v4_user_id=<uuid>` e se passar por ele **sem senha**. O código se declara "mock para dev" ([current-user.ts:20-24](src/lib/auth/current-user.ts#L20)), mas a V2 está em produção. A tabela `sessions` existe para isso mas está 100% inerte (ver E1).

### B2. Rotas de escrita operacional não checam permissão — só visibilidade
**F1-api-auth** (crítico). `/api/premissas` (modo unidade), `/api/units/[id]/setup`, `/investimento-mensal` e `/subcanal-mensal` só validam se o usuário **vê** a unidade, nunca chamam `requirePermission`. Não existe permissão `data.*` na matriz ([permissions.ts:9-12](src/lib/auth/permissions.ts#L9) reconhece que ficou pendente). Resultado: um **coordenador** (papel mais baixo) pode sobrescrever premissas, time, conversões e investimento da unidade — recalculando todo o forecast.

### B3. Outras falhas de autorização
- **F4-api-auth** (alto): `PATCH /api/users/:id` (renomear) não confere se o alvo pertence à unidade do editor → **leak cross-unidade** (admin de A renomeia usuário de B).
- **F2-api-auth** (alto): a Matriz consegue editar dados operacionais da unidade via setup/overrides, contrariando a regra de negócio declarada.
- **UNI-01** (alto): o edit-modal de unidade sempre envia `status`+`horizonteAtual`; o PATCH rejeita isso com **403 para admin de unidade** → toda edição (até corrigir só o nome) falha. Edição de unidade só funciona para admin matriz. [edit-unit-modal.tsx:94-103](src/components/unidades/edit-unit-modal.tsx#L94) · [organizations/[id]/route.ts:58-68](src/app/api/organizations/[id]/route.ts#L58)
- **F5-api-auth** (médio): UUID de matriz **hardcoded** em `GET /api/users/:id` → membership regional aponta para org errada/inexistente e some da resposta.

### B4. Script `.mjs` perigoso (lacuna do crítico de completude)
`scripts/propagar-matriz-eventos.mjs` escreve **RAW SQL** direto (bypassa repositories, validação e audit) em `premissa_horizonte`, `premissa_eventos_custo` e `premissa_conversao_eventos`. Pior: a linha 2 carrega `.env.local` de **outro diretório de projeto hardcoded** (`/Users/.../V4 GTM Os/.env.local`, note `V4 GTM Os` ≠ o projeto atual `v4-gtm-os-main-V2`) e a linha 5 tem **MATRIZ UUID hardcoded**. Rodar no ambiente errado escreveria no banco errado.

---

## 🟠 BLOCO C — Lógica de negócio

- **DISTSPLIT** (alto): o split P4 por tier (`distSplit.pcts`) é consumido como share direto sem normalizar nem validar soma=100% → orçamento/receita por tier vaza ou infla se a soma divergir. [funil-reverso.ts] · persistido em `premissa_dist_split.pct`.
- **MATRIZ-META** (alto/bug): `agregarRampUpMatriz` não soma `metaMatriz` nem `deltaMeta` → meta consolidada da rede fica errada. [funil-reverso.ts:1607-1627](src/lib/premissas/funil-reverso.ts#L1607)
- ✅ **Comissão sobre resultado**: confirmado — a comissão do time incide sobre produção/receita, não sobre salário (regra de negócio crítica, sem desvio em `custo-time.ts`).

---

## 🟡 BLOCO D — Campos/tabelas órfãos (existem no banco, nunca são preenchidos)

| Item | Situação |
|---|---|
| **E1 — Tabela `sessions` inteira** | Nenhum insert/select/update/delete. Auth é por cookie cru (ver B1). 100% inerte. |
| **`users`: 4 colunas de token** | `activation_token`, `activation_expires_at`, `reset_token`, `reset_expires_at` nunca gravadas/lidas (auth-real pendente). |
| **`unit_setups`: 10 colunas jsonb** | `horizontes`, `timeComercial`, `metricasOperacionais`, etc. — substituídas pela estrutura normalizada `premissa_*`; nunca mais escritas nem lidas (só `realizado_historico`/`completed_steps` seguem em uso). |
| **`premissa_meeting_broker.meta` / `.pipeline`** | Sem UI de edição (saíram da tela); gravadas só com default. |
| **`realizado_import_lead.media_investment`** | Persistido cru, intencionalmente desconectado (substituído pela landing de investimento). Comentário stale em [bowtie.ts:180](src/lib/realizado/bowtie.ts#L180). |
| **`realizado_import_lead.canal_origem`** | Lido e gravado, nunca usado downstream. |
| **`realizado_import_investimento.db`** | Coluna existe, fora de `INVEST_COL_TO_SUBCANAL` (de-para pendente). |
| **`audit_log`** | Só **1 de 15** rotas mutadoras grava auditoria (apenas promoção de horizonte). As outras 14 (organizations, users, memberships, premissas, setup, overrides, auth) não registram. |

---

## ✅ BLOCO E — O que está correto / verificado e descartado

- **Zero drift** schema.ts ↔ 20 migrations (colunas, 10 enums, índices, constraints). Rename 0017 organizations→unidades consistente. `seed.ts` e `migrate-premissas-jsonb.ts` batem com o schema.
- Typecheck limpo (0 erros).
- **REFUTADO — Time email/capacidade zerado:** o caminho destrutivo (`toMembroBlock` hardcoda `email:""`/`capacidadePct:100`) só roda na página da **Matriz**, que é template por cargo e não tem dado por pessoa a destruir; na Unidade a seção está oculta e o dado real é salvo por outra rota/entidade. **Não há perda de dado hoje** — é fragilidade latente (blindar se a Matriz ganhar editor por pessoa).
- **REFUTADO — "invest realizado inflado da rede":** o comentário em `bowtie.ts` está desatualizado; a fonte do `invest` já foi trocada para a landing per-unidade/per-subcanal. (O problema real é `invest=0` por falta de loader — ver A3 — não inflação.)

---

## ❓ BLOCO F — Dúvidas / decisões para você

1. **Auth (B1/E1):** o modelo de cookie cru + tabela `sessions` inerte é o definitivo para produção, ou a "auth real" (token assinado + validação na `sessions`) ainda vai entrar? **Recomendo tratar como bloqueador de produção.**
2. **Permissões de escrita (B2):** coordenador poder sobrescrever o forecast da unidade é intencional (MVP) ou precisa de `data.update`?
3. **`audit_log` parcial:** registrar só promoção de horizonte é proposital ou a trilha deveria cobrir todas as mutações?
4. **CNPJ:** gravado sem validação de formato/dígitos nem unicidade (duas unidades podem ter o mesmo). Aceitável?
5. **Script `.mjs` (B4):** o path/UUID de outro projeto é resíduo ou está em uso? É arriscado mantê-lo assim.
6. **Colunas órfãs (Bloco D):** manter (intenção futura) ou limpar para reduzir superfície?

---

### Apêndice — Notas de tooling
- `package.json` script `"lint": "next lint"` está quebrado: `next lint` foi **removido no Next 16**.
- `.eslintrc.json` (legado) é incompatível com ESLint 9 (espera flat config `eslint.config.js`) → lint não roda neste ambiente. Migração de config pendente. Não afeta runtime.
