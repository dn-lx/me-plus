# Design Stack

The starter uses a small, layered frontend design stack. Each layer has a distinct responsibility; none is loaded automatically for unrelated work.

## 1. Taste Skill — creative direction

Use **Taste Skill** when the main problem is visual direction, anti-generic composition, hierarchy, typography, spacing, density, or a substantial redesign.

Verified upstream:
- Repository: `tasteskill/tasteskill`
- Audited skill path: `skills/taste-skill/SKILL.md`
- Audited revision: `ccc3a2f84f529ee7faafcfe0a71678447675056f`
- License: MIT

Typical project install:

```bash
npx skills add https://github.com/tasteskill/tasteskill --skill "design-taste-frontend"
```

Taste is deliberately opinionated. The project's product brief, incumbent design system, accessibility requirements and explicit user direction override its defaults.

## 2. UI/UX Pro Max — structured design intelligence

Use **UI/UX Pro Max** for structured design-system generation and targeted design/UX intelligence: product/style matching, palettes, typography, UX guidelines, icons, charts, stack-specific implementation guidance, accessibility heuristics and motion/interaction recommendations.

Verified upstream:
- Repository: `nextlevelbuilder/ui-ux-pro-max-skill`
- Audited skill path: `.claude/skills/ui-ux-pro-max/SKILL.md`
- Audited skill revision: `41f8e2fd7f8c568228d0b55186ebe3f7b4007377`
- Audited README revision: `4f0a13340753466048afa98a2b330731d7b0b48f`
- License: MIT

Recommended CLI install for a consuming project/agent host:

```bash
npx ui-ux-pro-max-cli init --ai <host>
```

Claude Code also supports the upstream plugin marketplace flow:

```text
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

The skill uses Python 3 for its local search engine and can persist a generated design system into the project. Do not overwrite an existing persisted design system without explicit authorization.

Use targeted queries rather than loading its entire database into model context.

## 3. Impeccable — critique and polish

Use **Impeccable** for audit, critique, polish, responsive/UX hardening, browser iteration and anti-pattern detection.

Verified upstream:
- Repository: `pbakaus/impeccable`
- Audited upstream skill path: `upstream:.agents/skills/impeccable/SKILL.md`
- Audited revision: `2f12a53b1e5eaa38fd69625926340704a4ced54b`
- License: Apache-2.0

Typical project install:

```bash
npx impeccable install
```

Impeccable can install hooks and local runtime support. Review those hooks before enabling them and keep developer-local caches/configuration out of Git.

## 4. Motion — runtime animation implementation

Framer Motion is now **Motion**. Use it when a consuming JavaScript/React/Vue project needs runtime animation capabilities beyond simple CSS transitions.

Verified upstream:
- Repository: `motiondivision/motion`
- Audited package README revision: `6feda0b1c9b0ebbea04f2218ccc7044b842aff96`
- License revision: `81110442c72270dd317667cc52181522647401f2`
- License: MIT

React / JavaScript install:

```bash
npm install motion
```

React import:

```js
import { motion, AnimatePresence } from "motion/react"
```

Vue uses the separate `motion-v` package.

Motion is a runtime dependency, not a design skill. Do **not** install it in this generic starter or in every generated project. Add it only where the project actually needs material animation, gestures, springs, layout transitions, scroll-linked effects or similar behavior.

For simple hover/focus/press transitions, prefer CSS and avoid unnecessary dependency weight.

See `.agents/skills/motion-runtime/SKILL.md`.

## 5. Frontend Verification — rendered runtime evidence

Use the repository-local `frontend-verification` skill after material UI changes to prove the real rendered workflow: desktop/mobile behavior, relevant loading/error states, console health and failed network requests. Source inspection alone is not final frontend evidence.

## 6. Accessibility + Visual Regression — specialist evidence

The separate `accessibility-visual-regression` skill remains because accessibility and stable screenshot regression are specialist evidence, not design direction. It complements frontend runtime verification rather than replacing it.

## Focused visual-defect fast path

For dark-on-dark text, alignment drift, clipping, overflow, isolated spacing or responsive defects, do not start a redesign workflow. Use the current design tokens + affected component/styles + `frontend-verification`. Inspect the exact rendered state, computed styles and geometry, apply the smallest root-cause fix, then rerender.

Only bring in Taste/UI-UX Pro Max/Impeccable when the problem is genuinely about visual direction, system-wide design consistency or a broader polish pass.

## Selection rule

Use the smallest useful combination:

| Need | Use |
| --- | --- |
| New premium interface / major redesign | Taste Skill + UI/UX Pro Max |
| Structured design system, palettes, typography, UX patterns, charts | UI/UX Pro Max |
| Existing UI critique / polish / hardening | Impeccable |
| Material React/JS animation beyond CSS | Motion |
| Final UI evidence | Frontend Verification + Accessibility/Visual Regression where relevant |
| Tiny copy/spacing/hover fix | Existing project system; no external pack unless needed |

A normal substantial UI flow is:

```text
Taste → UI/UX Pro Max → implementation → Motion if justified → Impeccable → frontend runtime verification → accessibility/visual QA
```

But do not load every layer automatically.

## Removed overlap

The starter intentionally does not maintain or route through:
- the old generic `frontend-design` skill,
- the old `design-taste` skill,
- the old `motion-design` skill,
- the Awesome Design Skills catalogue.

UI/UX Pro Max now covers the structured style/design-intelligence role previously assigned to the Awesome Design catalogue, with substantially broader UX and implementation guidance.

## Supply-chain and update policy

These are external projects and may change. The commands above are for deliberate project bootstrap or dependency installation.

- Do not run unpinned third-party `npx` installers autonomously in sensitive/shared environments.
- Pin a reviewed release/revision where upstream tooling supports it.
- Review new installer hooks/scripts/permissions before major upgrades.
- Keep third-party caches and machine-specific configuration outside Git.
- Keep design-tool upgrades separate from unrelated product work when practical.
- Run normal UI, dependency and security checks after upgrades.
