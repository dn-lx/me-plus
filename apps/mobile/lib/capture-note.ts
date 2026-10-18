type NoteRequest={owner:string;id:string;content:string};
async function postCaptureNote(input:NoteRequest,token:string){
 const base=process.env.EXPO_PUBLIC_ME_PLUS_API_URL;
 if(!base?.startsWith('https://'))throw new Error('Me+ note service is unavailable. Keep your draft.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch(`${base.replace(/\/$/,'')}/api/capture`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input),signal:controller.signal});
  if(!response.ok)throw new Error('Note is not confirmed. Keep your draft and retry.');
  return await response.json();
 }finally{clearTimeout(timer);}
}
export async function saveCaptureNote(db:any,owner:string,id:string,content:string,send=postCaptureNote){
 const text=content.trim();if(!text||text.length>8000)throw new Error('Write a note between 1 and 8,000 characters.');
 const auth=await db.auth.getUser();if(auth.error||auth.data.user?.id!==owner)throw new Error('Sign in to the same account before saving.');
 const session=await db.auth.getSession();if(session.error||session.data.session?.user.id!==owner||!session.data.session?.access_token)throw new Error('Sign in to the same account before saving.');
 const confirmed=await send({owner,id,content:text},session.data.session.access_token);
 const current=await db.auth.getUser();if(current.error||current.data.user?.id!==owner)throw new Error('Account changed.');
 if(confirmed?.ok!==true||confirmed.id!==id||confirmed.owner!==owner||confirmed.content!==text)throw new Error('Note is not confirmed. Keep your draft and retry.');
 return confirmed.id as string;
}
