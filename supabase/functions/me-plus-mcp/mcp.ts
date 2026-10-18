type Execute = (token:string,tool:string|null,args:Record<string,unknown>)=>Promise<any>;
const uuid={type:"string",pattern:"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"};
const text=(maxLength:number)=>({type:"string",minLength:1,maxLength});
const request_id=uuid,action_id=uuid;
function tool(name:string,description:string,properties:Record<string,any>,required:string[],readOnly=false){
 return {name,description,inputSchema:{type:"object",properties,required,additionalProperties:false},annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
}
export const TOOLS=[
 tool("read_state","Read bounded Me+ state for your approved data scopes.",{sections:{type:"array",items:{type:"string",enum:["tasks","routines","goals","guidance","health","integrations"]},minItems:1,maxItems:6},limit:{type:"integer",minimum:1,maximum:50}},[],true),
 tool("create_task","Create a user-owned task. Reuse request_id only for retries of this same request.",{request_id,title:text(200),domain:text(60),priority:{type:"string",enum:["must","should","bonus"]},estimated_minutes:{type:"integer",minimum:0,maximum:1440},available_from:text(64),due_at:text(64)},["request_id","title"]),
 tool("edit_task","Edit an open manual task; routine occurrences and closed actions are protected.",{request_id,action_id,title:text(200),instructions:{type:"string",maxLength:4000},priority:{type:"string",enum:["must","should","bonus"]},estimated_minutes:{type:"integer",minimum:0,maximum:1440}},["request_id","action_id"]),
 tool("reschedule_task","Change an open manual task's availability/due window; does not book a calendar event.",{request_id,action_id,available_from:text(64),due_at:text(64)},["request_id","action_id"]),
 tool("complete_task","Record confirmed execution: completed, partial or skipped. Partial work is separate from full completion.",{request_id,action_id,status:{type:"string",enum:["completed","partial","skipped"]}},["request_id","action_id","status"]),
 tool("rate_recommendation","Record a 1–5 helpfulness rating and optional follow-through, independently from task completion. A new request records a changed rating with history.",{request_id,recommendation_id:uuid,stars:{type:"integer",minimum:1,maximum:5},follow_through:{type:"string",enum:["yes","partly","no","not_applicable"]},note:{type:"string",maxLength:1000}},["request_id","recommendation_id","stars"])
];
const versions=["2025-03-26","2025-06-18","2025-11-25"];
function valid(schema:any,value:any):boolean{
 if(schema.type==="object")return value!==null&&typeof value==="object"&&!Array.isArray(value)&&schema.required.every((k:string)=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&valid(schema.properties[k],value[k]));
 if(schema.type==="array")return Array.isArray(value)&&value.length>=schema.minItems&&value.length<=schema.maxItems&&value.every(x=>valid(schema.items,x));
 if(schema.type==="string")return typeof value==="string"&&value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??10000)&&(!schema.enum||schema.enum.includes(value))&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(schema.type==="integer")return Number.isSafeInteger(value)&&value>=schema.minimum&&value<=schema.maximum;
 return false;
}
async function boundedBody(req:Request):Promise<string>{
 const reader=req.body?.getReader();if(!reader)return "";
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>65536){await reader.cancel();throw new Error("too_large");}chunks.push(r.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
export function createMcpHandler(execute:Execute,allowedOrigins:string[]=[]){
 return async(req:Request):Promise<Response>=>{
  const headers:Record<string,string>={"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"};
  const origin=req.headers.get("origin");
  const respond=(body:any,status=200)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
  const error=(id:any,code:number,message:string,status=200)=>respond({jsonrpc:"2.0",id,error:{code,message}},status);
  if(origin&&origin!==new URL(req.url).origin&&!allowedOrigins.includes(origin))return error(null,-32000,"Origin denied",403);
  if(origin){headers["access-control-allow-origin"]=origin;headers.vary="Origin";}
  if(req.method==="OPTIONS"){
   headers["access-control-allow-methods"]="POST, GET, OPTIONS";
   headers["access-control-allow-headers"]="authorization, content-type, mcp-protocol-version";
   return respond(null,204);
  }
  if(req.method!=="POST"){headers.allow="POST, OPTIONS";return error(null,-32000,"Method not supported",405);}
  const protocol=req.headers.get("mcp-protocol-version");
  if(protocol&&!versions.includes(protocol))return error(null,-32600,"Unsupported protocol version",400);
  const token=req.headers.get("authorization")?.match(/^Bearer (meplus_[0-9a-f]{64})$/i)?.[1];
  if(!token){headers["www-authenticate"]='Bearer realm="Me+ scoped client token"';return error(null,-32001,"Authentication required",401);}
  if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return error(null,-32600,"JSON content type required",415);
  const accept=req.headers.get("accept")??"*/*";
  if(!accept.includes("application/json")&&!accept.includes("*/*"))return error(null,-32600,"JSON responses required",406);
  let message:any;
  try{message=JSON.parse(await boundedBody(req));}catch(e){return error(null,-32700,"Invalid or oversized JSON",e instanceof Error&&e.message==="too_large"?413:400);}
  if(!message||Array.isArray(message)||message.jsonrpc!=="2.0"||typeof message.method!=="string"||
   (message.id!==undefined&&!(typeof message.id==="string"&&message.id.length<=100)&&!Number.isSafeInteger(message.id)))return error(null,-32600,"Invalid request",400);
  const id=message.id??null;
  try{
   const caps=await execute(token,null,{});
   if(caps?.error){const status=caps.error==="rate_limited"?429:401;return error(id,-32001,status===429?"Rate limited":"Authentication required",status);}
   if(message.id===undefined){if(message.method.startsWith("notifications/"))return respond(null,202);return error(null,-32600,"Request id required",400);}
   let result:any;
   switch(message.method){
    case "initialize":result={protocolVersion:versions.includes(message.params?.protocolVersion)?message.params.protocolVersion:versions.at(-1),capabilities:{tools:{listChanged:false}},serverInfo:{name:"me-plus",version:"2.0.0-backend"},instructions:"Use only user-approved tools. No finance transactions, treatment changes, external effects, arbitrary SQL or general table mutations are exposed. Keep request_id stable for retries."};break;
    case "ping":result={};break;
    case "tools/list":result={tools:TOOLS.filter(t=>caps.operations?.includes(t.name)),_meta:{"meplus/data-scopes":caps.data_scopes??[]}};break;
    case "tools/call":{
     const chosen=TOOLS.find(t=>t.name===message.params?.name&&caps.operations?.includes(t.name));
     const args=message.params?.arguments??{};
     if(!chosen||!valid(chosen.inputSchema,args))return error(id,-32602,"Unknown tool or invalid arguments");
     const value=await execute(token,chosen.name,args);
     if(value?.error==="unauthorized")return error(id,-32001,"Authentication required",401);
     if(value?.error==="rate_limited")return error(id,-32001,"Rate limited",429);
     result={content:[{type:"text",text:JSON.stringify(value)}],isError:value?.ok===false};break;
    }
    default:return error(id,-32601,"Method not found");
   }
   return respond({jsonrpc:"2.0",id,result});
  }catch{return error(id,-32603,"Me+ request failed",500);}
 };
}
