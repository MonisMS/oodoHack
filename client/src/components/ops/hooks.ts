import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List screen state kept in the URL (?page=2&status=ACTIVE&search=acme), so a filtered list can be bookmarked, shared and
 * survives a refresh or the browser Back button. Changing any filter resets to page 1.
 */
export function useListParams(pageSize = 20) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('page') ?? 1)) || 1);
  const get = (key: string) => params.get(key) ?? '';
  const set = (patch: Record<string, string | number | undefined>) => setParams(previous => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(patch)) { if (value === undefined || value === '') next.delete(key); else next.set(key, String(value)); }
    if (!('page' in patch)) next.delete('page');
    return next;
  }, { replace: true });
  /** Query-string object for the API: every URL parameter plus page/pageSize. */
  const query = () => ({ ...Object.fromEntries([...params].filter(([key]) => key !== 'page')), page, pageSize });
  return { page, pageSize, get, set, query };
}

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delayMs); return () => clearTimeout(timer); }, [value, delayMs]);
  return debounced;
}
