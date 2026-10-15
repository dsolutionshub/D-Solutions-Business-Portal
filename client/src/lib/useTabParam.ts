import { useSearchParams } from 'react-router';

/** Keeps the selected tab in the URL (?tab=…) so tabs can be linked to and survive reloads. */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T): [T, (tab: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = (tabs as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
  const setTab = (next: string) =>
    setParams(
      prev => {
        const p = new URLSearchParams(prev);
        if (next === fallback) p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true }
    );
  return [tab, setTab];
}
