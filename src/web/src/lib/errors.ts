import type { TFunction } from 'i18next';
import { ApiError } from '../api/client';

/** Human text for any thrown value: `errors.<code>` if we know it, else the generic message. */
export function errorText(t: TFunction, err: unknown): string {
  const code = err instanceof ApiError ? err.code : typeof err === 'string' ? err : 'generic';
  if (err instanceof ApiError && err.code === 'validation' && err.details?.length) {
    return `${t('errors.validation')}: ${err.details.join('; ')}`;
  }
  return t(`errors.${code}`, { defaultValue: t('errors.generic') });
}
