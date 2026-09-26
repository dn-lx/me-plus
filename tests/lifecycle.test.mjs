import test from 'node:test'
import assert from 'node:assert/strict'
import { validate, compare, parseVersion } from '../scripts/validate-version.mjs'

test('version syntax and ordering', () => {
  for (const v of ['1.0', 'v1.0.0', '01.0.0', '1.0.0-rc.1', '-1.0.0']) assert.throws(() => parseVersion(v))
  assert.equal(compare('1.10.0', '1.9.9'), 1)
  assert.equal(compare('1.0.0', '1.0.0'), 0)
})

test('release requires an increase and matching dated notes; first adoption works', () => {
  const notes = '## [Unreleased]\n\n## [0.1.0] - 2026-09-21\nInitial release'
  validate('0.1.0', notes, undefined, true)
  validate('0.1.0', notes, '0.1.0', false)
  assert.throws(() => validate('0.1.0', notes, '0.1.0', true))
  assert.throws(() => validate('0.1.0', notes, '0.2.0', false))
  assert.throws(() => validate('0.2.0', notes, '0.1.0', true))
  assert.throws(() => validate('0.1.0', '', undefined, false))
})
