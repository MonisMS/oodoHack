// Every Tailwind colour used by the screens is a theme token (see :root in src/styles.css), so one place controls the whole theme.
// Plain var() references: use arbitrary values (e.g. bg-[color-mix(in_srgb,var(--ink)_40%,transparent)]) where an opacity is needed.
const token = name => `var(--${name})`;

const scale = map => Object.fromEntries(Object.entries(map).map(([shade, name]) => [shade, token(name)]));

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: token('surface'),
        slate: scale({ 50: 'surface-muted', 100: 'surface-sunken', 200: 'line', 300: 'line-strong', 400: 'faint', 500: 'muted', 600: 'muted', 700: 'ink-soft', 800: 'ink-soft', 900: 'ink' }),
        brand: scale({ 50: 'accent-soft', 200: 'line-strong', 600: 'accent', 700: 'accent-dark' }),
        rose: scale({ 50: 'danger-soft', 200: 'danger-soft', 300: 'danger', 600: 'danger', 700: 'danger', 900: 'danger' }),
        emerald: scale({ 50: 'success-soft', 200: 'success-soft', 600: 'success', 700: 'success', 900: 'success' }),
        amber: scale({ 50: 'warning-soft', 200: 'warning-soft', 600: 'warning', 800: 'warning', 900: 'warning' }),
        sky: scale({ 50: 'info-soft', 200: 'info-soft', 600: 'info', 700: 'info', 900: 'info' }),
        violet: scale({ 50: 'info-soft', 600: 'info', 700: 'info' }),
      },
    },
  },
  plugins: [],
};
