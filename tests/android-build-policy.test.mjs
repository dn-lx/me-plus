import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Android compilation is read-only and publishes a retained artifact rather than branch commits',()=>{
  const source=readFileSync('.github/workflows/android-local-build.yml','utf8');
  assert.match(source,/contents: read/);assert.match(source,/install --frozen-lockfile/);
  assert.match(source,/actions\/upload-artifact@v4/);assert.match(source,/SOURCE_SHA/);
  assert.doesNotMatch(source,/git (?:push|commit)|--no-frozen-lockfile|contents: write/);
});
