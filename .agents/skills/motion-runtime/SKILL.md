---
name: motion-runtime
description: Implement purposeful production UI animation with Motion when CSS transitions are insufficient, while preserving accessibility, performance and the project's existing stack.
---

# Motion Runtime

Use only when the task requires material runtime animation, gestures, springs, layout transitions, enter/exit orchestration, drag, scroll-linked effects or similar interaction behavior.

Motion is the current name of the library formerly known as Framer Motion.

Read `docs/DESIGN-STACK.md` first.

## Dependency rule

Before importing Motion:
1. inspect `package.json` and the actual framework,
2. use native CSS transitions/animations when they fully satisfy the interaction,
3. if Motion is justified and missing, install the current reviewed `motion` package in the consuming project,
4. do not add Motion to this generic starter as an application dependency.

For React:

```bash
npm install motion
```

```js
import { motion, AnimatePresence } from "motion/react"
```

Do not introduce the legacy `framer-motion` package into a new project unless compatibility with an existing codebase specifically requires it.

## Implementation rules

- Respect `prefers-reduced-motion`.
- Motion must communicate state, hierarchy, continuity or feedback; decorative motion should be restrained.
- Prefer transform/opacity and compositor-friendly animation paths.
- Avoid repeated animations that block frequent workflows.
- Keep animation interruptible and coherent when users act quickly.
- Verify mobile performance for motion-heavy surfaces.
- Do not mix multiple animation engines in the same component tree without a concrete reason.
- Reuse an existing project animation system before adding a second one.

## Verification

For material motion changes:
- verify normal and reduced-motion behavior,
- check keyboard/focus behavior during transitions,
- test realistic interruption/cancellation,
- inspect relevant responsive states,
- use accessibility/visual-regression guidance for final evidence.

## Scope

Motion implements animation. It does not choose the product's design direction, replace UI/UX Pro Max guidance, or substitute for Impeccable/a11y review.
