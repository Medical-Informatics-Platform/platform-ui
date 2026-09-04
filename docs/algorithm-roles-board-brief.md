# Algorithm setup — mock brief

Build a **standalone mock** of this screen. Do not open, copy, or change any existing frontend. Invent layout, interaction, and copy from this brief only.

**Product:** Medical Informatics Platform (MIP). Clinicians and researchers compose an analysis.

**Job:** Assign each variable in the experiment pool to **outcome (`y`)** or **predictors (`x`)**. As roles change, show which algorithms can run. The user picks one runnable method and continues to parameters.

---

## Context (do not mock these screens)

The pool is already chosen. This screen does not browse datasets or the variable tree.

After this screen: parameter form, then run. Continue stays disabled until a runnable algorithm is selected.

If the pool is empty, this screen is not shown.

---

## Flow

1. Arrive with **Available** variables (the pool).
2. Assign each one to **Outcomes (`y`)** or **Predictors (`x`)**. A variable is in only one role. Removing it returns it to Available.
3. **Matching methods update immediately.** Algorithms have type and count rules for `y` and `x`. Compatible ones are runnable; others remain visible but unavailable, with a reason (wrong type, missing outcome, missing predictors, wrong count).
4. Select a **runnable** method. Show a short description. Continue.

Typical amounts:

- Pool: a handful to a couple of dozen (the full catalog can be much larger).
- Outcome `y`: usually **one**.
- Predictors `x`: zero to many.

Each variable has a **type** (`integer`, `nominal`, `real`, …). Matching depends on type. Show type next to the name.

---

## Three jobs, one screen

Keep these together. Matching should feel like a result of assignment, not a second step.

1. **Assign roles** — unassigned pool vs outcome vs predictors.
2. **Matching methods** — which algorithms the current `y` / `x` unlock (e.g. “4 runnable of 24”).
3. **Selected algorithm** — confirm the pick, short description, continue.

---

## Rules

- Roles are disjoint: never the same variable in both `y` and `x`.
- Assignment is reversible on this screen.
- Click (or keyboard) must work; drag is optional.
- Empty `y` or `x` should invite action, not look broken.
- Unavailable algorithms need a glanceable why.

**Brand colors (only these):** `#2B33E9` dark blue, `#7F9CE8` light blue, `#FFBA08` orange, `#DFEFE4` light green, plus white and near-black text. Meet WCAG AA contrast.

---

## Mock sample data

Use a small fake pool, for example:

- Age — integer  
- Sex — nominal  
- Stenting — nominal  

And a fake catalog of ~8–12 methods in a few categories (regression, classification, descriptive, …), some runnable and some not, depending on the current `y` / `x`.

---

## Deliverable

A complete visual/interactive mock of this one screen (HTML, Figma, or similar — your choice). Not a patch to an existing app. Layout is unconstrained; do not recreate a three-column kanban unless that is the best idea.
