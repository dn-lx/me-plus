import {createClient} from "npm:@supabase/supabase-js@2.117.2";
import {createMcpHandler} from "./mcp.ts";
const url=Deno.env.get("SUPABASE_URL");
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!url||!key){
 Deno.serve(()=>new Response('{"error":"runtime_unconfigured"}',{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}}));
}else{
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const origins=(Deno.env.get("MEPLUS_MCP_ALLOWED_ORIGINS")??"").split(",").map(x=>x.trim()).filter(Boolean);
 Deno.serve(createMcpHandler(async(token,tool,args)=>{
  const {data,error}=await db.rpc("server_execute_meplus_client_tool",{p_token:token,p_tool:tool,p_arguments:args});
  if(error)throw new Error("meplus_backend_unavailable");
  return data;
 },origins));
}
