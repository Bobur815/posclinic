/** Software update status, shared by main (src/main/updater/updater.ts) and the renderer. */
export type UpdateState =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatusDto {
  state: UpdateState;
  currentVersion: string;
  /** The newer version, once one is known. */
  version: string | null;
  releaseDate: string | null;
  /** Download progress, 0-100 while downloading. */
  percent: number | null;
  /** i18n key (`update.errors.*`) when state is error. */
  message: string | null;
  /** ISO time of the last answer from the server. */
  checkedAt: string | null;
}
