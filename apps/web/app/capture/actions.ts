'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { executeWebNote } from '../../lib/capture-note-handler';
export async function saveWebNote(input: {
    id: string;
    content: string;
    owner: string;
}) {
    if (!input || typeof input.id !== 'string' || typeof input.content !== 'string' || typeof input.owner !== 'string')
        return { ok: false, message: 'Invalid note.' };
    const result = await executeWebNote(await createClient(), input, createAdminClient);
    if (result.ok)
        revalidatePath('/capture');
    return result;
}
