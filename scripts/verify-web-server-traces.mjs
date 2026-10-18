import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web/.next');
const traces = [];
function visit(folder) {
  for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
    const target = path.join(folder, item.name);
    if (item.isDirectory()) visit(target);
    else if (item.name.endsWith('.nft.json')) traces.push(target);
  }
}
visit(root);
if (!traces.length) throw new Error('Next produced no server file traces');
const unexpected = [];
for (const trace of traces) {
  const manifest = JSON.parse(fs.readFileSync(trace, 'utf8'));
  for (const file of manifest.files) {
    const resolved = path.resolve(path.dirname(trace), file).split(path.sep).join('/');
    if (resolved.includes('/public/downloads/') || resolved.includes('/releases/android/parts/')) {
      unexpected.push({trace: path.relative(root, trace), file});
    }
  }
}
if (unexpected.length) {
  console.error(JSON.stringify(unexpected, null, 2));
  throw new Error('Static Android installers or source parts entered a server function trace');
}
console.log(`Verified ${traces.length} Next server traces: no static installer bytes`);
