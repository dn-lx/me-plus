# Playwright Visual-Sanity Patterns

Use these as targeted patterns in a consuming frontend project. Adapt selectors/routes to the real UI; do not paste every check into every test.

## Horizontal overflow

```js
const overflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
```

## Alignment / geometry

When elements are intended to align, compare their real boxes instead of guessing from CSS text.

```js
const a = await page.getByTestId('label-a').boundingBox()
const b = await page.getByTestId('label-b').boundingBox()
expect(a).not.toBeNull()
expect(b).not.toBeNull()
expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1)
```

Use a tolerance justified by the design. Do not enforce alignment between elements that are intentionally offset.

## Clipping

For controls/headings that must show their full content:

```js
const clipped = await page.getByRole('button', { name: 'Continue' }).evaluate(el =>
  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
)
expect(clipped).toBe(false)
```

Do not use this assertion on intentional ellipsis/truncation.

## Contrast / accessibility

If the project already uses `@axe-core/playwright`, include the color-contrast rule in the affected theme/state scan rather than inventing a second contrast engine. Run the same affected surface in dark/light variants when theme tokens changed.

## Screenshot evidence

```js
await expect(page).toHaveScreenshot('changed-surface-desktop.png', {
  animations: 'disabled',
})
```

Prefer a few stable screenshots for critical states. Always inspect a failed/new baseline; never update it blindly.

## Visual repair evidence

For a focused bug, keep evidence small:
1. failing screenshot or reproduction,
2. computed style/bounding-box evidence for the suspected root cause,
3. fixed screenshot at the same viewport/theme/state,
4. one adjacent responsive/theme check where risk justifies it.

The goal is to prove the defect is fixed without loading or snapshotting the entire application.
