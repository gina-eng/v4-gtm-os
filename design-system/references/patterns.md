# V4 Patterns

Padrões compostos extraídos do dashboard V4. Cada um é um snippet pronto pra copiar e adaptar.

## Index

1. [Tabela densa com sistema de farol](#tabela-densa-com-sistema-de-farol)
2. [Header de tabela bordô (estilo V4)](#header-de-tabela-bordo)
3. [Card de KPI](#card-de-kpi)
4. [Filtros (chips/selects no topo)](#filtros)
5. [Legenda de cores](#legenda-de-cores)
6. [Badge de status](#badge-de-status)
7. [Tooltip de info](#tooltip-de-info)
8. [Modal/Dialog](#modal-dialog)
9. [Formulário denso](#formulario-denso)

---

## Tabela densa com sistema de farol

A assinatura visual V4. Linhas alternadas, headers coloridos por significado (piso=warning, parcial=verde-médio, meta=success), números em `tabular-nums`.

```html
<div class="rounded border border-border overflow-auto">
  <table class="w-full caption-bottom text-sm">
    <thead class="sticky top-0 z-30 shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)]">
      <tr class="border-b">
        <th class="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-xs">Objetivo</th>
        <th class="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-xs">Key Result</th>
        <th class="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-xs">DRI</th>
        <th class="bg-warning text-warning-foreground text-center h-8 font-medium px-3 py-1.5 text-xs">Piso</th>
        <th class="bg-[hsl(142,71%,45%)] text-white text-center h-8 font-medium px-3 py-1.5 text-xs">Parcial</th>
        <th class="bg-success text-success-foreground text-center h-8 font-medium px-3 py-1.5 text-xs">Meta</th>
        <th class="bg-table-header text-table-header-foreground text-center h-8 font-medium px-3 py-1.5 text-xs">Real</th>
        <th class="bg-table-header text-table-header-foreground text-center h-8 font-medium px-3 py-1.5 text-xs">Nota</th>
      </tr>
    </thead>
    <tbody>
      <tr class="bg-card border-b hover:bg-muted transition-colors">
        <td class="font-medium align-top px-3 py-1.5 text-xs">Expandir NRR</td>
        <td class="px-3 py-1.5 text-xs"><a class="hover:underline font-medium" href="#">Receita renovação</a></td>
        <td class="text-muted-foreground px-3 py-1.5 text-xs">Arthur Silva</td>
        <td class="text-right tabular-nums bg-warning/10 px-3 py-1.5 text-xs">14,4M</td>
        <td class="text-right tabular-nums bg-[hsl(142,71%,45%)]/10 px-3 py-1.5 text-xs">15,9M</td>
        <td class="text-right tabular-nums bg-success/10 px-3 py-1.5 text-xs">17,4M</td>
        <td class="text-right tabular-nums font-medium px-3 py-1.5 text-xs">15,0M</td>
        <td class="text-center tabular-nums font-medium px-3 py-1.5 text-xs">
          <span class="inline-flex items-center gap-1">
            <span class="h-2 w-2 rounded-sm bg-warning"></span>88,4%
          </span>
        </td>
      </tr>
      <!-- Linha alternada (bg-muted/30) -->
      <tr class="bg-muted/30 border-b hover:bg-muted transition-colors">
        <td class="font-medium align-top px-3 py-1.5 text-xs">Expandir NRR</td>
        <td class="px-3 py-1.5 text-xs"><a class="hover:underline font-medium" href="#">Receita expansão</a></td>
        <td class="text-muted-foreground px-3 py-1.5 text-xs">Arthur Silva</td>
        <td class="text-right tabular-nums bg-warning/10 px-3 py-1.5 text-xs">8,2M</td>
        <td class="text-right tabular-nums bg-[hsl(142,71%,45%)]/10 px-3 py-1.5 text-xs">8,9M</td>
        <td class="text-right tabular-nums bg-success/10 px-3 py-1.5 text-xs">9,7M</td>
        <td class="text-right tabular-nums font-medium px-3 py-1.5 text-xs">10,2M</td>
        <td class="text-center tabular-nums font-medium px-3 py-1.5 text-xs">
          <span class="inline-flex items-center gap-1">
            <span class="h-2 w-2 rounded-sm bg-[hsl(142,71%,45%)]"></span>114,6%
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

**Regras de uso:**
- Linhas pares: `bg-card`. Ímpares: `bg-muted/30`. Sempre alterne.
- Colunas numéricas: `text-right tabular-nums`.
- Coluna "Nota/Atingimento": quadradinho de cor + valor, `text-center`.
- Header sticky com sombra suave embaixo.
- Hover: `hover:bg-muted` em toda a linha.

---

## Header de tabela bordô

Quando a tabela tem 3+ colunas e precisa de ênfase visual:

```html
<thead>
  <tr>
    <th class="bg-table-header text-table-header-foreground h-8 font-medium text-left px-3 py-1.5 text-xs uppercase tracking-wider">Coluna</th>
  </tr>
</thead>
```

Use `uppercase tracking-wider text-[10px]` para headers ainda mais densos.

---

## Card de KPI

Bloco compacto pra mostrar um número grande + label + delta.

```html
<div class="bg-card border border-border rounded p-4">
  <div class="text-xs text-muted-foreground uppercase tracking-wider mb-1">Receita Bruta</div>
  <div class="text-2xl font-semibold tabular-nums">R$ 66,7M</div>
  <div class="flex items-center gap-1 mt-1 text-xs">
    <span class="h-2 w-2 rounded-sm bg-[hsl(142,71%,45%)]"></span>
    <span class="text-muted-foreground">vs meta: -27,3M (70,9%)</span>
  </div>
</div>
```

Grid de KPIs:

```html
<div class="grid grid-cols-4 gap-3 mb-4">
  <!-- 4 KPI cards aqui -->
</div>
```

---

## Filtros

Linha de chips/selects acima da tabela:

```html
<div class="flex items-center justify-between gap-3 flex-wrap mb-3">
  <div class="flex items-center gap-2 flex-wrap">
    <span class="text-xs font-medium text-muted-foreground mr-1">Filtrar:</span>

    <!-- Chip filtro -->
    <button class="inline-flex items-center justify-center border border-border bg-transparent hover:bg-muted text-foreground px-3 rounded h-8 gap-1.5 text-xs font-medium">
      <span>Objetivo</span>
      <i data-lucide="chevron-down" class="h-3 w-3 opacity-60"></i>
    </button>

    <button class="inline-flex items-center justify-center border border-border bg-transparent hover:bg-muted text-foreground px-3 rounded h-8 gap-1.5 text-xs font-medium">
      <span>DRI</span>
      <i data-lucide="chevron-down" class="h-3 w-3 opacity-60"></i>
    </button>
  </div>

  <div class="text-xs text-muted-foreground tabular-nums">61 resultados</div>
</div>
```

Select tipo "Mês Referência":

```html
<div class="flex items-center gap-2">
  <span class="text-sm text-muted-foreground">Mês Referência</span>
  <button class="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm h-8 w-[180px]">
    <span>Abril / 2026</span>
    <i data-lucide="chevron-down" class="h-4 w-4 opacity-50"></i>
  </button>
</div>
```

---

## Legenda de cores

Pra explicar o sistema de farol:

```html
<div class="flex flex-wrap items-center gap-4 text-xs mb-3">
  <span class="font-medium text-muted-foreground">Legenda:</span>
  <span class="flex items-center gap-1.5">
    <span class="h-2.5 w-2.5 rounded-sm bg-foreground"></span> &lt;80%
  </span>
  <span class="flex items-center gap-1.5">
    <span class="h-2.5 w-2.5 rounded-sm bg-warning"></span> 80–99%
  </span>
  <span class="flex items-center gap-1.5">
    <span class="h-2.5 w-2.5 rounded-sm bg-[hsl(142,71%,45%)]"></span> 100–119%
  </span>
  <span class="flex items-center gap-1.5">
    <span class="h-2.5 w-2.5 rounded-sm bg-success"></span> ≥120%
  </span>
</div>
```

---

## Badge de status

Pequeno indicador colorido inline. Use para tags, status, trigger de bônus:

```html
<!-- Badge accent (bordô) com cadeado -->
<span class="inline-flex items-center justify-center rounded-full bg-accent/10 border border-accent/20 h-4 w-4">
  <i data-lucide="lock-open" class="h-2.5 w-2.5 text-accent"></i>
</span>

<!-- Badge "novo" -->
<span class="inline-flex items-center rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium">Novo</span>

<!-- Badge "breve" -->
<span class="text-[8px] uppercase tracking-widest text-muted-foreground/60 font-semibold">breve</span>
```

---

## Tooltip de info

Ícone "?" ao lado do título, abre tooltip ao hover:

```html
<button type="button" aria-label="Sobre essa tela"
  class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
  title="Texto do tooltip aqui">
  <i data-lucide="info" class="h-4 w-4"></i>
</button>
```

---

## Modal/Dialog

Use `<dialog>` nativo do HTML, sem JS pesado:

```html
<dialog id="meu-modal" class="rounded-lg p-0 backdrop:bg-black/50 max-w-lg w-full">
  <div class="bg-card text-card-foreground p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">Título do Modal</h2>
      <button onclick="document.getElementById('meu-modal').close()" class="text-muted-foreground hover:text-foreground">
        <i data-lucide="x" class="h-4 w-4"></i>
      </button>
    </div>
    <div class="text-sm">
      Conteúdo aqui.
    </div>
    <div class="flex justify-end gap-2 mt-6">
      <button onclick="document.getElementById('meu-modal').close()"
        class="px-4 h-9 rounded text-sm border border-border hover:bg-muted">Cancelar</button>
      <button class="px-4 h-9 rounded text-sm bg-primary text-primary-foreground hover:opacity-90">Confirmar</button>
    </div>
  </div>
</dialog>

<!-- Trigger -->
<button onclick="document.getElementById('meu-modal').showModal()"
  class="px-3 h-8 rounded text-xs bg-accent text-accent-foreground hover:opacity-90">
  Abrir
</button>
```

---

## Formulário denso

Inputs compactos, labels em cima:

```html
<form class="space-y-3 max-w-xl">
  <div>
    <label class="text-xs font-medium text-foreground block mb-1">Nome</label>
    <input type="text"
      class="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      placeholder="Digite aqui">
  </div>

  <div>
    <label class="text-xs font-medium text-foreground block mb-1">Categoria</label>
    <select class="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      <option>Selecione...</option>
      <option>Opção 1</option>
    </select>
  </div>

  <div>
    <label class="text-xs font-medium text-foreground block mb-1">Observação</label>
    <textarea rows="3"
      class="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      placeholder="..."></textarea>
  </div>

  <!-- Checkbox -->
  <label class="flex items-center gap-2 text-sm cursor-pointer">
    <input type="checkbox" class="h-4 w-4 rounded border-input accent-accent">
    Concordo com os termos
  </label>

  <!-- Ações -->
  <div class="flex justify-end gap-2 pt-2">
    <button type="button" class="px-4 h-9 rounded text-sm border border-border hover:bg-muted">Cancelar</button>
    <button type="submit" class="px-4 h-9 rounded text-sm bg-accent text-accent-foreground hover:opacity-90 font-medium">Salvar</button>
  </div>
</form>
```
