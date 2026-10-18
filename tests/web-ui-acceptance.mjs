// Hosted-only browser QA: a loopback Supabase fixture, never a live account.
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const playwright=await import(process.env.PLAYWRIGHT_MODULE);
const {chromium}=playwright.default??playwright;
const out=process.env.UI_QA_OUTPUT||'/tmp/meplus-web-ui';await mkdir(out,{recursive:true});
const owner='11111111-1111-4111-8111-111111111111';let notes=new Map(),mode='ok';
const user={id:owner,email:'owner@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
const fixture=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const url=new URL(req.url,'http://127.0.0.1:8766');let data;
 if(url.pathname==='/auth/v1/user'){if(req.headers.authorization==='Bearer rejected'){res.statusCode=401;data={message:'invalid token',code:'bad_jwt'};}else data=user;}
 else if(url.pathname==='/qa/mode'){mode=body;data={ok:true};}
 else if(url.pathname==='/rest/v1/conversation_captures'){
  if(req.method==='POST'){const row=JSON.parse(body);if(row.user_id!==owner){res.statusCode=403;data={message:'denied'};}else if(mode==='denied'){res.statusCode=403;data={message:'test denial'};}else if(notes.has(row.id)){res.statusCode=409;data={code:'23505'};}else{notes.set(row.id,row);res.statusCode=201;data=null;}}
  else{const id=url.searchParams.get('id')?.replace('eq.','');data=notes.get(id)||null;}
 }else if(url.pathname==='/rest/v1/data_sources')data=[];
 else if(url.pathname==='/rest/v1/actions')data=[];
 else if(url.pathname.startsWith('/rest/v1/'))data=[];
 else{res.statusCode=404;data={error:'Unknown QA path'};}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
});await new Promise(r=>fixture.listen(8766,'127.0.0.1',r));
const browser=await chromium.launch();const results=[];
try{for(const width of [360,1363]){
 const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://localhost:8765';await page.goto(base);await page.getByRole('heading',{name:'A calmer day. One useful next step.'}).waitFor();
 assert.equal(await page.locator('img.brandMark').evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${out}/home-${width}.png`,fullPage:true});
 await page.getByRole('link',{name:'Get the Android app',exact:true}).click();await page.getByRole('heading',{name:'Download Me+',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/download-${width}.png`,fullPage:true});
 await page.getByRole('link',{name:'Plan',exact:true}).click();await page.getByRole('heading',{name:'Sign in to Me+',exact:true}).waitFor();assert(new URL(page.url()).searchParams.get('next')==='/plan');
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const token=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:owner,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})}.qa-only`;
 const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'qa-only',user};
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+enc(session),domain:'localhost',path:'/'}]);
 await page.goto(base+'/capture');await page.getByRole('heading',{name:'Capture',exact:true}).waitFor();await page.getByLabel('What would you like to keep?').fill('Synthetic QA note');await page.getByRole('button',{name:'Save note',exact:true}).click();await page.getByRole('status').filter({hasText:'Note saved and confirmed.'}).waitFor();assert.equal(await page.getByLabel('What would you like to keep?').inputValue(),'');
 await fetch('http://127.0.0.1:8766/qa/mode',{method:'POST',body:'denied'});await page.getByLabel('What would you like to keep?').fill('Keep this draft');await page.getByRole('button',{name:'Save note',exact:true}).click();await page.getByRole('status').filter({hasText:'Save not confirmed'}).waitFor();assert.equal(await page.getByLabel('What would you like to keep?').inputValue(),'Keep this draft');await fetch('http://127.0.0.1:8766/qa/mode',{method:'POST',body:'ok'});
 const noteEndpoint=base+'/api/capture',authHeaders={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
 assert.equal((await fetch(noteEndpoint,{method:'POST',body:'{}'})).status,401);
 assert.equal((await fetch(noteEndpoint,{method:'POST',headers:{...authHeaders,Authorization:'Bearer rejected'},body:'{}'})).status,401);
 assert.equal((await fetch(noteEndpoint,{method:'POST',headers:authHeaders,body:JSON.stringify({id:crypto.randomUUID(),owner:'other',content:'Denied'})})).status,400);
 assert.equal((await fetch(noteEndpoint,{method:'POST',headers:authHeaders,body:'{'})).status,400);
 assert.equal((await fetch(noteEndpoint,{method:'POST',headers:authHeaders,body:'x'.repeat(40001)})).status,413);
 const note={id:crypto.randomUUID(),owner,content:'Native API synthetic note',data_source_id:'forged',processing_status:'forged'};
 const response=await fetch(noteEndpoint,{method:'POST',headers:authHeaders,body:JSON.stringify(note)});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,id:note.id,owner,content:note.content});
 assert.equal(notes.get(note.id).user_id,owner);assert.equal(notes.get(note.id).channel,'me-plus-mobile');assert.equal(notes.get(note.id).processing_status,'captured');assert.equal(notes.get(note.id).data_source_id,undefined);
 assert.equal((await fetch(noteEndpoint,{method:'POST',headers:authHeaders,body:JSON.stringify(note)})).status,200);
 assert.equal((await fetch(noteEndpoint,{method:'POST',headers:authHeaders,body:JSON.stringify({...note,content:'Different'})})).status,409);
 await page.screenshot({path:`${out}/capture-error-${width}.png`,fullPage:true});
 await page.getByRole('link',{name:'More',exact:true}).click();await page.getByRole('heading',{name:'Health Connect',exact:true}).waitFor();await page.getByText('No successful upload recorded',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/more-${width}.png`,fullPage:true});
 for(const [route,title] of [['privacy','Privacy'],['terms','Terms of use'],['finance/connect','Connect N26']]){
  await page.goto(base+'/'+route);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  assert.equal(await page.locator('img.brandMark').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${out}/${route.replace('/','-')}-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);results.push({width,home:true,download:true,authRedirect:true,captureReceipt:true,deniedDraftRetained:true,moreEmpty:true,nativeCaptureBoundary:true,sharedNavigation:true,pageErrors:errors});await context.close();
}}finally{await browser.close();fixture.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));

