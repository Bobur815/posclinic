import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';

/**
 * Runs `fn` whenever `deps` change; the newest call wins (older answers are dropped).
 * `error` is already translated text.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { t } = useTranslation();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === seq.current) setData(result);
    } catch (err) {
      if (id === seq.current) setError(errorText(t, err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [run, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
