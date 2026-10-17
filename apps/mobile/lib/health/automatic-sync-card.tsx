import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { supabase } from '../supabase/client';
import { automaticSyncEnabled, getHealthSyncStatus, runAutomaticHealthSync, setAutomaticSyncEnabled } from './automatic-health-sync';
import { backgroundHealthSyncRegistered, scheduleBackgroundHealthSync, stopBackgroundHealthSync } from './background-health-sync';
import { requestHealthConnectBackgroundPermission } from './health-connect';

export function AutomaticHealthSyncCard() {
  const [owner, setOwner] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [state, setState] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id ?? null;
      const scheduled = await backgroundHealthSyncRegistered();
      if (!active) return;
      setOwner(id);
      setEnabled(Boolean(id && automaticSyncEnabled(id)));
      setRegistered(scheduled);
      const status = id ? getHealthSyncStatus(id) : null;
      setLastSuccess(status?.lastSuccess ?? null);
      setState(status?.state ?? 'idle');
    };
    void refresh().catch(() => {});
    const timer = setInterval(() => { void refresh().catch(() => {}); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const toggle = async () => {
    if (!owner) return;
    setBusy(true);
    try {
      if (enabled) {
        setAutomaticSyncEnabled(owner, false);
        await stopBackgroundHealthSync();
        setEnabled(false);
        setRegistered(false);
        setMessage('Automatic sync is off.');
      } else {
        await requestHealthConnectBackgroundPermission();
        const session = await supabase.auth.getSession();
        if (session.data.session?.user.id !== owner) throw new Error('Account changed.');
        setAutomaticSyncEnabled(owner, true);
        if (!await scheduleBackgroundHealthSync(owner)) {
          setAutomaticSyncEnabled(owner, false);
          setMessage('Allow Health Connect background reading and enable background activity to schedule sync.');
          return;
        }
        setEnabled(true);
        setRegistered(true);
        setMessage('Automatic sync enabled. Starting catch-up…');
        void runAutomaticHealthSync(false, true).catch(() => { setMessage('Sync paused. Saved progress will be retried automatically.'); });
      }
    } catch {
      setMessage('Could not change background sync. Check Health Connect permissions and try again.');
    } finally { setBusy(false); }
  };
  return <View style={{ padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#344456', backgroundColor: '#141c27', marginBottom: 24, gap: 12 }}>
    <Text style={{ color: '#f5f7fa', fontSize: 18, fontWeight: '700' }}>Automatic health sync</Text>
    <Text style={{ color: '#b8c2cf', lineHeight: 22 }}>
      {enabled && registered ? 'Scheduled every 3 hours' : enabled ? 'Background schedule needs attention' : 'Automatic sync is off'}
      {'\n'}Android may delay runs for battery or network conditions. Open Me+ after a force-stop to resume.
    </Text>
    <Text style={{ color: '#b8c2cf', lineHeight: 22 }}>Last successful automatic sync: {lastSuccess ? new Date(lastSuccess).toLocaleString() : 'Not yet'}{'\n'}Status: {state === 'retry' ? 'Will retry from saved progress' : state === 'permission_required' ? 'Health Connect permission needed' : state}</Text>
    <Pressable accessibilityRole="button" disabled={!owner || busy} onPress={() => { void toggle(); }} style={{ backgroundColor: '#1d5f8c', opacity: !owner || busy ? 0.45 : 1, borderRadius: 12, padding: 16 }}>
      <Text style={{ color: '#f5f7fa', fontWeight: '700' }}>{busy ? 'Updating…' : enabled ? 'Turn off automatic sync' : 'Enable sync every 3 hours'}</Text>
    </Pressable>
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: '#e9eef5', lineHeight: 22 }}>{message}</Text> : null}
  </View>;
}
