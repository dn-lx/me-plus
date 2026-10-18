import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
const owner='11111111-1111-4111-8111-111111111111';
const action={id:'22222222-2222-4222-8222-222222222222',title:'Guitar · chord transitions',priority:'should',status:'planned',estimated_minutes:15,instructions:'G–D–Em–C · clean transitions, not speed.',due_at:null,available_from:null};
const user={id:owner,email:'synthetic@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},identities:[]};
const token=[{alg:'HS256',typ:'JWT'},{sub:owner,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'fixture'].map((v,i)=>i<2?Buffer.from(JSON.stringify(v)).toString('base64url'):v).join('.');
const out=process.env.UI_QA_OUTPUT||'/tmp/meplus-ui';mkdirSync(out,{recursive:true});
try {
 for(const width of [360,1363]) {
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];let stored=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://example.supabase.co/**',async route=>{
   const req=route.request();const url=new URL(req.url());let data=[];
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}});return;}
   if(url.pathname.includes('/auth/v1/token'))data={access_token:token,token_type:'bearer',expires_in:3600,refresh_token:'synthetic-only',user};
   else if(url.pathname.includes('/auth/v1/user'))data=user;
   else if(url.pathname.includes('/rest/v1/rpc/record_meplus_action_decision')){action.status=JSON.parse(req.postData()).p_decision;data={ok:true};}
   else if(url.pathname.endsWith('/actions'))data=url.searchParams.has('id')?action:(action.status==='completed'?[]:[action]);
   else if(url.pathname.endsWith('/conversation_captures')){if(req.method()==='POST'){stored=JSON.parse(req.postData());data=null;}else data=stored;}
   else if(url.pathname.endsWith('/action_events'))data=[{id:'evt',event_type:'completed',occurred_at:new Date().toISOString()}];
   await route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'},body:JSON.stringify(data)});
  });
  await page.route('https://api.example.test/api/capture',async route=>{
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'}});return;}
   const row=JSON.parse(route.request().postData());await route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({ok:true,...row})});
  });
  action.status='planned';
  await page.goto('http://127.0.0.1:8765/');
  await page.getByRole('textbox',{name:'Me+ email'}).fill(user.email);
  await page.getByLabel('Me+ password').fill('synthetic-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('Today, kept small',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${out}/today-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'View action',exact:true}).click();
  await page.getByRole('button',{name:'I completed this action',exact:true}).click();
  await page.getByRole('button',{name:'Back to Today',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('tab',{name:'Plan',exact:true}).click();await page.getByText('Your current actions',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Capture',exact:true}).click();await page.getByLabel('Your note').fill('A private synthetic test note');
  await page.getByRole('button',{name:'Save note',exact:true}).click();await page.getByText('Note saved and confirmed.',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Review',exact:true}).click();await page.getByText('Last seven days · latest 200 events.',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/review-${width}.png`,fullPage:true});
  await page.getByRole('tab',{name:'More',exact:true}).click();await page.getByRole('link',{name:'Health & automatic sync',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,overflow:false,flows:'sign-in,action-readback,plan,note-save,review,more',pageErrors:errors}));
  await page.close();
 }
} finally {await browser.close();}
