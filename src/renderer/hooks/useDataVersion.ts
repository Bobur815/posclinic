import { useEffect, useState } from 'react';
import type { DataChangedEvent } from '../../shared/lan';

type Entity = DataChangedEvent['entity'];

/**
 * A counter that goes up whenever `entities` change anywhere: on this till, on another desk
 * (a satellite, or the main till for a satellite) or through cloud sync from the web dashboard.
 * Put it in the dependencies of the effect that loads the page's data, and the page reloads by
 * itself. Debounced, so a burst of writes (a sync batch) reloads once.
 */
export function useDataVersion(entities: Entity[], debounceMs = 300): number {
  const [version, setVersion] = useState(0);
  const key = [...entities].sort().join(',');

  useEffect(() => {
    const wanted = new Set(key.split(','));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.electronAPI.data.onChanged((event) => {
      if (!wanted.has(event.entity)) return;
      clearTimeout(timer);
      timer = setTimeout(() => setVersion((v) => v + 1), debounceMs);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [key, debounceMs]);

  return version;
}
