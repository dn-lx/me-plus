---
name: accessibility-visual-regression
description: Verify meaningful frontend changes with accessibility checks, keyboard/focus testing and stable screenshot-based visual regression where appropriate.
---

# Accessibility and Visual Regression

Use for substantial UI changes, design-system work, critical user journeys, responsive regressions, or frontend release verification.

This complements the Design Stack. It provides **evidence**, not a visual direction.

## Accessibility verification

For web projects, verify at least:
- semantic structure and accessible names,
- keyboard navigation,
- visible focus,
- form labels/errors,
- text/non-text contrast in every affected theme/state; include automated color-contrast rules when the configured scanner supports them,
- dialogs/drawers/popovers focus behavior,
- reduced-motion behavior when motion exists,
- touch target usability on mobile-sized layouts.

For JavaScript/TypeScript projects using Playwright, `@axe-core/playwright` is a strong default candidate for automated WCAG rule checks.

Automated accessibility scans do **not** replace keyboard/manual inspection.

For theme-aware products, a passing light-theme screenshot is not evidence for dark theme. Capture/scan the affected theme variants when color tokens or surfaces changed.

## Visual regression

Use screenshot assertions for stable, important states such as:
- core application shell,
- calculator/checkout/booking state,
- critical responsive breakpoints,
- modal/drawer states,
- branded components,
- print/PDF-sensitive layouts where browser screenshots are meaningful.

Avoid brittle snapshots of:
- timestamps,
- randomized content,
- animation mid-frames,
- personalized/live feeds,
- third-party widgets that change independently.

Stabilize deterministic data before creating a baseline.

## Recommended Playwright pattern

When Playwright is already part of the project:
- use targeted tests around critical components/pages,
- use `expect(page).toHaveScreenshot()` or locator screenshots for visual baselines,
- use deterministic viewport/device settings,
- disable or complete animations before capture where appropriate,
- keep baselines reviewed in Git,
- treat baseline updates as code changes requiring inspection.

Do not regenerate baselines automatically just to make CI green.

## Responsive matrix

Choose the smallest meaningful matrix:
- one ordinary desktop viewport,
- one narrow mobile viewport,
- project-specific tablet/large desktop only where the product genuinely needs them.

Release-critical Safari/iOS behavior may require WebKit emulation and, for platform-specific features such as printing, a real device/device-cloud check.

## Motion

When the selected design direction includes motion:
- test reduced-motion mode,
- ensure state remains understandable without animation,
- avoid screenshot comparisons during unstable animation frames,
- verify frequent interactions are not delayed by motion.

## Failure handling

When a visual test fails:
1. inspect the rendered diff,
2. determine whether it is intended,
3. inspect CSS/layout/state data,
4. fix regressions or explicitly approve the new baseline,
5. never update snapshots blindly.

## CI placement

For mature frontend projects:
- fast accessibility checks can run on ordinary UI PRs,
- targeted visual tests can run on UI PRs,
- broader responsive/browser visual matrices belong in release-level validation if they are expensive.

For early projects, start with a few critical journeys rather than snapshotting every page.
