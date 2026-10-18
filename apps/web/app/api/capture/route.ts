import {NextResponse} from 'next/server';
import {createAdminClient} from '../../../lib/supabase/admin';
import {executeWebNote} from '../../../lib/capture-note-handler';
export async function POST(request:Request){
 const match=/^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization')??'');
 if(!match)return NextResponse.json({error:'authentication_required'},{status:401});
 try{
  const admin=createAdminClient(),token=match[1];
  const user=await admin.auth.getUser(token);
  if(user.error||!user.data.user)return NextResponse.json({error:'authentication_required'},{status:401});
  const reader=request.body?.getReader();if(!reader)return NextResponse.json({error:'invalid_note'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>40000){await reader.cancel();return NextResponse.json({error:'note_too_large'},{status:413});}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  let raw;try{raw=JSON.parse(new TextDecoder().decode(bytes));}catch{return NextResponse.json({error:'invalid_note'},{status:400});}
  if(!raw||typeof raw.id!=='string'||typeof raw.content!=='string'||raw.owner!==user.data.user.id)return NextResponse.json({error:'invalid_note'},{status:400});
  // Owner is derived from verified auth; no caller controls data_source_id or status.
  const input={id:raw.id,content:raw.content,owner:user.data.user.id};
  const db={auth:{getUser:()=>admin.auth.getUser(token)},from:admin.from.bind(admin)} as Parameters<typeof executeWebNote>[0];
  const result=await executeWebNote(db,input,()=>admin,'me-plus-mobile');
  if(!result.ok)return NextResponse.json({error:'note_not_confirmed'},{status:409});
  return NextResponse.json({ok:true,id:input.id,owner:input.owner,content:input.content.trim()});
 }catch{return NextResponse.json({error:'note_unavailable'},{status:503});}
}
