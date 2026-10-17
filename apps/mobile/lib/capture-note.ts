export async function saveCaptureNote(db: any, owner: string, id: string, content: string) {
  const text = content.trim();
  if (!text || text.length > 8000) throw new Error('Write a note between 1 and 8,000 characters.');
  const auth = await db.auth.getUser();
  if (auth.error || auth.data.user?.id !== owner) throw new Error('Sign in to the same account before saving.');
  const row = { id, user_id: owner, channel: 'me-plus-mobile', capture_type: 'note', content: text,
    consent_basis: 'explicit_user_input', sensitivity: 'personal', processing_status: 'captured' };
  const result = await db.from('conversation_captures').insert(row);
  if (result.error && result.error.code !== '23505') throw new Error('Note is not confirmed. Keep your draft and retry.');
  // A lost acknowledgement reuses the same ID; readback confirms the exact note.
  const confirmed = await db.from('conversation_captures').select('id,user_id,content').eq('id', id).eq('user_id', owner).maybeSingle();
  const current = await db.auth.getUser();
  if (current.error || current.data.user?.id !== owner) throw new Error('Account changed.');
  if (confirmed.error || confirmed.data?.id !== id || confirmed.data?.user_id !== owner || confirmed.data?.content !== text) {
    throw new Error('Note is not confirmed. Keep your draft and retry.');
  }
  return confirmed.data.id as string;
}
