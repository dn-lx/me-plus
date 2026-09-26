import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function parseVersion(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('VERSION must be stable MAJOR.MINOR.PATCH (no v prefix or leading zeroes)')
  return value.split('.').map(BigInt)
}
export function compare(a, b) {
  const aa = parseVersion(a), bb = parseVersion(b)
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1
  return 0
}
export function validate(version, changelog, previous, release = false) {
  parseVersion(version)
  if (!changelog.includes('## [Unreleased]')) throw new Error('Missing Unreleased changelog section')
  if (previous && compare(version, previous) < 0) throw new Error('Version must never decrease')
  if (release) {
    if (previous && compare(version, previous) <= 0) throw new Error('Release must increase VERSION relative to prod')
    const escaped = version.replaceAll('.', '\\.')
    if (!new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(changelog)) throw new Error('Release needs dated changelog section matching VERSION')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = readFileSync('VERSION', 'utf8').trim()
  const changelog = readFileSync('CHANGELOG.md', 'utf8')
  const base = process.env.VERSION_BASE_SHA
  let previous
  if (base) {
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Expected immutable base commit SHA')
    // Missing VERSION is allowed only for adoption into an unversioned repository.
    const names = execFileSync('git', ['ls-tree', '--name-only', base, '--', 'VERSION'], { encoding: 'utf8' })
    if (names.trim()) previous = execFileSync('git', ['show', `${base}:VERSION`], { encoding: 'utf8' }).trim()
  }
  validate(version, changelog, previous, process.env.VERSION_RELEASE === 'true')
  console.log(`Version valid: ${version}`)
}
