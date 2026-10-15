import type { ReactNode } from 'react';
import { useMatches, type UIMatch } from 'react-router';

/**
 * Each route can set `handle: { crumb }` — a label, or a function of the match (e.g. to show a
 * client's name). The last crumb is the current page.
 */
export interface RouteHandle {
  crumb?: ReactNode | ((match: UIMatch) => ReactNode);
  /** where the crumb links to, if not the route's own path (layout routes without a path) */
  crumbTo?: string;
}

export function useCrumbs() {
  return useMatches()
    .filter(m => (m.handle as RouteHandle | undefined)?.crumb !== undefined)
    .map(m => {
      const crumb = (m.handle as RouteHandle).crumb;
      return {
        to: (m.handle as RouteHandle).crumbTo ?? m.pathname,
        label: typeof crumb === 'function' ? crumb(m) : crumb
      };
    });
}
