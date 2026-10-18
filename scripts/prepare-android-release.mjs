import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getLatestVerifiedArtifact} from '../apps/web/lib/download-artifact.ts';

// Verify full installer bytes during the build. Runtime rendering consumes only
// this generated descriptor; CDN downloads never need to enter a server bundle.
export function prepareAndroidRelease(root) {
  const artifact = getLatestVerifiedArtifact(
    path.join(root, 'releases/android'),
    path.join(root, 'apps/web/public/downloads'),
  );
  if (!artifact) throw new Error('No verified Android installer available for publication');
  const output = path.join(root, 'apps/web/lib/android-release.generated.json');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const temporary = output + '.preparing';
  fs.writeFileSync(temporary, JSON.stringify({artifact}, null, 2) + '\n');
  fs.renameSync(temporary, output);
  return artifact;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareAndroidRelease(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}
