import type { Config } from 'tailwindcss';

// Every value resolves to a CSS custom property from src/theme/tokens.css,
// so a Tailwind class and a hand-written style can never disagree.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        ink: 'var(--ink)',
        ink2: 'var(--ink-2)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        line2: 'var(--line-2)',
        accent: 'var(--accent)',
        accentInk: 'var(--accent-ink)',
        accentSoft: 'var(--accent-soft)',
        ok: 'var(--ok)',
        okSoft: 'var(--ok-soft)',
        warn: 'var(--warn)',
        warnSoft: 'var(--warn-soft)',
        crit: 'var(--crit)',
        critSoft: 'var(--crit-soft)',
        inherit2: 'var(--inherit)',
        inheritSoft: 'var(--inherit-soft)',
        lock: 'var(--lock)',
        lockSoft: 'var(--lock-soft)',
      },
      fontFamily: {
        head: 'var(--font-head)',
        body: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
} satisfies Config;
