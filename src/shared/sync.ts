/** Cloud sync status of the main till (src/main/sync/sync-service.ts). */
export interface SyncStatusDto {
  /** `disabled`: no licence yet (setup) — nothing to sync with. */
  state: 'idle' | 'syncing' | 'error' | 'disabled';
  lastSyncAt: string | null;
  /** i18n key `sync.errors.*` from the last failed run. */
  lastError: string | null;
  /** Rows changed on this till and not yet accepted by the server. */
  pending: number | null;
}
