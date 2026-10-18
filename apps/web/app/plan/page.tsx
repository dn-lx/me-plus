import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { SiteNav } from '../components/site-nav';
import { ActionControls } from '../today/action-controls';
export const dynamic = 'force-dynamic';
export default async function PlanPage() {
    const db = await createClient();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user)
        redirect('/login?next=%2Fplan');
    const user = auth.data.user;
    const result = await db.from('actions').select('id,title,priority,status,due_at,estimated_minutes,instructions').eq('user_id', user.id).in('status', ['available', 'planned', 'in_progress', 'partial']).order('due_at', { ascending: true, nullsFirst: false }).limit(40);
    return <main className="shell"><SiteNav current="plan" user={user}/><header><p className="eyebrow">A LITTLE STRUCTURE, ROOM TO ADAPT</p><h1>Plan</h1><p className="lede">Your next priorities, ordered by due date. This view shows up to 40 open actions.</p></header>
 {result.error ? <section className="appCard calmAlert" role="alert">Your plan could not be loaded. Refresh to try again.</section> : !result.data?.length ? <div className="emptyState">No open actions to show. <Link href="/capture">Capture a thought</Link> or check back after your next plan update.</div> : <ul className="actionList">{result.data.map(a => <li className="actionItem" key={a.id}><div className="actionHeader"><h2 className="actionTitle">{a.title}</h2><span className="priorityPill pillBonus">{a.priority}</span></div><p className="actionSub">{a.due_at ? `Due ${new Date(a.due_at).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' })} · Europe/Berlin` : 'No due date'}{a.estimated_minutes ? ` · ${a.estimated_minutes} min` : ''}</p>{a.instructions ? <p className="actionInstructions">{a.instructions}</p> : null}<ActionControls id={a.id} title={a.title}/></li>)}</ul>}
 <p style={{ color: 'var(--muted)', marginTop: 24 }}>For the next action that fits your current availability, <Link href="/today">open Today</Link>.</p></main>;
}
