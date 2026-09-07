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
| `--chrome-inline-padding` | `24px` (floor inset, not a measure — see the chrome contract) |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` — the only mono slot. Components use `font-family: var(--font-mono)`; no component writes its own mono stack (four of them used to, so one kind of cell rendered in three faces) |
| `--letter-spacing-config` | `0.015em` |

**Text on a state fill.** `--danger` and `--success` are fill/edge colours, not text colours (white on them is 3.76:1 and 2.54:1): reach for the dark inks `#991b1b` / `#065f46` / `#78350f` as values, not as tokens — no surface puts text on a state fill today.

### Top chrome contract

The header (`.header`, z 10000) and the studio sub-header (`.studio-sub-header`, z 9990, `top: var(--header-height)`) are two rows of one bar: same surface, same bottom border, no `backdrop-filter`, both indented by `--chrome-inline-padding` — one flat inset on every route, so no page can show a bar that starts somewhere else. `--chrome-inline-padding` is a **floor inset, never a measure**: a row that sits above a centred column caps its own content rather than re-indenting the bar. That is `.sub-header-inner` — the sub-header's surface stays full-bleed, but its stepper and CTA are capped and centred on `--studio-inner-max`, so past the cap the CTA ends on the panels' right border and the stepper starts on their left border, while row 1 keeps the flat inset that every route shows.

**The bar is identical on every route.** Three slots — brand, navigation, account — with the same items in the same order everywhere, and **no current-page highlight**: the bar draws hover and the notebook's first-visit edge and nothing else, `aria-current="page"` carries the location for assistive tech, and no CSS in the repo styles it. Which page you are on is never carried by an item appearing, disappearing, or the bar re-indenting. Env-gated and auth-gated items may hide; they may not re-shape the bar, move the nav into another slot, or change the inset. `header.component.spec.ts` asserts this as one signature per route (height, inset, surface, logo, nav labels) plus the flat resting style of the current item.

Two hairlines split the bar, both 22px in `--header-border` and both drawn by a pseudo-element tied to the content it divides: `.header-nav-slot::before` ends the brand, `.header-actions::before` starts "you". A divider is never a border on a control: on the pill recipe (`border-radius: 999px`) a `border-inline-start` follows the curve and draws a sliver, and on the `auto` grid track it draws mid-bar at tablet widths because an `auto` track absorbs leftover space.

The Guide control lives in the bar: the page that owns a tour registers `{ label, start }` with `GuideLauncherService` and the bar draws it under `[data-guide="launcher"]`, the selector the studio tour spotlights. A guide must not float a fixed circle over the bar — the previous one (`right: 84px`, z 10001) sat exactly where the account slot's width lands, and its spotlight ring drew under the bar anyway (overlay z 1502 vs 10000).

`--header-shadow` is a scroll state, not a resting one: `.header` keeps only its hairline at `scrollTop: 0` and gains the shadow through `.header--scrolled` once content has moved under the bar. The bar is also a stacking context (z 10000) above the CDK overlay container (z 1000), so anything the header opens — the account menu — is positioned inside the bar's own box, never in an overlay that would open beneath it.

The bar's height **is** `--header-height`. Never set a height in `header.component.css`; change the token inside a media query in `styles.css` instead. Pages, the sub-header, the pathology banner, the guide spotlight and the scroll util all derive their offsets from that token — a component-local height silently opens a gap of exposed content under the fixed bar.

Both rows own their responsive rules. `styles.css` has no global header overrides (the old `display: none !important` block hid the live `.user-icon` on phones).

Charter brand hex (same blues/orange; extra green `#DFEFE4` for identity, not a default page fill). Semantic: `--covariate-color` `#bba66f`, `--filter-color` `#483300`, `--variable-color` `#ffba08`. `--glass-*` aliases solid card tokens (`--glass-blur: none`); do not reintroduce frost.

Chrome is Angular Material plus these tokens. Component CSS for feature layout; global styles only for app-wide concerns.

## Density and surfaces

Experiment Studio is a dense product workspace, not a marketing site. No landing heroes, no new type pairing, no GSAP/Lenis/custom cursors. Cards only when grouping is real. Use `--studio-card-*` for studio panels.

## Adjacent-panel test

Before shipping a visual change, compare to an unchanged sibling (variables / algorithm / stats). A user should reasonably believe the same team designed both. If not, fix the three largest mismatches (type, spacing, color, radius, shadow, buttons, inputs, states) and look again.
