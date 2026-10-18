import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {assembleAndroidDownloads} from '../scripts/assemble-android-downloads.mjs';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meplus-parts-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const folder = path.join(root,'releases/android/parts/0.4.1');
  fs.mkdirSync(folder,{recursive:true});
  const bytes = [Buffer.from('signed APK first bytes'),Buffer.from('second bytes')];
  const full = Buffer.concat(bytes);
  const m = {version:'0.4.1',filename:'me-plus-0.4.1.apk',sizeBytes:full.length,sha256:sha(full),parts:bytes.map((b,i)=>({filename:`part-00${i}.bin`,sizeBytes:b.length,sha256:sha(b)}))};
  bytes.forEach((b,i)=>fs.writeFileSync(path.join(folder,m.parts[i].filename),b));
  const save = ()=>fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(m));
  save();
  fs.writeFileSync(path.join(root,'releases/android/0.4.1.json'),JSON.stringify(m));
  const output=path.join(root,'apps/web/public/downloads/me-plus-0.4.1.apk');
  return {root,folder,m,save,full,output};
}
test('parts reconstruct exact bytes and sidecar, and a replay remains identical',t=>{
  const f=fixture(t);
  assert.deepEqual(assembleAndroidDownloads(f.root),['me-plus-0.4.1.apk']);
  assert.deepEqual(fs.readFileSync(f.output),f.full);
  assert.equal(fs.readFileSync(f.output+'.sha256','utf8'),`${sha(f.full)}  me-plus-0.4.1.apk\n`);
  assembleAndroidDownloads(f.root); assert.deepEqual(fs.readFileSync(f.output),f.full);
});
test('corrupt or missing parts fail before replacing an existing download',t=>{
  const f=fixture(t);assembleAndroidDownloads(f.root);
  fs.writeFileSync(path.join(f.folder,'part-001.bin'),Buffer.alloc(f.m.parts[1].sizeBytes));
  assert.throws(()=>assembleAndroidDownloads(f.root),/checksum/);
  assert.deepEqual(fs.readFileSync(f.output),f.full);
  fs.unlinkSync(path.join(f.folder,'part-001.bin'));
  assert.throws(()=>assembleAndroidDownloads(f.root));
  assert.deepEqual(fs.readFileSync(f.output),f.full);
  assert.equal(fs.readdirSync(path.dirname(f.output)).some(n=>n.includes('assembling-')),false);
});
test('part reordering and path traversal are rejected',t=>{
  const f=fixture(t);f.m.parts.reverse();f.save();assert.throws(()=>assembleAndroidDownloads(f.root),/Invalid Android part/);
  f.m.parts[0].filename='../outside.bin';f.save();assert.throws(()=>assembleAndroidDownloads(f.root),/Invalid Android part/);
  assert.equal(fs.existsSync(f.output),false);
});
test('provenance disagreement and incomplete aggregate fail closed',t=>{
  const f=fixture(t);f.m.sha256='0'.repeat(64);f.save();assert.throws(()=>assembleAndroidDownloads(f.root),/provenance/);
  f.m.sha256=sha(f.full);f.m.parts.pop();f.save();assert.throws(()=>assembleAndroidDownloads(f.root),/Assembled Android checksum/);
  assert.equal(fs.existsSync(f.output),false);
});
test('oversized manifest and malformed part declarations are rejected',t=>{
  const f=fixture(t);f.m.sizeBytes=101*1024*1024;f.save();assert.throws(()=>assembleAndroidDownloads(f.root),/Invalid Android parts manifest/);
  f.m.sizeBytes=f.full.length;f.m.parts[0].sizeBytes=-1;f.save();assert.throws(()=>assembleAndroidDownloads(f.root),/Invalid Android part/);
});
