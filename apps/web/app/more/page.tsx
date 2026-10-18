import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { SiteNav } from '../components/site-nav';
export const dynamic = 'force-dynamic';
export default async function MorePage() {
    const db = await createClient(), auth = await db.auth.getUser();
    if (auth.error || !auth.data.user)
        redirect('/login?next=%2Fmore');
    const user = auth.data.user;
    const sources = await db.from('data_sources').select('id,display_name,last_sync_at').eq('user_id', user.id).eq('provider', 'health-connect').limit(10);
    const ids = (sources.data ?? []).map(s => s.id);
    const runs = ids.length ? await db.from('source_sync_runs').select('status,started_at,finished_at').eq('user_id', user.id).in('data_source_id', ids).order('started_at', { ascending: false }).limit(1) : { data: [], error: null };
    const successes = (sources.data ?? []).map(s => s.last_sync_at as string | null).filter((s): s is string => Boolean(s) && Number.isFinite(Date.parse(s!))).sort();
    const last = successes.at(-1), latest = runs.data?.[0];
    return <main className="shell"><SiteNav current="more" user={user}/><p className="eyebrow">YOUR ACCOUNT & CONNECTIONS</p><h1>More</h1><p className="lede">A clear view of your connections and where to go next.</p><section className="appCard"><h2>Health Connect</h2>{sources.error || runs.error ? <p role="alert" className="statusError">Server sync status could not be loaded. Refresh to retry.</p> : <><p>Last confirmed server upload: <strong>{last ? new Date(last).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' }) + ' · Europe/Berlin' : 'No successful upload recorded'}</strong></p><p style={{ color: 'var(--muted)' }}>Latest batch: {latest ? latest.status === 'completed' ? 'Completed' : latest.status === 'running' ? 'Server batch in progress' : 'Needs attention' : 'No batches recorded'}{latest?.started_at ? ` · ${new Date(latest.started_at).toLocaleString('en-GB', { timeZone: 'Europe/Berlin' })}` : ''}</p></>}
 <p style={{ color: 'var(--muted)' }}>The Android app reads Health Connect and schedules automatic sync every three hours when Android allows. This website shows individual server batch acknowledgements. A completed batch does not mean the entire phone backlog is uploaded, and this website cannot confirm that the phone worker is scheduled.</p><div className="syncNotice">Keep Me+ installed while a catch-up is uploading. On the phone, enable Automatic health sync and allow background reading. If an upload fails, use Retry sync now; saved progress is retained until acknowledged.</div><Link href="/download" className="secondaryButton">Get the current Android app</Link></section><section className="appCard"><h2>Explore Me+</h2><div className="heroActions"><Link href="/finance/connect" className="secondaryButton">Connect N26</Link><Link href="/privacy" className="secondaryButton">Privacy</Link><Link href="/terms" className="secondaryButton">Terms</Link></div></section></main>;
}

