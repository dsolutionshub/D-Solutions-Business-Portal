import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import defaultTheme from 'tailwindcss/defaultTheme';

const c = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;
const pair = (name: string) => ({ DEFAULT: c(name), bg: c(`${name}-bg`) });

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono]
      },
      colors: {
        background: c('background'),
        foreground: c('foreground'),
        'surface-2': c('surface-2'),
        border: { DEFAULT: c('border'), strong: c('border-strong') },
        input: c('input'),
        ring: c('ring'),
        card: { DEFAULT: c('card'), foreground: c('card-foreground') },
        popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
        primary: {
          DEFAULT: c('primary'),
          foreground: c('primary-foreground'),
          hover: c('primary-hover'),
          soft: c('primary-soft'),
          'soft-foreground': c('primary-soft-foreground')
        },
        secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
        muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
        subtle: { foreground: c('subtle-foreground') },
        accent: { DEFAULT: c('accent'), foreground: c('accent-foreground') },
        destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground') },
        ok: pair('ok'),
        warn: pair('warn'),
        bad: pair('bad'),
        info: pair('info'),
        purple: pair('purple')
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      width: {
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)'
      }
    }
  },
  plugins: [animate]
} satisfies Config;
