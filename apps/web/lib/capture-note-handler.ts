import type { SupabaseClient } from '@supabase/supabase-js';
type NoteInput = {
    id: string;
    content: string;
    owner: string;
};
export async function executeWebNote(db: Pick<SupabaseClient, 'auth' | 'from'>, input: NoteInput, writer: () => Pick<SupabaseClient, 'from'> = () => db, channel: 'me-plus-web' | 'me-plus-mobile' = 'me-plus-web') {
    const content = input.content.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) || !content || content.length > 8000)
        return { ok: false, message: 'Write a note between 1 and 8,000 characters.' };
    try {
        const auth = await db.auth.getUser();
        if (auth.error || !auth.data.user || auth.data.user.id !== input.owner)
            return { ok: false, message: 'Your account changed. Sign in again before saving.' };
        const row = { id: input.id, user_id: auth.data.user.id, channel, capture_type: 'note', content, consent_basis: 'explicit_user_input', sensitivity: 'personal', processing_status: 'captured' };
        // Server-owned writer supplies generated identity/status columns unavailable to clients.
        const saved = await writer().from('conversation_captures').insert(row);
        if (saved.error && saved.error.code !== '23505')
            return { ok: false, message: 'Save not confirmed. Your draft is still here; please retry.' };
        const check = await db.from('conversation_captures').select('id,user_id,content').eq('id', input.id).eq('user_id', input.owner).maybeSingle();
        const current = await db.auth.getUser();
        if (current.error || current.data.user?.id !== input.owner || check.error || check.data?.id !== input.id || check.data?.user_id !== input.owner || check.data?.content !== content)
            return { ok: false, message: 'Save not confirmed. Keep your draft and sign in again if needed.' };
        return { ok: true, message: 'Note saved and confirmed.' };
    }
    catch {
        return { ok: false, message: 'Unable to confirm the save. Your draft is still here; please retry.' };
    }
}
