// Builds only the two existing N26 functions. No site build, deploy, or secrets.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const modules=resolve(process.env.MEPLUS_BACKEND_BUILD_MODULES??join(root,'node_modules'));
const output=resolve(process.argv[2]??join(root,'dist','backend-functions'));
const stage=join(output,'staging'),archives=join(output,'archives');
await mkdir(stage,{recursive:true});await mkdir(archives,{recursive:true});
const {build}=await import(pathToFileURL(join(modules,'esbuild/lib/main.js')).href);
const {zipFunctions}=await import(pathToFileURL(join(modules,'@netlify/zip-it-and-ship-it/dist/main.js')).href);
const names=['n26-sync-background','n26-runtime-diagnostic'];
for(const name of names){
 await build({entryPoints:[join(root,'netlify','functions',name+'.mts')],outfile:join(stage,name+'.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',nodePaths:[modules],logLevel:'warning'});
}
const functions=await zipFunctions(stage,archives,{archiveFormat:'zip',basePath:root,repositoryRoot:root,
 config:{'*':{nodeBundler:'esbuild',nodeVersion:'24.x'}},manifest:join(archives,'manifest.json')});
if(functions.length!==2||functions.some(f=>!names.includes(f.name)||f.runtimeAPIVersion!==2))throw new Error('Unexpected backend bundle contract');
const checksum=[];
for(const f of functions){const bytes=await readFile(f.path);checksum.push({name:f.name,file:f.path.split('/').at(-1),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,runtimeAPIVersion:f.runtimeAPIVersion});}
await writeFile(join(archives,'checksums.json'),JSON.stringify({contract:'n26-history-cutoff-v1',functions:checksum},null,2)+'\n');
console.log(JSON.stringify({output:archives,functions:checksum},null,2));
