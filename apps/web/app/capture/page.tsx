import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { SiteNav } from '../components/site-nav';
import { NoteForm } from './note-form';
export const dynamic = 'force-dynamic';
export default async function CapturePage() { const db = await createClient(), auth = await db.auth.getUser(); if (auth.error || !auth.data.user)
    redirect('/login?next=%2Fcapture'); return <main className="shell"><SiteNav current="capture" user={auth.data.user}/><p className="eyebrow">MAKE SPACE FOR A THOUGHT</p><h1>Capture</h1><p className="lede">Keep a personal note now. Decide what to do with it later.</p><section className="appCard" style={{ maxWidth: 760 }}><NoteForm key={auth.data.user.id} owner={auth.data.user.id}/></section><p style={{ maxWidth: 760, color: 'var(--muted)', fontSize: '.9rem' }}>Notes are saved to your Me+ account after confirmation. They do not automatically become tasks. Unsaved drafts stay in this page only and are cleared on an account change; keep the page open until your save is confirmed.</p></main>; }
