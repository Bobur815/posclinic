import { useCallback, useEffect, useState } from 'react';
import type { AdminUnitDto } from '../../shared/address';

/**
 * Address data for the AddressSelector, cached for the whole app session. The dataset only
 * changes with an app update (it is bundled and imported on start), so there is nothing to
 * revalidate while the till runs: once a region's districts are loaded, switching back to it
 * costs no IPC call. Requests in flight are shared; a failed one is dropped so a retry refetches.
 */

const cache = new Map<string, Promise<AdminUnitDto[]>>();

function cached(key: string, load: () => Promise<AdminUnitDto[]>): Promise<AdminUnitDto[]> {
  let p = cache.get(key);
  if (!p) {
    p = load().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

export const addressKeys = {
  regions: 'regions',
  children: (parentCode: string) => `children:${parentCode}`,
};

export function loadRegions(): Promise<AdminUnitDto[]> {
  return cached(addressKeys.regions, () => window.electronAPI.addresses.regions());
}

export function loadChildren(parentCode: string): Promise<AdminUnitDto[]> {
  return cached(addressKeys.children(parentCode), () =>
    window.electronAPI.addresses.children(parentCode),
  );
}

/** Tests, or after the dataset changed under a running app. */
export function invalidateAddressCache(): void {
  cache.clear();
}

export interface UnitsState {
  data: AdminUnitDto[] | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

function useUnits(key: string | null, load: () => Promise<AdminUnitDto[]>): UnitsState {
  const [state, setState] = useState<{
    data: AdminUnitDto[] | null;
    loading: boolean;
    error: boolean;
  }>({ data: null, loading: key !== null, error: false });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `load` is derived from `key`
  useEffect(() => {
    if (key === null) {
      setState({ data: null, loading: false, error: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data && attempt > 0 ? s.data : null, loading: true, error: false }));
    load()
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** Top-level units (regions, Karakalpakstan, Tashkent City). */
export function useRegions(): UnitsState {
  return useUnits(addressKeys.regions, loadRegions);
}

/** Children of `parentCode`; idle (no call at all) until a parent is chosen. */
export function useChildUnits(parentCode: string | null): UnitsState {
  return useUnits(parentCode ? addressKeys.children(parentCode) : null, () =>
    loadChildren(parentCode as string),
  );
}
