import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const output=resolve(process.argv[2]??'dist/backend-functions');
const checksums=JSON.parse(await readFile(join(output,'archives','checksums.json'),'utf8'));
const manifest=JSON.parse(await readFile(join(output,'archives','manifest.json'),'utf8'));
assert.equal(checksums.contract,'n26-history-cutoff-v1');assert.equal(checksums.functions.length,2);
assert.equal(manifest.functions.length,2);
for(const entry of manifest.functions){
 assert.equal(entry.buildData.runtimeAPIVersion,2);assert.equal(entry.runtimeVersion,'nodejs24.x');
 if(entry.name==='n26-sync-background')assert.equal(entry.invocationMode,'background');
}
for(const f of checksums.functions){
 assert.ok(['n26-sync-background.zip','n26-runtime-diagnostic.zip'].includes(f.file));
 const data=await readFile(join(output,'archives',f.file));assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);assert.equal(f.runtimeAPIVersion,2);
}
const extracted=await mkdtemp(join(tmpdir(),'meplus-backend-zip-'));
const previousFetch=globalThis.fetch;let requests=0;
try{
 for(const f of checksums.functions){
  execFileSync('python3',['-c',`import sys,zipfile,pathlib,stat
with zipfile.ZipFile(sys.argv[1]) as z:
 for item in z.infolist():
  p=pathlib.PurePosixPath(item.filename)
  if p.is_absolute() or '..' in p.parts or stat.S_ISLNK(item.external_attr>>16): raise ValueError('Unsafe archive member')
 required={'___netlify-entry-point.mjs','___netlify-bootstrap.mjs',sys.argv[3]+'.mjs'}
 if not required.issubset(z.namelist()): raise ValueError('Missing runtime entrypoint')
 z.extractall(sys.argv[2])`,join(output,'archives',f.file),join(extracted,f.name),f.name]);
 }
 globalThis.fetch=async()=>{requests++;throw new Error('Denied request attempted network access');};
 const {default:diagnostic}=await import(pathToFileURL(join(extracted,'n26-runtime-diagnostic','n26-runtime-diagnostic.mjs')).href);
 const {default:worker,config}=await import(pathToFileURL(join(extracted,'n26-sync-background','n26-sync-background.mjs')).href);
 assert.equal(config.background,true);
 for(const headers of [{},{'x-me-plus-scheduler-secret':'invalid-synthetic-secret'}]){
  assert.equal((await diagnostic(new Request('https://example.invalid',{method:'POST',headers}))).status,401);
  assert.equal(await worker(new Request('https://example.invalid',{method:'POST',headers})),undefined);
 }
 assert.equal(requests,0);
}finally{globalThis.fetch=previousFetch;await rm(extracted,{recursive:true,force:true});}
console.log('Verified ZIP checksums, API2 entrypoints, background mode and denied payloads without network access');
