---
name: ui-review
description: After frontend changes in MIP, render the affected page in the Cursor IDE browser MCP (not Playwright), compare it to adjacent existing UI, and fix homogeneity gaps before stopping. Use when CSS, templates, or visual layout changed.
---

# UI review

After implementing any frontend change:

1. Ensure the app is running (e.g. `http://localhost:4200`). Do not start Playwright to serve or open it.
2. Open the affected page with the Cursor IDE browser MCP (`browser_navigate` / `browser_tabs`). Then `browser_lock`.
3. Inspect with `browser_snapshot` and `browser_take_screenshot`. Interact with `browser_click` and related MCP tools. `browser_lock` unlock when done.
4. Compare against adjacent existing UI.

Do not use Playwright, playwright-cli, `npx playwright`, or Puppeteer unless the user explicitly asks.

If this session has no Cursor `browser_*` tools (pi, or MCP missing): do **not** stop. Follow `.pi/skills/ui-review/SKILL.md` — CDP screenshot, then `read` the PNG. Do not use `qwen_eye.sh`.

Check:

- typography
- font weights
- font sizes
- line heights
- spacing rhythm
- component density
- colors
- borders
- radius
- shadows
- icon style
- button treatment
- input treatment
- hover/focus states
- empty/loading/error states
- responsive behavior

Ask:

"Could a user reasonably believe this was designed by the same
team that designed the surrounding interface?"

If no:
- identify the 3 biggest inconsistencies
- fix them
- render again
- repeat

Do not stop after the first implementation.

Use [DESIGN.md](../../../DESIGN.md) and `src/styles.css` `:root`. Do not restyle unrelated surfaces. Tokens over new hex. Sibling panels: variables, algorithm, statistic analysis.
