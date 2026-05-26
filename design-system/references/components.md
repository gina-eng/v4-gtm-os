# V4 Components

Componentes primitivos prontos. Cada um é o menor bloco autocontido — combine pra montar telas.

## Botões

### Botão primário (preto, principal CTA)

```html
<button class="inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
  Salvar
</button>
```

### Botão accent (bordô, ação destacada V4)

```html
<button class="inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
  Confirmar
</button>
```

### Botão outline (secundário)

```html
<button class="inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium border border-border bg-transparent text-foreground hover:bg-muted transition-colors">
  Cancelar
</button>
```

### Botão ghost (terciário, sem borda)

```html
<button class="inline-flex items-center justify-center gap-2 px-3 h-8 rounded text-xs font-medium text-foreground hover:bg-muted transition-colors">
  <i data-lucide="filter" class="h-3.5 w-3.5"></i>
  Filtrar
</button>
```

### Botão destructive (vermelho — apagar, sair)

```html
<button class="inline-flex items-center justify-center gap-2 px-4 h-9 rounded text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity">
  Excluir
</button>
```

### Botão ícone (square, sem texto)

```html
<button class="inline-flex items-center justify-center h-9 w-9 rounded text-foreground hover:bg-muted" title="Editar">
  <i data-lucide="pencil" class="h-4 w-4"></i>
</button>
```

### Tamanhos

- `h-7 px-2 text-xs` — extra small (sidebar trigger)
- `h-8 px-3 text-xs` — small (chips, filtros)
- `h-9 px-4 text-sm` — médio (padrão)
- `h-10 px-5 text-sm` — large (CTAs principais)

---

## Inputs

### Input texto

```html
<input type="text" placeholder="Digite aqui"
  class="w-full h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50">
```

### Input com ícone esquerdo

```html
<div class="relative">
  <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"></i>
  <input type="text" placeholder="Buscar..."
    class="w-full h-9 rounded border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
</div>
```

### Select

```html
<select class="h-9 rounded border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
  <option>Selecione...</option>
  <option value="1">Opção 1</option>
</select>
```

### Textarea

```html
<textarea rows="4"
  class="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
  placeholder="..."></textarea>
```

### Checkbox

```html
<label class="flex items-center gap-2 text-sm cursor-pointer">
  <input type="checkbox" class="h-4 w-4 rounded border-input accent-accent">
  Texto da opção
</label>
```

### Radio

```html
<label class="flex items-center gap-2 text-sm cursor-pointer">
  <input type="radio" name="grupo" class="h-4 w-4 accent-accent">
  Opção A
</label>
```

### Switch (toggle)

CSS extra (cole junto):

```css
.v4-switch { appearance: none; width: 36px; height: 20px; background: hsl(var(--muted)); border-radius: 999px; position: relative; cursor: pointer; transition: background 0.2s; }
.v4-switch:checked { background: hsl(var(--accent)); }
.v4-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 0.2s; }
.v4-switch:checked::after { transform: translateX(16px); }
```

```html
<label class="flex items-center gap-2 text-sm cursor-pointer">
  <input type="checkbox" class="v4-switch">
  Ativo
</label>
```

---

## Tipografia

```html
<!-- Título de tela -->
<h1 class="text-xl font-semibold text-foreground">Título da Tela</h1>

<!-- Título de seção -->
<h2 class="text-base font-semibold text-foreground mb-3">Seção</h2>

<!-- Subtítulo / label -->
<h3 class="text-sm font-medium text-foreground">Subtítulo</h3>

<!-- Label em cima de input -->
<label class="text-xs font-medium text-foreground block mb-1">Label</label>

<!-- Texto auxiliar / metadado -->
<p class="text-xs text-muted-foreground">Texto auxiliar</p>

<!-- Número grande (KPI) -->
<div class="text-2xl font-semibold tabular-nums">R$ 142,5M</div>

<!-- Número pequeno em tabela -->
<span class="text-xs tabular-nums">88,4%</span>

<!-- Mono (datas, IDs) -->
<span class="text-xs font-mono">18/05/2026</span>

<!-- Link -->
<a href="#" class="text-foreground font-medium hover:underline">Texto do link</a>
```

---

## Cards

### Card básico

```html
<div class="bg-card border border-border rounded p-4">
  Conteúdo
</div>
```

### Card com header

```html
<div class="bg-card border border-border rounded overflow-hidden">
  <div class="px-4 py-3 border-b border-border flex items-center justify-between">
    <h3 class="text-sm font-semibold">Título do Card</h3>
    <button class="text-muted-foreground hover:text-foreground">
      <i data-lucide="more-horizontal" class="h-4 w-4"></i>
    </button>
  </div>
  <div class="p-4 text-sm">
    Corpo do card.
  </div>
</div>
```

---

## Badges

```html
<!-- Default -->
<span class="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">Default</span>

<!-- Accent (bordô) -->
<span class="inline-flex items-center rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">Premium</span>

<!-- Success -->
<span class="inline-flex items-center rounded-full bg-success text-success-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">Ativo</span>

<!-- Warning -->
<span class="inline-flex items-center rounded-full bg-warning text-warning-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">Atenção</span>

<!-- Destructive -->
<span class="inline-flex items-center rounded-full bg-destructive text-destructive-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">Crítico</span>

<!-- Outline -->
<span class="inline-flex items-center rounded-full border border-border text-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">Outline</span>
```

---

## Separadores

```html
<!-- Horizontal -->
<div class="h-px bg-border my-4"></div>

<!-- Vertical (inline) -->
<div class="h-4 w-px bg-border mx-2"></div>
```

---

## Tabs (sem JS, usando :checked hack ou usar JS leve)

Com JS simples:

```html
<div class="border-b border-border flex gap-1">
  <button class="px-4 h-9 text-sm font-medium text-foreground border-b-2 border-accent">Aba 1</button>
  <button class="px-4 h-9 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground">Aba 2</button>
  <button class="px-4 h-9 text-sm font-medium text-muted-foreground border-b-2 border-transparent hover:text-foreground">Aba 3</button>
</div>
```

---

## Ícones (lucide)

V4 usa lucide. Tamanhos:
- `h-3 w-3` — chevron em chip
- `h-3.5 w-3.5` — ícone em botão ghost pequeno
- `h-4 w-4` — padrão (botões, menus, ações)
- `h-5 w-5` — destaque
- `h-6 w-6` — logo, navegação principal

Lista de ícones comuns no V4:
- Navegação: `target`, `map`, `calendar`, `git-branch`, `layout-dashboard`
- Ações: `pencil`, `trash-2`, `plus`, `x`, `check`, `download`, `upload`
- Estado: `lock`, `lock-open`, `info`, `alert-circle`, `check-circle-2`
- Layout: `panel-left`, `chevron-down`, `chevron-right`, `more-horizontal`
- Sair: `log-out`

```html
<i data-lucide="nome-do-icone" class="h-4 w-4"></i>
<script>lucide.createIcons();</script>
```

---

## Empty state

Quando não há dados:

```html
<div class="flex flex-col items-center justify-center py-12 text-center">
  <div class="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
    <i data-lucide="inbox" class="h-6 w-6 text-muted-foreground"></i>
  </div>
  <h3 class="text-sm font-medium text-foreground mb-1">Nada por aqui ainda</h3>
  <p class="text-xs text-muted-foreground mb-4 max-w-xs">Adicione o primeiro item para começar a acompanhar.</p>
  <button class="inline-flex items-center gap-2 px-4 h-9 rounded text-sm font-medium bg-accent text-accent-foreground hover:opacity-90">
    <i data-lucide="plus" class="h-4 w-4"></i>
    Criar
  </button>
</div>
```

---

## Loading skeleton

```html
<div class="space-y-2">
  <div class="h-4 bg-muted rounded animate-pulse w-3/4"></div>
  <div class="h-4 bg-muted rounded animate-pulse w-1/2"></div>
  <div class="h-4 bg-muted rounded animate-pulse w-5/6"></div>
</div>
```
