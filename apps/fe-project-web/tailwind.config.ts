import containerQueries from '@tailwindcss/container-queries';
import { theme } from 'fe-ui-kit/tailwind/config';
import scrollbar from 'tailwind-scrollbar';
import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

export default {
  // `relative` keeps the globs anchored to this file rather than the CWD Turbo/Vite happen to use.
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}', '../fe-ui-kit/index.es.js'],
  },
  theme: {
    spacing: { ...theme?.spacing },
    fontFamily: { 'adnoc-sans': ["'ADNOC Sans'"] },
    extend: {
      colors: { ...theme?.colors },
      screens: theme?.screens,
      containers: theme?.containers,
      boxShadow: theme?.boxShadow,
      fontSize: theme?.typography,
    },
  },
  plugins: [
    scrollbar,
    containerQueries,
    plugin(({ addVariant }) => {
      addVariant('dark-mode', '[data-theme="dark"] &');
      addVariant('supports-hover', '@media (hover: hover) and (pointer: fine)');
    }),
  ],
} satisfies Config;
