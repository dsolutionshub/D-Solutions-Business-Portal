/** Display formatting. Money arrives from the API in paise; the shared helpers are the single implementation. */
export { formatDate, formatInr, paiseToRupees, rupeesToPaise, relativeDays } from '@dsol/shared';

/** Up to two initials from a name or email. */
export const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(w => /[a-z0-9]/i.test(w[0] ?? ''))
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('');
