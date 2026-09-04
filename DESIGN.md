# MIP visual language

Source: MIP Charte graphique (Donovan Studio / CHUV, 2023-10-02) plus the tokens implemented in `src/styles.css` `:root`.

**If charter and code disagree, live CSS tokens win** for app chrome (neutrals, danger/success, studio cards). Charter still wins for logo geometry and approved logo colorways.

Do not invent a new palette, display serif, or animation library. Reuse CSS variables. Match adjacent Experiment Studio panels (variables, algorithm, statistic analysis).

## Brand

- Name: MIP (Medical Informatics Platform)
- Logo type: Mark Pro Bold only (do not substitute, redraw, stretch, skew, rotate, outline, or rearrange)
- Body/UI type: Alaska Regular (`'Alaska Regular', 'Alaska', system-ui, sans-serif`)
- Tabular numbers on data UI (`font-variant-numeric: tabular-nums`)
- Line height ~1.6, letter-spacing ~0.01–0.015em

### Logo variants

| Variant | Use | Min size |
|---|---|---|
| symbol_only | avatar, favicon, icon | 30px / 10mm |
| primary (symbol + “mip”) | web, email, stationery | 50px |
| secondary + baseline | formal comms, signage | 90px |

Keep the protection zone empty. Uncertain: primary for web, symbol-only for icons, secondary for formal, black-on-white for print.

### Approved logo colorways

white on dark blue; blue on light blue; black on white; blue on orange; blue on green; white on black. Reject other logo/background pairings.

## App tokens (`src/styles.css`)

| Token | Value |
|---|---|
| `--primary-color` | `#2b33e9` |
| `--primary-dark` | `#1b21a3` |
| `--primary-light` | `#7f9ce8` |
| `--accent-color` | `#ffba08` |
| `--bg-color` | `#f3f8ff` |
| `--bg-neutral` | `#f8fafc` |
| `--card-bg` / `--studio-card-bg` | `#ffffff` |
| `--text-main` | `#0f172a` |
| `--text-muted` | `#475569` |
| `--danger` | `#ef4444` |
| `--success` | `#10b981` |
| `--border-color` / `--studio-card-border` | `rgba(43, 51, 233, 0.1)` |
| `--studio-card-shadow` | `0 1px 2px rgba(43, 51, 233, 0.06)` |
| `--studio-card-header-bg` | `#f8fbff` |
| `--radius-sm` / `--radius-md` / `--radius-lg` | 4px / 8px / 12px |
| `--header-height` | 64px (56px ≤768px) |
| `--header-surface` / `--header-border` / `--header-shadow` | `--card-bg` / primary 14% / two-layer primary tint |
| `--chrome-inline-padding` | `max(--studio-page-gutter, (100% − --studio-inner-max)/2)` |

### Top chrome contract

The header (`.header`, z 10000) and the studio sub-header (`.studio-sub-header`, z 9990, `top: var(--header-height)`) are two rows of one bar: same surface, same bottom border, no `backdrop-filter`, both indented by `--chrome-inline-padding` so the logo, the stepper and `.studio-inner` share one vertical line.

The bar's height **is** `--header-height`. Never set a height in `header.component.css`; change the token inside a media query in `styles.css` instead. Pages, the sub-header, the pathology banner, the guide spotlight and the scroll util all derive their offsets from that token — a component-local height silently opens a gap of exposed content under the fixed bar.

Both rows own their responsive rules. `styles.css` has no global header overrides (the old `display: none !important` block hid the live `.user-icon` on phones).

Charter brand hex (same blues/orange; extra green `#DFEFE4` for identity, not a default page fill). Semantic: `--covariate-color` `#bba66f`, `--filter-color` `#483300`, `--variable-color` `#ffba08`. `--glass-*` aliases solid card tokens (`--glass-blur: none`); do not reintroduce frost.

Chrome is Angular Material plus these tokens. Component CSS for feature layout; global styles only for app-wide concerns.

## Density and surfaces

Experiment Studio is a dense product workspace, not a marketing site. No landing heroes, no new type pairing, no GSAP/Lenis/custom cursors. Cards only when grouping is real. Use `--studio-card-*` for studio panels.

## Adjacent-panel test

Before shipping a visual change, compare to an unchanged sibling (variables / algorithm / stats). A user should reasonably believe the same team designed both. If not, fix the three largest mismatches (type, spacing, color, radius, shadow, buttons, inputs, states) and look again.
