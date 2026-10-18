import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { HEALTH_SYNC_INTERVAL_MINUTES, HEALTH_SYNC_TASK } from './sync-policy';
import { runAutomaticHealthSync, cancelHealthSync, automaticSyncEnabled } from './automatic-health-sync';
import { supabase } from '../supabase/client';
import { getHealthConnectPermissionState } from './health-connect';

// Module scope is required for Android's headless JavaScript startup.
if (Platform.OS === 'android') TaskManager.defineTask(HEALTH_SYNC_TASK, async () => {
  try {
    await runAutomaticHealthSync(true);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let lifecycle: Promise<unknown> = Promise.resolve();
function sequence<T>(work: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(work, work);
  lifecycle = result.catch(() => {});
  return result;
}

export function scheduleBackgroundHealthSync(owner: string) {
  return sequence(async () => {
  if (Platform.OS !== 'android') return false;
  const permissions = await getHealthConnectPermissionState();
  if (!permissions.backgroundRead || !permissions.recordReadTypes.length ||
      await BackgroundTask.getStatusAsync() !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== owner || !automaticSyncEnabled(owner)) return false;
  // Do not reset WorkManager's timer on every resume.
  if (!await TaskManager.isTaskRegisteredAsync(HEALTH_SYNC_TASK)) {
    await BackgroundTask.registerTaskAsync(HEALTH_SYNC_TASK, { minimumInterval: HEALTH_SYNC_INTERVAL_MINUTES });
  }
  return true;
  });
}

export async function stopBackgroundHealthSync() {
  cancelHealthSync();
  return sequence(async () => {
  if (Platform.OS === 'android' && await TaskManager.isTaskRegisteredAsync(HEALTH_SYNC_TASK)) {
    await BackgroundTask.unregisterTaskAsync(HEALTH_SYNC_TASK);
  }
  });
}

export async function backgroundHealthSyncRegistered() {
  return Platform.OS === 'android' && TaskManager.isTaskRegisteredAsync(HEALTH_SYNC_TASK);
}
