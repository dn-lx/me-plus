---
name: frontend-verification
description: Verify material frontend changes in a real rendered runtime, including workflows, responsive behavior, console/network health and failure states.
---

# Frontend Verification

Use for material frontend behavior, layout, interaction, responsive, navigation, form, print or browser-runtime changes.

This skill owns **rendered runtime evidence**. It does not choose visual direction; use the Design Stack for that. Accessibility/visual-regression remains a specialist verification layer.

## Focused visual-defect fast path

For a specific defect such as dark text on a dark surface, misalignment, clipping, overflow, or one broken responsive state, do **not** load the full design stack by default.

Use this loop:
1. reproduce the exact defect at the reported viewport/theme/state,
2. localize the smallest affected DOM/component/style path,
3. inspect computed styles and bounding boxes for the affected elements,
4. fix the root token/layout/style cause rather than nudging unrelated pixels,
5. rerender the same viewport/theme/state,
6. run the visual-sanity checks below,
7. broaden to adjacent breakpoints/states only after the original defect is clean.

If two repair attempts reproduce the same defect, stop blind CSS tweaking and inspect inheritance, layout container constraints, theme tokens, stacking context or component composition.

## Visual-sanity contract

For affected UI, explicitly inspect:
- **contrast:** text/icons/borders against the effective surface in every affected theme and state; use automated accessibility/contrast checks when configured,
- **alignment:** repeated cards, labels, controls, columns and baselines; use `getBoundingClientRect()`/Playwright bounding boxes when a few-pixel drift is ambiguous,
- **spacing:** reuse the project spacing scale/tokens; investigate isolated one-off gaps,
- **overflow:** no unintended horizontal scrolling at target viewports,
- **clipping:** labels/buttons/headings are not cut off unless truncation is intentional,
- **overlap/stacking:** no accidental collisions, hidden controls or z-index obstruction,
- **content resilience:** realistic long/localized text does not break the changed layout,
- **localization correctness when relevant:** no missing/raw translation keys; fallback works; dates, times, numbers and currencies use the intended locale/timezone policy; supported RTL layouts are checked where applicable,
- **semantic coherence:** labels, icons, visual hierarchy and disabled/error/success states match what the control actually does; repeated actions use consistent variants,
- **theme/state matrix:** check affected light/dark/high-contrast themes plus hover/focus/disabled/error/open states when they exist.

Use `docs/templates/FRONTEND-VISUAL-QA-TEMPLATE.md` when durable evidence is useful. For Playwright projects, `docs/templates/PLAYWRIGHT-VISUAL-SANITY.md` contains targeted overflow, clipping, geometry, contrast and screenshot patterns.

## Required evidence for material UI changes

Code inspection alone is not enough. Verify the changed behavior in a real browser or browser automation environment.

At minimum:
1. load the changed surface from the same commit being reviewed,
2. complete the primary user flow,
3. verify one ordinary desktop viewport and one narrow mobile viewport unless the product defines another matrix,
4. inspect browser console for new errors/warnings caused by the change,
5. inspect failed network requests relevant to the flow,
6. exercise loading, empty, error, disabled or validation states that the change touches,
7. capture targeted screenshots or Playwright evidence for meaningful visual/layout changes and visually inspect them; generating a screenshot without inspecting it is not verification.

If the project has critical tablet/iOS/Safari/print behavior, include the documented project-specific device/browser check.

Keep the evidence set small: normally one desktop and one narrow-mobile screenshot plus only the states needed to prove the change. Do not generate a large screenshot matrix unless the product risk justifies it.

## Before/after comparison

For regressions or redesigns, capture the current behavior before editing when practical. After implementation, compare:
- functionality,
- hierarchy/layout,
- responsive behavior,
- focus/keyboard behavior,
- runtime errors,
- network behavior,
- user-visible error handling.

## Specialist layers

Load `accessibility-visual-regression` when accessibility or stable screenshot baselines matter.
Load `performance-budget` when rendering, assets, bundle/runtime work or network behavior can materially affect performance.

## Failure handling

A frontend task is not fully verified when:
- the page was not rendered,
- only source code was inspected,
- console/network failures were ignored,
- the tested environment differs materially from the changed deployment,
- screenshots were updated blindly.

If browser verification cannot be run, report that limitation explicitly in the PR/evidence packet.

Stop when the requested behavior and visual-sanity contract are clean. Do not continue opportunistic redesign/polish beyond the task unless a broader design issue is explicitly in scope.
