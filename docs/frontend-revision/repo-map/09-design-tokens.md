# Fimmick ClientOps — Design System Map

All claims below come from files opened in this pass. File paths are absolute-from-repo-root (`C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker/`).

---

## 1. `src/styles.css` — full token table

The file is 179 lines. Structure:

| Lines | Content |
|---|---|
| 3 | `@layer theme, base, neon-auth, components, utilities;` (explicit cascade-layer order) |
| 4 | `@import "@neondatabase/auth-ui/css" layer(neon-auth);` |
| 5 | `@import "tailwindcss" source(none);` |
| 6 | `@source "../src";` |
| 7 | `@import "tw-animate-css";` |
| 9 | `@custom-variant dark (&:is(.dark *));` |
| 11–56 | `@theme inline { … }` — Tailwind utility surface |
| 58–98 | `:root { … }` — light palette (39 declarations) |
| 100–139 | `.dark { … }` — dark palette (38 declarations) |
| 141–179 | `@layer base { … }` — base element styles |

### 1a. Raw palette tokens (`:root` / `.dark`)

Every value is `oklch()`. `--radius` is the only token **not** redefined in `.dark`.

| Token | Light (`:root`) | Dark (`.dark`) | Apparent role |
|---|---|---|---|
| `--radius` | `0.625rem` | *(not redefined — inherits light)* | Base corner radius; all `--radius-*` derive from it |
| `--background` | `oklch(0.985 0.004 250)` | `oklch(0.15 0.02 260)` | App canvas / page background |
| `--foreground` | `oklch(0.13 0.035 260)` | `oklch(0.97 0.005 250)` | Default body text |
| `--card` | `oklch(1 0 0)` | `oklch(0.2 0.03 262)` | Card surface (pure white in light — elevated above `--background`) |
| `--card-foreground` | `oklch(0.13 0.035 260)` | `oklch(0.97 0.005 250)` | Text on card |
| `--popover` | `oklch(1 0 0)` | `oklch(0.2 0.03 262)` | Popover / dropdown / tooltip-adjacent surface |
| `--popover-foreground` | `oklch(0.13 0.035 260)` | `oklch(0.97 0.005 250)` | Text on popover |
| `--primary` | `oklch(0.21 0.04 266)` | `oklch(0.7 0.18 266)` | Brand/primary action. **Note the polarity flip**: near-black navy in light, bright violet-blue in dark |
| `--primary-foreground` | `oklch(1 0 0)` | `oklch(0.15 0.02 260)` | Text on primary |
| `--secondary` | `oklch(0.96 0.012 255)` | `oklch(0.27 0.03 262)` | Quiet filled surface (secondary buttons, chips) |
| `--secondary-foreground` | `oklch(0.26 0.04 260)` | `oklch(0.97 0.005 250)` | Text on secondary |
| `--muted` | `oklch(0.95 0.012 255)` | `oklch(0.27 0.03 262)` | Muted fill (table stripes, disabled surfaces) |
| `--muted-foreground` | `oklch(0.48 0.035 257)` | `oklch(0.7 0.03 258)` | De-emphasised text (labels, hints, captions) |
| `--accent` | `oklch(0.47 0.12 245)` | `oklch(0.3 0.05 268)` | Hover/highlight surface. **Inconsistent semantics**: light is a saturated mid-blue (a *colour*), dark is a low-chroma dark surface (a *neutral hover fill*). shadcn primitives use it as a hover background (`hover:bg-accent`), which reads oddly in light mode |
| `--accent-foreground` | `oklch(1 0 0)` | `oklch(0.97 0.005 250)` | Text on accent |
| `--destructive` | `oklch(0.58 0.22 27)` | `oklch(0.65 0.2 25)` | Error / delete / negative delta |
| `--destructive-foreground` | `oklch(1 0 0)` | `oklch(0.97 0.005 250)` | Text on destructive |
| `--success` | `oklch(0.54 0.14 155)` | `oklch(0.7 0.15 155)` | Positive state (won, accepted, completed, +delta) |
| `--success-foreground` | `oklch(1 0 0)` | `oklch(0.15 0.02 260)` | Text on success |
| `--warning` | `oklch(0.76 0.15 75)` | `oklch(0.8 0.15 75)` | Caution state (pending approval, in progress) |
| `--warning-foreground` | `oklch(0.2 0.04 60)` | `oklch(0.2 0.04 60)` | Text on warning — **identical in both schemes** (dark brown), because `--warning` is a light amber in both |
| `--info` | `oklch(0.55 0.13 240)` | `oklch(0.7 0.14 230)` | Neutral-informational state (new, open, running, sent) |
| `--info-foreground` | `oklch(1 0 0)` | `oklch(0.15 0.02 260)` | Text on info |
| `--border` | `oklch(0.91 0.014 255)` | `oklch(1 0 0 / 10%)` | Hairlines. Dark uses **alpha white**, not an opaque colour |
| `--input` | `oklch(0.91 0.014 255)` | `oklch(1 0 0 / 15%)` | Form-control border (also alpha in dark) |
| `--ring` | `oklch(0.21 0.04 266)` | `oklch(0.7 0.18 266)` | Focus ring — tracks `--primary` exactly |
| `--chart-1` | `oklch(0.21 0.04 266)` | `oklch(0.7 0.18 266)` | Chart series 1 = primary |
| `--chart-2` | `oklch(0.55 0.13 240)` | `oklch(0.7 0.14 230)` | Chart series 2 = info |
| `--chart-3` | `oklch(0.54 0.14 155)` | `oklch(0.7 0.15 155)` | Chart series 3 = success |
| `--chart-4` | `oklch(0.76 0.15 75)` | `oklch(0.8 0.15 75)` | Chart series 4 = warning |
| `--chart-5` | `oklch(0.58 0.22 27)` | `oklch(0.65 0.2 25)` | Chart series 5 = destructive |
| `--sidebar` | `oklch(0.98 0.004 250)` | `oklch(0.18 0.025 262)` | Sidebar surface (slightly off `--background` in both) |
| `--sidebar-foreground` | `oklch(0.24 0.035 260)` | `oklch(0.97 0.005 250)` | Sidebar text |
| `--sidebar-primary` | `oklch(0.21 0.04 266)` | `oklch(0.7 0.18 266)` | Sidebar brand accent = primary |
| `--sidebar-primary-foreground` | `oklch(1 0 0)` | `oklch(0.15 0.02 260)` | Text on sidebar primary |
| `--sidebar-accent` | `oklch(0.94 0.016 255)` | `oklch(0.27 0.04 265)` | Sidebar hover / active-item fill |
| `--sidebar-accent-foreground` | `oklch(0.24 0.035 260)` | `oklch(0.97 0.005 250)` | Text on sidebar accent |
| `--sidebar-border` | `oklch(0.91 0.014 255)` | `oklch(1 0 0 / 10%)` | Sidebar hairlines |
| `--sidebar-ring` | `oklch(0.21 0.04 266)` | `oklch(0.7 0.18 266)` | Sidebar focus ring |

**Chart tokens are a re-alias of the semantic five** (primary, info, success, warning, destructive) — there is no independent chart palette. `src/components/reports/report-charts.tsx` mostly bypasses `--chart-*` and reads `var(--color-primary)`, `var(--color-success)`, `var(--color-info)`, `var(--color-border)`, `var(--color-muted-foreground)`, `var(--color-popover)` directly.

**Not defined anywhere in CSS**: spacing scale overrides, shadow tokens, z-index tokens, typography-scale tokens, breakpoint tokens, motion/duration tokens. Those are all Tailwind defaults. `--sidebar-width` / `--sidebar-width-icon` / `--skeleton-width` exist but are set as **inline `style` props in `src/components/ui/sidebar.tsx`**, not in `styles.css`.

### 1b. `@layer base` rules (lines 141–179)

- `html { color-scheme: light; -webkit-tap-highlight-color: transparent; }`
- `html.dark { color-scheme: dark; }`
- `* { border-color: var(--color-border); }` — global default border colour, so bare `border` utilities are already themed
- `body { background-color: var(--color-background); color: var(--color-foreground); font-family: var(--font-sans); font-feature-settings: "cv02","cv03","cv04","cv11"; -webkit-font-smoothing: antialiased; overflow-x: hidden; touch-action: manipulation; }`
- `table { font-variant-numeric: tabular-nums; }` — **all tables are tabular-nums globally**
- `@media (prefers-reduced-motion: reduce)` block zeroing animation/transition durations and `scroll-behavior`

---

## 2. Tailwind 4 theme configuration

**CSS-first, no JS config.** `tailwind.config.*` and `postcss.config.*` are **absent** from the repo root (verified by `ls`). Tailwind is wired through `@tailwindcss/vite` bundled inside `@lovable.dev/vite-tanstack-config` (`vite.config.ts` header comment says so explicitly; the config must not re-add the plugin).

Directives, all in `src/styles.css`:

| Directive | Value | Effect |
|---|---|---|
| `@layer theme, base, neon-auth, components, utilities;` | line 3 | Pins Neon auth-ui's unlayered preflight *below* components/utilities so it can't override app styles |
| `@import "@neondatabase/auth-ui/css" layer(neon-auth)` | line 4 | Third-party auth UI CSS, layered |
| `@import "tailwindcss" source(none)` | line 5 | Tailwind core with **automatic source detection disabled** |
| `@source "../src"` | line 6 | Explicit single scan root — class strings outside `src/` are **not** compiled |
| `@import "tw-animate-css"` | line 7 | Supplies `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` used by dialog/sheet/tooltip |
| `@custom-variant dark (&:is(.dark *))` | line 9 | Class-based dark variant (see §3) |
| `@theme inline { … }` | lines 11–56 | The utility surface |

**No `@plugin` directives anywhere.** No `@utility` definitions. `@theme` uses the `inline` modifier, so the generated utilities reference `var(--background)` etc. directly rather than a second indirection.

### Tokens exposed as Tailwind utilities (via `@theme inline`)

| `@theme` key | Utility names generated | Backed by |
|---|---|---|
| `--font-sans` | `font-sans` | `"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif` (literal, not a var) |
| `--radius-sm` | `rounded-sm` | `calc(var(--radius) - 4px)` → 0.375rem |
| `--radius-md` | `rounded-md` | `calc(var(--radius) - 2px)` → 0.5rem |
| `--radius-lg` | `rounded-lg` | `var(--radius)` → 0.625rem |
| `--radius-xl` | `rounded-xl` | `calc(var(--radius) + 4px)` → 0.875rem |
| `--color-background` | `bg-background`, `text-background`, `border-background`, … | `var(--background)` |
| `--color-foreground` | `text-foreground`, `bg-foreground`, … | `var(--foreground)` |
| `--color-card` / `--color-card-foreground` | `bg-card`, `text-card-foreground` | `var(--card)` / `var(--card-foreground)` |
| `--color-popover` / `--color-popover-foreground` | `bg-popover`, `text-popover-foreground` | ditto |
| `--color-primary` / `--color-primary-foreground` | `bg-primary`, `text-primary`, `text-primary-foreground`, `ring-primary` | ditto |
| `--color-secondary` / `-foreground` | `bg-secondary`, `text-secondary-foreground` | ditto |
| `--color-muted` / `-foreground` | `bg-muted`, `text-muted-foreground` | ditto |
| `--color-accent` / `-foreground` | `bg-accent`, `text-accent-foreground` | ditto |
| `--color-destructive` / `-foreground` | `bg-destructive`, `text-destructive`, `text-destructive-foreground` | ditto |
| `--color-success` / `-foreground` | `bg-success`, `text-success`, `text-success-foreground` | ditto |
| `--color-warning` / `-foreground` | `bg-warning`, `text-warning-foreground` | ditto |
| `--color-info` / `-foreground` | `bg-info`, `text-info`, `text-info-foreground` | ditto |
| `--color-border` | `border-border`, `bg-border` | `var(--border)` |
| `--color-input` | `border-input` | `var(--input)` |
| `--color-ring` | `ring-ring`, `focus-visible:ring-ring` | `var(--ring)` |
| `--color-ring-offset-background` | `ring-offset-background` | `var(--background)` — aliased so shadcn's `ring-offset-background` class resolves |
| `--color-chart-1` … `-5` | `fill-chart-1`, `stroke-chart-2`, `bg-chart-3`, … | `var(--chart-N)` |
| `--color-sidebar` | `bg-sidebar` | `var(--sidebar)` |
| `--color-sidebar-foreground` | `text-sidebar-foreground` | ditto |
| `--color-sidebar-primary` / `-foreground` | `bg-sidebar-primary`, `text-sidebar-primary-foreground` | ditto |
| `--color-sidebar-accent` / `-foreground` | `bg-sidebar-accent`, `text-sidebar-accent-foreground` | ditto |
| `--color-sidebar-border` | `border-sidebar-border` | ditto |
| `--color-sidebar-ring` | `ring-sidebar-ring` | ditto |

Opacity modifiers work on all of these (`bg-primary/10`, `border-warning/30`, `bg-black/40`) since they are colour utilities.

**Not exposed** (so no utility exists): `--radius` itself, and anything not listed above. `rounded-full`, `rounded-none`, `rounded-2xl`/`3xl` etc. remain Tailwind defaults, unaffected by `--radius`.

### `components.json`

```json
{ "style": "new-york", "rsc": false, "tsx": true,
  "tailwind": { "css": "src/styles.css", "baseColor": "slate", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" } }
```

`cn` is `twMerge(clsx(...))` in `src/lib/utils.ts`.

---

## 3. Dark-mode mechanism

**Class-based, on `<html>`. No media query, no data attribute, no `next-themes`.**

- Variant definition: `@custom-variant dark (&:is(.dark *))` (`src/styles.css:9`). Note the selector is `.dark *` — `dark:` styles apply to **descendants** of `.dark`, not to the `.dark` element itself.
- Palette override: the `.dark { … }` block (`src/styles.css:100`).
- `html.dark { color-scheme: dark; }` (`src/styles.css:147`) for native form controls / scrollbars.

**Where it is set:**

1. **Inline blocking script in `src/routes/__root.tsx`** (`RootShell`, inside `<head>`, via `dangerouslySetInnerHTML`) — runs before paint to avoid FOUC:
   ```js
   try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}
   ```
   So: explicit `localStorage.theme` wins; with no stored value it falls back to the OS `prefers-color-scheme`.
2. **`src/components/theme-toggle.tsx`** — the only toggle. Exports `ThemeToggle()` (no props). Reads `document.documentElement.classList.contains("dark")`, flips it with `classList.toggle("dark", next)`, then writes `localStorage.setItem("theme", next ? "dark" : "light")` inside a `try/catch` (private-mode safe). Renders a ghost icon Button with `aria-label="Toggle theme"`; icon swap is pure CSS — `<Sun className="hidden h-4 w-4 dark:block" />` and `<Moon className="h-4 w-4 dark:hidden" />`.
3. Mounted in the app header in `__root.tsx`'s `RootComponent`, in the right-hand cluster next to `GlobalSearch`, `NotificationBell`, and the avatar initials chip.

`<html lang="en" suppressHydrationWarning>` guards the SSR/client class mismatch.

There is **no React context / provider / hook** for theme, and no way to read the current theme in React — the state lives only in the DOM class and `localStorage`. **A `useTheme()`-style hook is absent.**

---

## 4. Fonts

**One family: Plus Jakarta Sans**, loaded from Google Fonts over the network. No self-hosting, no `@font-face`, no local font files.

In `src/routes/__root.tsx` `head().links`:
```
{ rel: "preconnect", href: "https://fonts.googleapis.com" }
{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" }
{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" }
```
Exact loaded axes: weights **400, 500, 600, 700, 800** upright plus **400 italic**; `display=swap`.

Applied via `--font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif` in `@theme inline` (so `font-sans` utility) and set on `body` in `@layer base`.

`font-feature-settings: "cv02","cv03","cv04","cv11"` on `body` (character-variant alternates).

**No mono or serif family is declared** — `font-mono`/`font-serif` fall back to Tailwind defaults.

---

## 5. Breakpoints

**Tailwind 4 defaults, uncustomised.** No `--breakpoint-*` token is defined anywhere (grepped `--breakpoint` across all `.css` in `src/` — zero hits), and there is no JS config.

| Prefix | Min-width | Usage count across `src/**/*.tsx` |
|---|---|---|
| `sm:` | 40rem / 640px | 92 |
| `md:` | 48rem / 768px | 65 |
| `lg:` | 64rem / 1024px | 35 |
| `xl:` | 80rem / 1280px | 16 |
| `2xl:` | 96rem / 1536px | 1 |
| `max-md:` | < 768px | 2 |
| `max-sm:` | < 640px | 1 |

**Separate JS breakpoint** (must be kept in sync manually): `src/hooks/use-mobile.tsx` — `const MOBILE_BREAKPOINT = 768;`, `useIsMobile()` matches `(max-width: 767px)` via `matchMedia` + `window.innerWidth`, returns `!!isMobile` (so **`false` during SSR and first paint**, `true` only after the effect runs). Consumed by `sidebar.tsx` to switch the sidebar into Sheet mode.

---

## 6. `src/components/ui/*` — shadcn primitives present

47 files:

`accordion`, `alert-dialog`, `alert`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button-variants`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hover-card`, `input-otp`, `input`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toggle-group`, `toggle-variants`, `toggle`, `tooltip`.

**Absent** from `components/ui/`: `toast`/`toaster`/`use-toast` (replaced by `sonner`), `data-table`, `date-picker`, `combobox`, `stepper`, `timeline`, `kbd`, `spinner`.

Note the **`new-york` / pre-Tailwind-v4 shadcn generation**: components use `React.forwardRef` + `displayName`, **not** the newer `data-slot` + plain-function style. `CLAUDE.md` forbids hand-editing this directory (`bunx shadcn@latest add <component>` only).

### 6a. `badge.tsx`

```ts
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", { … })
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
function Badge({ className, variant, ...props }: BadgeProps)
export { Badge }
```
- Renders a **`<div>`**, not a `<span>`. No `asChild`. Not forwardRef'd.
- `badgeVariants` is **not exported** (unlike upstream shadcn).
- Variants — `variant`: `default` (`bg-primary text-primary-foreground shadow hover:bg-primary/80`), `secondary`, `destructive`, `outline` (`text-foreground` only — inherits the base `border`). Default `default`. **No `size` variant.**
- Shape is `rounded-md`, i.e. **not** a pill.

### 6b. `table.tsx`

Exports: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`. All `forwardRef`, all take plain HTML attribute props. **No variants (no cva).**

- `Table` — wraps the `<table>` in `<div className="relative w-full overflow-auto">`; the `<table>` gets `w-full caption-bottom text-sm`. The wrapper div is **not customisable** (no `wrapperClassName` prop), which matters for sticky headers.
- `TableHeader` → `<thead>` `[&_tr]:border-b`
- `TableBody` → `<tbody>` `[&_tr:last-child]:border-0`
- `TableFooter` → `<tfoot>` `border-t bg-muted/50 font-medium [&>tr]:last:border-b-0`
- `TableRow` → `<tr>` `border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted`
- `TableHead` → `<th>` `h-10 px-2 text-left align-middle font-medium text-muted-foreground` + checkbox-cell tweaks
- `TableCell` → `<td>` `p-2 align-middle` + checkbox-cell tweaks
- `TableCaption` → `<caption>` `mt-4 text-sm text-muted-foreground`

Padding is the **compact `px-2`/`p-2`** variant (not `p-4`). Numerals are tabular globally via the `@layer base` `table` rule.

### 6c. `card.tsx`

Exports: `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent`. All `forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>`. **No variants.**

- `Card`: `rounded-xl border bg-card text-card-foreground shadow`
- `CardHeader`: `flex flex-col space-y-1.5 p-6`
- `CardTitle`: **`<div>`, not `<h3>`** — `font-semibold leading-none tracking-tight` (no `text-2xl`)
- `CardDescription`: **`<div>`, not `<p>`** — `text-sm text-muted-foreground`
- `CardContent`: `p-6 pt-0`
- `CardFooter`: `flex items-center p-6 pt-0`

There is **no `CardAction`** slot (newer shadcn has one). Header/content padding is `p-6`, which `MetricCard` overrides to `p-5`.

### 6d. `button.tsx` + `button-variants.ts`

`buttonVariants` lives in a **separate file** (`src/components/ui/button-variants.ts`) so `button.tsx` exports only components — deliberate, for React Fast Refresh (`react-refresh/only-export-components`). Import it from `@/components/ui/button-variants`, **not** from `@/components/ui/button`.

```ts
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(...)
export { Button }
```

Base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`

| `variant` | classes |
|---|---|
| `default` *(default)* | `bg-primary text-primary-foreground shadow hover:bg-primary/90` |
| `destructive` | `bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90` |
| `outline` | `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground` |
| `secondary` | `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80` |
| `ghost` | `hover:bg-accent hover:text-accent-foreground` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| `size` | classes |
|---|---|
| `default` *(default)* | `h-9 px-4 py-2` |
| `sm` | `h-8 rounded-md px-3 text-xs` |
| `lg` | `h-10 rounded-md px-8` |
| `icon` | `h-9 w-9` |

Note `focus-visible:ring-1` (not `ring-2`), and there is **no `ring-offset`** on the button. `[&_svg]:size-4` forces every icon child to 16px.

### 6e. `dialog.tsx`

Exports: `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`. Radix `@radix-ui/react-dialog`. `"use client"` header. **No cva variants anywhere** — `DialogContent` has no `size` prop.

- `DialogOverlay`: `fixed inset-0 z-50 bg-black/80` + fade animations. **`bg-black/80` is a hard-coded colour inside the primitive** (not a token).
- `DialogContent`: `fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 … sm:rounded-lg`. Self-renders `DialogPortal` + `DialogOverlay` + a fixed close `X` button at `absolute right-4 top-4` with `<span className="sr-only">Close</span>`. The close button is **not suppressible** via prop (only via `[&>button]:hidden` on className, which is what `sidebar.tsx` does to the Sheet equivalent).
- `DialogHeader` / `DialogFooter` are plain function components (no ref): `flex flex-col space-y-1.5 text-center sm:text-left` and `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2`.
- `DialogTitle`: `text-lg font-semibold leading-none tracking-tight`. `DialogDescription`: `text-sm text-muted-foreground`.

Width is `max-w-lg` unless overridden by className.

### 6f. `sheet.tsx`

Built on `@radix-ui/react-dialog` aliased as `SheetPrimitive`. `"use client"`. Exports: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`.

**This is the one dialog-family primitive with a cva variant.** `sheetVariants` (not exported):

base: `fixed z-50 gap-4 overscroll-contain bg-background p-6 shadow-lg transition-transform ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:duration-0 motion-reduce:transition-none`

| `side` | classes |
|---|---|
| `top` | `inset-x-0 top-0 border-b` + slide-from-top |
| `bottom` | `inset-x-0 bottom-0 border-t` + slide-from-bottom |
| `left` | `inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm` + slide-from-left |
| `right` *(default)* | `inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm` + slide-from-right |

```ts
interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, VariantProps<typeof sheetVariants> {}
```
`SheetContent` renders its own portal + overlay (`bg-black/80`, again hard-coded) and a fixed `X` close button at `right-4 top-4`. Left/right sheets are `w-3/4` capped at `sm:max-w-sm` (24rem) — **no width prop**; override with className.

`SheetHeader`: `flex flex-col space-y-2 text-center sm:text-left`. `SheetFooter`: same shape as `DialogFooter`. `SheetTitle`: `text-lg font-semibold text-foreground`.

### 6g. `drawer.tsx`

Built on **`vaul`** (`Drawer as DrawerPrimitive`). Exports: `Drawer`, `DrawerPortal`, `DrawerOverlay`, `DrawerTrigger`, `DrawerClose`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`. **No cva variants.**

- `Drawer` wraps `DrawerPrimitive.Root` with `shouldScaleBackground = true` by default; otherwise passes all vaul Root props through (so `direction`, `open`, `onOpenChange`, `snapPoints` are available from vaul, not re-declared here).
- `DrawerOverlay`: `fixed inset-0 z-50 bg-black/80` (hard-coded again).
- `DrawerContent`: `fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background` — **bottom-anchored only** in the styling; renders the grab handle `<div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />` before children. No close button.
- `DrawerHeader`: `grid gap-1.5 p-4 text-center sm:text-left`. `DrawerFooter`: `mt-auto flex flex-col gap-2 p-4`.
- `DrawerTitle`: `text-lg font-semibold leading-none tracking-tight`. `DrawerDescription`: `text-sm text-muted-foreground`.

Note `rounded-t-[10px]` is an arbitrary value, not `--radius`-derived. **Nothing in the app currently imports `drawer` for the mobile sidebar** — `sidebar.tsx` uses `Sheet`.

### 6h. `tabs.tsx`

Radix `@radix-ui/react-tabs`. Exports: `Tabs` (= `TabsPrimitive.Root`, no wrapper), `TabsList`, `TabsTrigger`, `TabsContent`. **No cva variants** — one visual style only (the "segmented control on muted background" look).

- `TabsList`: `inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground`
- `TabsTrigger`: `inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow`
- `TabsContent`: `mt-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

There is **no underline/line tab variant** — building one means adding variants or class overrides.

### 6i. `tooltip.tsx`

Radix `@radix-ui/react-tooltip`. `"use client"`. Exports: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`. **No variants.**

- `TooltipContent` is the only styled part: `forwardRef`, prop `sideOffset` defaults to `4`, renders inside `TooltipPrimitive.Portal`. Classes: `z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground` + `animate-in fade-in-0 zoom-in-95`, `data-[state=closed]:*`, per-side `slide-in-from-*`, and `origin-(--radix-tooltip-content-transform-origin)`.
- **Inverted styling** (`bg-primary` / `text-primary-foreground`), not `bg-popover`. **No arrow component is exported.**
- A `TooltipProvider` must be mounted. The only one currently mounted app-wide is inside `SidebarProvider` (with `delayDuration={0}`) — see §6k. `__root.tsx` does not mount a separate `TooltipProvider`, so tooltip availability outside the sidebar is incidentally inherited from `SidebarProvider`.

### 6j. `skeleton.tsx`

```ts
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>)
export { Skeleton }
```
One line of styling: `animate-pulse rounded-md bg-primary/10`. **Not forwardRef'd. No variants, no size props, no `shimmer` alternative.** Note `bg-primary/10` means the skeleton tint tracks primary, which in dark mode is a bright violet at 10%.

### 6k. `sidebar.tsx`

The largest primitive. Constants (module-private): `SIDEBAR_COOKIE_NAME = "sidebar_state"`, `SIDEBAR_COOKIE_MAX_AGE = 604800` (7d), `SIDEBAR_WIDTH = "16rem"`, `SIDEBAR_WIDTH_MOBILE = "18rem"`, `SIDEBAR_WIDTH_ICON = "3rem"`, `SIDEBAR_KEYBOARD_SHORTCUT = "b"` (⌘B / Ctrl+B).

**Exports (23):** `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupAction`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarInput`, `SidebarInset`, `SidebarMenu`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`, `SidebarProvider`, `SidebarRail`, `SidebarSeparator`, `SidebarTrigger`.

> **`useSidebar` is defined (line 40) but NOT exported.** Confirmed against the export block. Any new component that needs sidebar state (`state`, `open`, `isMobile`, `toggleSidebar`) cannot get it today without editing this file — which `CLAUDE.md` forbids hand-editing. This is a real constraint for the revision project.

**`SidebarProvider`** — `forwardRef<HTMLDivElement, React.ComponentProps<"div"> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }>`. `defaultOpen = true`. Controlled/uncontrolled hybrid. Writes `document.cookie` `sidebar_state=<bool>` on every change. Registers the ⌘/Ctrl+B keydown listener. Renders a `TooltipProvider delayDuration={0}` around a div carrying inline `--sidebar-width: 16rem` and `--sidebar-width-icon: 3rem`, class `group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar`. Context type: `{ state: "expanded"|"collapsed"; open; setOpen; openMobile; setOpenMobile; isMobile; toggleSidebar }`.

**`Sidebar`** — `React.ComponentProps<"div"> & { side?: "left"|"right"; variant?: "sidebar"|"floating"|"inset"; collapsible?: "offcanvas"|"icon"|"none" }`. Defaults `side="left"`, `variant="sidebar"`, `collapsible="offcanvas"`. Three render paths:
- `collapsible="none"` → static `flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground`
- `isMobile` → renders a `Sheet`/`SheetContent` with `--sidebar-width: 18rem`, `p-0`, `[&>button]:hidden` (kills the Sheet close X), and an `sr-only` `SheetHeader`/`SheetTitle`/`SheetDescription` for a11y
- desktop → a `group peer` wrapper with `data-state`, `data-collapsible`, `data-variant`, `data-side` attributes, a spacer div and a `fixed inset-y-0 z-10 h-svh` panel; `floating`/`inset` add `p-2` and rounded/bordered inner surface

**Variants recap:** `side` = left | right. `variant` = sidebar | floating | inset. `collapsible` = offcanvas | icon | none.

**`SidebarMenuButton`** — `React.ComponentProps<"button"> & { asChild?: boolean; isActive?: boolean; tooltip?: string | React.ComponentProps<typeof TooltipContent> } & VariantProps<typeof sidebarMenuButtonVariants>`. `sidebarMenuButtonVariants` (**not exported**):
- `variant`: `default` (`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`), `outline` (`bg-background shadow-[0_0_0_1px_var(--sidebar-border)] …`)
- `size`: `default` (`h-8 text-sm`), `sm` (`h-7 text-xs`), `lg` (`h-12 text-sm group-data-[collapsible=icon]:!p-0`)
- Auto-wraps in a `Tooltip` with `side="right" align="center" hidden={state !== "collapsed" || isMobile}` when `tooltip` is given.

**`SidebarMenuSubButton`** — renders an `<a>`; props `{ asChild?: boolean; size?: "sm"|"md"; isActive?: boolean }`, default `size="md"`.
**`SidebarMenuAction`** — `{ asChild?: boolean; showOnHover?: boolean }`.
**`SidebarMenuSkeleton`** — `{ showIcon?: boolean }` (default `false`); computes a **random** width 50–90% in a `useMemo` and sets `--skeleton-width` inline. *(Random-in-render → this is an SSR hydration-mismatch hazard; noted, not verified as failing.)*
**`SidebarGroupLabel`**, **`SidebarGroupAction`** — `{ asChild?: boolean }`.
**`SidebarTrigger`** — `React.ComponentProps<typeof Button>`; ghost/icon Button, `h-7 w-7`, `PanelLeft` icon, `sr-only` "Toggle Sidebar", composes user `onClick` before `toggleSidebar()`.
**`SidebarRail`** — a `<button tabIndex={-1}>` drag-affordance strip.
**`SidebarInset`** — renders `<main>` with `relative flex w-full flex-1 flex-col bg-background` plus inset-variant margins. **Currently unused**: `__root.tsx` hand-rolls its own `<main id="main-content">` layout instead.

App usage: `src/components/app-sidebar.tsx` renders `<Sidebar collapsible="icon">` (default `side="left"`, `variant="sidebar"`).

---

## 7. The six existing shared components

These are the precursors the revision project will formalise. All live directly in `src/components/`.

### 7.1 `src/components/status-badge.tsx` — `StatusBadge`

```ts
export function StatusBadge({ value, className, label }: {
  value: string | null | undefined;
  className?: string;
  label?: string;
})
```

**Most-used shared component: 25 app files + 1 test import it.**

Behaviour:
1. `const normalizedValue = value?.trim() || "Unknown"` — null, undefined, `""`, and whitespace-only all collapse to the literal string `"Unknown"`.
2. Looks up `STATUS_STYLES[normalizedValue]`; falls back to `"bg-muted text-muted-foreground border-border"` on miss. **Lookup is case-sensitive and uses the raw snake_case key** — `"Won"` would miss and fall back.
3. Renders a `<span>` (not the shadcn `Badge` — **this component does not use `Badge` at all**) with:
   `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap capitalize` + the status style + `className`.
4. Text is `label ?? normalizedValue.replace(/_/g, " ")` — underscores become spaces, and `capitalize` title-cases each word in CSS. Passing `label` bypasses the underscore replacement but **not** the `capitalize` class.

There is an in-file comment explaining `whitespace-nowrap` was added because a two-word status ("Active Client") wrapped inside its own pill in tight rows.

`STATUS_STYLES` is a module-private `Record<string, string>` with **34 keys**, grouped by comment:

| Group | Keys → style |
|---|---|
| leads | `new` → info/10; `qualified` → primary/10; `replied` → `bg-accent text-accent-foreground border-border`; `quoted` → warning/15; `approved` → success/15; `won` → success/20; `lost` → muted |
| quotes | `draft` → muted; `pending_approval` → warning/15; `sent` → info/15; `viewed` → primary/10; `accepted` → success/20; `rejected` → destructive/10 |
| tasks | `open` → info/10; `in_progress` → warning/15; `done` → success/15 |
| approvals | `pending` → warning/15; `escalated` → destructive/15 |
| agent runs | `running` → info/10; `ready_for_review` → info/10; `completed` → success/15; `failed` → destructive/15; `waiting_approval` → warning/15; `idle` → muted |
| priority + misc | `high` → destructive/10; `medium` → warning/15; `low` → muted; `active` → success/15; `paused` → muted |

Every entry is a `bg-<token>/N text-<token> border-<token>/N` triple — **fully tokenised, zero hard-coded colours**. Note the warning entries use `text-warning-foreground` (dark brown) rather than `text-warning`, because `--warning` is a light amber unreadable on a light tint.

`STATUS_STYLES` is **not exported** — a consumer cannot enumerate known statuses, and `value` is typed as a bare `string`, so there is no type-level union of valid statuses.

### 7.2 `src/components/metric-card.tsx` — `MetricCard`

```ts
interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number;
  icon?: LucideIcon;   // destructured as `icon: Icon`
}
export function MetricCard({ label, value, hint, delta, icon: Icon }: MetricCardProps)
```
*(`MetricCardProps` is declared but **not exported**.)*

Only **one importer**: `src/components/sales/metric-strip.tsx`.

Behaviour:
- `const up = (delta ?? 0) >= 0` — **`delta === 0` counts as "up"** (green, rendered as `+0%`).
- Renders `<Card><CardContent className="p-5">` (overriding the `p-6` default) containing a `flex items-start justify-between`.
- Left column (`min-w-0`):
  - `label` → `<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">`
  - `value` → `<p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">`
  - The delta/hint row renders only if `hint || typeof delta === "number"`. Inside, the delta span renders only when `typeof delta === "number"`, styled `text-success` when `up` else `text-destructive`, prefixed by `<ArrowUpRight className="h-3 w-3" />` or `<ArrowDownRight …/>`, then `{up ? "+" : ""}{delta}%`. Negative deltas already carry their own minus sign. **The `%` suffix is hard-coded** — `delta` cannot express an absolute change.
  - `hint` renders as a bare `<span>` after the delta, in the shared `text-xs text-muted-foreground` row.
- Right column: if `Icon` given, a `flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary` tile holding `<Icon className="h-4 w-4" />`.

No `href`/link support, no loading state, no `onClick`, no trend sparkline, no variant/tone prop.

### 7.3 `src/components/page-header.tsx` — `PageHeader`

```ts
interface PageHeaderProps { title: string; description?: string; actions?: ReactNode }
export function PageHeader({ title, description, actions }: PageHeaderProps)
```
*(`PageHeaderProps` not exported.)*

**15 route files + 1 test import it** — the second-most-used shared component.

Behaviour:
- Outer: `flex min-w-0 flex-col gap-1 border-b border-border bg-background/60 px-6 py-5 backdrop-blur md:flex-row md:items-center md:justify-between` — stacks below `md`, becomes a row at ≥768px. Translucent + `backdrop-blur`, but **not `sticky`** itself.
- Title: `<h1 className="text-xl font-semibold tracking-tight text-foreground">` — always an `h1`, not configurable.
- Description (optional): `<p className="mt-1 break-words text-sm text-muted-foreground">`.
- Actions (optional): `<div className="mt-3 flex flex-wrap items-center gap-2 md:mt-0 md:justify-end">`.

No breadcrumb slot, no back-button, no `className` passthrough, no icon/avatar slot, no tabs slot.

### 7.4 `src/components/empty-state.tsx` — `EmptyState`

```ts
export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
})
```
No exported props interface (inline type).

Only **two importers**: `src/components/pipeline/pipeline-board.tsx`, `src/components/reports/report-charts.tsx`.

Behaviour:
- Container: `flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/20 p-10 text-center` — dashed border, tinted fill.
- Icon defaults to lucide `Inbox`; sits in a `flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground` circle, rendered `h-5 w-5`.
- `title` → `<p className="text-sm font-medium">` (a `<p>`, not a heading — **no semantic heading**).
- `description` (optional) → `<p className="mt-1 text-xs text-muted-foreground">`.
- `action` rendered raw at the bottom, unwrapped.

No `className` prop, no size variant, no error/filtered-empty distinction.

### 7.5 `src/components/summary-row.tsx` — `SummaryRow`

```ts
export function SummaryRow({ label, value }: { label: string; value: ReactNode })
```
No exported interface. **Two importers**: `src/routes/accounts.$id.tsx`, `src/routes/campaigns.$id.tsx`.

Single element:
```jsx
<div className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
  <span className="shrink-0 text-muted-foreground">{label}</span>
  <span className="min-w-0 text-right font-medium break-words text-foreground">{value}</span>
</div>
```

The file carries a long JSDoc explaining the design decision: flex items default to `min-width: auto`, so both spans were content-sized and the **label** was the one that wrapped when a long value pushed. Fix: label gets `shrink-0` (pinned), value gets `min-w-0` (shrinks) + `break-words` (long domains wrap inside the row rather than widening the card).

No `className`, no size/density variant, no copy-to-clipboard, no tooltip on truncation. `value` is `ReactNode`, so badges/links can be passed in.

### 7.6 `src/components/list-pagination.tsx` — `ListPagination`

```ts
export interface ListPaginationProps {   // ← the only one of the six with an EXPORTED props interface
  page: number;      // 1-indexed
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}
export function ListPagination({ page, limit, total, onPageChange }: ListPaginationProps)
```

**Six route importers**: `accounts.tsx`, `campaigns.tsx`, `clients.tsx`, `job-sheets.tsx`, `leads.tsx`, `quotes.tsx`.

Derived values:
- `totalPages = Math.max(1, Math.ceil(total / limit))` — never 0.
- `start = total === 0 ? 0 : (page - 1) * limit + 1`
- `end = Math.min(page * limit, total)`
- With `total === 0` the label reads `0-0 of 0` and both buttons are disabled.

Markup:
- `<nav aria-label="List pagination" className="flex items-center justify-end gap-2 py-1">` — right-aligned.
- Counter `<p aria-live="polite" className="min-w-28 text-right text-xs tabular-nums text-muted-foreground">{start}-{end} of {total}</p>` — the `aria-live` announces page changes to screen readers; `min-w-28` stops the row jittering as digit counts change.
- Two `<Button type="button" variant="outline" size="icon" className="h-8 w-8">` with `aria-label="Previous page"` / `"Next page"`, holding `<ChevronLeft/>` / `<ChevronRight/>` at `h-4 w-4`. Note `size="icon"` is `h-9 w-9`, overridden to `h-8 w-8`.
- Disabled logic: prev when `page <= 1`, next when `page >= totalPages`. Handlers call `onPageChange(page - 1)` / `onPageChange(page + 1)` with **no clamping** (relies on the disabled state).

**It is fully controlled** — it holds no state, does not read/write the URL, and there is **no page-size selector, no numbered page links, and no jump-to-first/last**. It does **not** use `src/components/ui/pagination.tsx` (which exists but is unused by this component).

### Cross-cutting gaps in the six

- Only `ListPaginationProps` is exported; `MetricCardProps` and `PageHeaderProps` are declared-but-private; `StatusBadge`, `EmptyState`, `SummaryRow` use inline prop types.
- Only `StatusBadge` accepts a `className` passthrough. The other five have **no `className` escape hatch**.
- None are `forwardRef`.
- None have loading/skeleton states.
- There is **no barrel/index file** in `src/components/` — every import is a direct deep path (`@/components/status-badge`).

---

## 8. Hard-coded colours outside `src/components/ui`

Grepped `src/**/*.{ts,tsx,css}` for palette-named Tailwind utilities, `white`/`black` utilities, hex literals, and `rgb()/rgba()/hsl()` literals, excluding `src/components/ui/`.

**Zero `rgb()`/`rgba()`/`hsl()` literals** found anywhere outside `components/ui`.

### Worst offenders, ranked

| # | File | Count | What |
|---|---|---|---|
| 1 | `src/components/quotes/quote-pdf-preview.tsx` | **18** | 17 palette classes + 1 `bg-white`. Lines 24 (`border-amber-300 bg-amber-50 text-amber-950`), 30 (`text-amber-800`), 43 (`bg-white text-slate-950`), 44 (`border-slate-200`), 45 (`text-blue-600`), 47, 48, 61 (`text-slate-600` ×3), 57, 68, 85, 105, 114 (`text-slate-500` ×5), 73 (`border-slate-200`), 82 (`border-slate-100`). **Arguably deliberate** — this is a print/PDF facsimile that must stay light-on-white regardless of theme — but it is the largest single concentration and hard-codes a whole grey ramp. |
| 2 | `src/lib/error-page.ts` | **8 hex values** | `#fafafa`, `#111` ×2, `#4b5563`, `#fff` ×2, `#d1d5db` in an inline `<style>` block inside `renderErrorPage()` (lines 9–16). A standalone SSR fallback HTML string with no access to the app stylesheet — hardest to fix, and lowest value to fix. |
| 3 | `src/components/notification-bell.tsx` | **8** | Line 29 `text-amber-500 bg-amber-500`, line 30 `text-blue-500 bg-blue-500`, line 31 `text-red-500 bg-red-500`, line 32 `text-slate-500 bg-slate-500`. **This is the clearest bug-shaped offender**: it is a severity/type→colour map that duplicates exactly what `--warning` / `--info` / `--destructive` / `--muted-foreground` already express, and it will not adapt to dark mode. Prime candidate for the shared status/tone system. |
| 4 | `src/components/admin/user-role-dialog.tsx` | **7** | Line 102 `border-emerald-500 bg-emerald-500`, 103 `text-emerald-700`, 114 `border-amber-500 bg-amber-500`, 115 `text-amber-700`, plus 57 `bg-black/40`. Same emerald=success / amber=warning duplication. |
| 5 | `src/components/admin/access-request-queue.tsx` | 2 | Line 125 `border-amber-500 text-amber-700` |
| 5= | `src/routes/leads.$id.tsx` | 2 | Line 525 `bg-amber-500 text-amber-700` |
| 5= | `src/routes/quotes.$id_.pdf.tsx` | 2 | Line 23, two `bg-white` (print route — likely intentional) |
| 8 | `src/components/admin/invite-users-dialog.tsx` | 2 | Line 262 `text-emerald-700`, line 104 `bg-black/40` |
| 9 | `src/components/job-sheets/billing-portions-table.tsx` | 1 | Line 49 `text-emerald-600` |
| 10 | `bg-black/40` overlay cluster (5 files, 1 each) | 5 | `admin/invite-users-dialog.tsx:104`, `admin/organization-unit-dialog.tsx:120`, `admin/permission-override-dialog.tsx:82`, `admin/user-lifecycle-dialog.tsx:110`, `admin/user-role-dialog.tsx:57`. Five hand-rolled modal overlays that duplicate `DialogOverlay`'s `bg-black/80` instead of using the `Dialog` primitive — a **structural** duplication, not just a colour one. |

### Recurring substitutions the revision should make

| Hard-coded | Token equivalent already available |
|---|---|
| `emerald-500/600/700` | `--success` / `text-success` |
| `amber-300/500/700/800/950`, `amber-50` | `--warning` / `text-warning-foreground`, `bg-warning/15` |
| `blue-500/600` | `--info` / `text-info` |
| `red-500` | `--destructive` / `text-destructive` |
| `slate-100/200/500/600/950` | `--border`, `--muted-foreground`, `--foreground` |
| `bg-white` | `bg-card` / `bg-background` (except in the print/PDF surfaces, where white is intentional) |
| `bg-black/40` overlays | the `Dialog` primitive's own `DialogOverlay` |

`src/components/reports/report-charts.tsx` is clean and is the **model to follow** — it reads `var(--color-primary)`, `var(--color-success)`, `var(--color-info)`, `var(--color-border)`, `var(--color-muted-foreground)`, `var(--color-popover)` directly for Recharts `stroke`/`fill` props. `status-badge.tsx` is the other clean model.

Inside `src/components/ui/` (excluded from the ranking, but worth flagging since `CLAUDE.md` forbids hand-editing that directory): `dialog.tsx`, `sheet.tsx`, and `drawer.tsx` each hard-code `bg-black/80` for their overlays.