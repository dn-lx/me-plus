// Health Connect change tokens are tied to the signed-in account and permission set.
export function healthSyncScope(userId: string, recordTypes: readonly string[]) {
  return `${userId}:${[...new Set(recordTypes)].sort().join(",")}`;
}
