import { initials } from '@/lib/format';

/** Black or white initials, whichever reads better on the client's colour (WCAG contrast). */
function inkFor(color: string): string {
  const el = document.createElement('span');
  el.style.color = color;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el)
    .color.match(/\d+(\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number) ?? [79, 70, 229];
  el.remove();
  const lum = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lum(rgb[0]!) + 0.7152 * lum(rgb[1]!) + 0.0722 * lum(rgb[2]!);
  // contrast with white = 1.05 / (L + 0.05); with near-black (#0f172a, L≈0.009) = (L + 0.05) / 0.059
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.059 ? '#ffffff' : '#0f172a';
}

const inkCache = new Map<string, string>();

/** Client logo, or coloured initials when there is none. */
export function ClientLogo({
  name,
  color,
  logoUrl,
  size = 32
}: {
  name: string;
  color: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size, borderRadius: Math.round(size / 4) };
  if (logoUrl) return <img src={logoUrl} alt="" style={style} className="flex-none bg-muted object-cover" />;
  let ink = inkCache.get(color);
  if (!ink) inkCache.set(color, (ink = inkFor(color)));
  return (
    <span
      aria-hidden
      style={{ ...style, background: color, color: ink, fontSize: Math.max(10, Math.round(size / 3)) }}
      className="inline-flex flex-none items-center justify-center font-bold tracking-wide"
    >
      {initials(name)}
    </span>
  );
}
