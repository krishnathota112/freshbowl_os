import type { Config } from 'tailwindcss';

/**
 * Every value resolves to a CSS custom property from `src/theme/tokens.css`, so a Tailwind class
 * and a hand-written style can never disagree.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE NAMES ARE NESTED RATHER THAN camelCase
 *
 * This file used to declare `surface2`, `ink2`, `accentSoft`, `okSoft` and so on, which Tailwind
 * turns into `bg-surface2` and `text-ink2`. Components across the app — and everything generated
 * against the factory's own Material-style palette — write `bg-surface-2`, `text-ink-2`,
 * `bg-accent-soft`, `shadow-card`. Those classes did not exist, so Tailwind emitted nothing and the
 * elements rendered unstyled. Thirty-three uses of `bg-surface-2` alone were silently doing nothing.
 *
 * Nesting a colour under a `DEFAULT` key is what produces BOTH `bg-surface` and `bg-surface-2` from
 * one definition, so there is one source for the value and two ways to write it.
 *
 * `on-surface` / `on-surface-variant` / `on-accent` come from the Material naming the factory's own
 * build uses. They are the same tokens as `ink` / `muted`, named the second way so a screen lifted
 * from that build works without being rewritten.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        background: 'var(--paper)',

        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },

        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
        },
        // Material naming for the same two tokens.
        'on-surface': {
          DEFAULT: 'var(--ink)',
          variant: 'var(--ink-2)',
        },
        'on-background': 'var(--ink)',

        muted: {
          DEFAULT: 'var(--muted)',
          // shadcn's name for the same thing, used in a few screens.
          foreground: 'var(--muted)',
        },

        line: {
          DEFAULT: 'var(--line)',
          2: 'var(--line-2)',
        },
        outline: {
          DEFAULT: 'var(--line-2)',
          variant: 'var(--line-2)',
        },

        accent: {
          DEFAULT: 'var(--accent)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
          strong: 'var(--accent-strong)',
        },
        primary: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
        },
        'on-accent': 'var(--on-accent)',
        'on-primary': 'var(--on-accent)',

        ok: { DEFAULT: 'var(--ok)', soft: 'var(--ok-soft)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
        crit: { DEFAULT: 'var(--crit)', soft: 'var(--crit-soft)' },
        error: { DEFAULT: 'var(--crit)', soft: 'var(--crit-soft)' },
        lock: { DEFAULT: 'var(--lock)', soft: 'var(--lock-soft)' },
        // `inherit` is a CSS keyword, so the resting token cannot use that name directly.
        resting: { DEFAULT: 'var(--inherit)', soft: 'var(--inherit-soft)' },
        inherit2: 'var(--inherit)',
        inheritSoft: 'var(--inherit-soft)',
      },

      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
      },

      borderRadius: {
        card: 'var(--radius-card)',
      },

      fontFamily: {
        head: 'var(--font-head)',
        body: 'var(--font-body)',
        sans: 'var(--font-body)',
        mono: 'var(--font-mono)',
        display: 'var(--font-display)',
      },
    },
  },
  plugins: [],
} satisfies Config;
