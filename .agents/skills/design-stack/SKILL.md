---
name: design-stack
description: Route substantial frontend work through Taste Skill, UI/UX Pro Max, Impeccable, Motion, and independent accessibility/visual verification without loading overlapping design systems by default.
---

# Design Stack

Use for substantial frontend creation, redesign, visual polish, UX/system work, or interaction design. Do not load it for backend-only work or trivial copy/layout edits.

Read `docs/DESIGN-STACK.md` before using external design tooling.

## Routing

Use the smallest path that satisfies the task:

- **Taste Skill** — creative direction and anti-generic generation/redesign.
- **UI/UX Pro Max** — structured design intelligence: product/style matching, palettes, typography, UX rules, charts, platform/stack guidance, accessibility heuristics, and design-system generation.
- **Impeccable** — critique, audit, polish, UX hardening, browser iteration, anti-pattern detection, and final refinement.
- **Motion** — runtime animation implementation when CSS alone is insufficient. For React, use the current `motion` package and import from `motion/react`.
- **Accessibility + Visual Regression** — independent verification evidence after material UI changes.

Do not invoke every layer automatically.

For a focused visual defect (contrast, alignment, clipping, overflow, isolated responsive breakage), skip the external design layers unless visual direction is actually changing. Start with `frontend-verification`, the affected component/styles and the current design tokens. This avoids unnecessary redesigns and context/tool cost.

## Existing-product rule

Before changing UI:
1. inspect the current design system, tokens, components, brand assets and real product states,
2. preserve a coherent incumbent system unless the task is explicitly a redesign,
3. treat the user/project brief as higher authority than any third-party skill default,
4. never weaken product truth, accessibility, security, performance or functional constraints for aesthetics,
5. check existing dependencies before adding Motion or another runtime library,
6. prefer semantic foreground/surface/border/accent and spacing/layout tokens over theme-sensitive raw values; when a token pair changes, verify every affected theme/state.

## Third-party rule

The starter does not vendor or auto-install the upstream design packs or Motion runtime. Use the verified source/install guidance in `docs/DESIGN-STACK.md` when a consuming project needs them.

Before relying on an upstream pack/runtime:
- verify source/revision/version,
- review installer hooks/scripts before enabling them,
- keep caches and machine-local settings out of Git,
- pin reviewed versions/revisions when automation supports it,
- do not claim something is installed merely because this template documents it.

## Practical sequences

New or substantially redesigned surface:

```text
product/brand brief
      ↓
Taste Skill
      ↓
UI/UX Pro Max design intelligence
      ↓
implementation
      ↓
Motion only when runtime animation is justified
      ↓
Impeccable critique/polish
      ↓
accessibility + visual-regression evidence
```

Existing UI that mainly needs refinement:

```text
existing design truth
      ↓
UI/UX Pro Max targeted UX/design query when useful
      ↓
Impeccable audit/polish
      ↓
targeted implementation
      ↓
Motion only for material interaction/motion work
      ↓
accessibility + visual-regression evidence
```

## Anti-clutter rule

Do not add another general design catalogue, frontend-design, taste, motion, audit, or polish layer unless a concrete capability gap remains after evaluating this stack. Project-specific brand/design rules belong in the consuming project's design system or project skill.
