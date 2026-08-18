# fe-project-web

React 19 + Vite 7 + Tailwind CSS 3 + React Hook Form frontend for the project service.

## Setup

From the repo root:

```bash
npm install
```

## Scripts

Run from `apps/fe-project-web` (or via Turbo from the root):

| Script              | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Vite dev server on http://localhost:5173    |
| `npm run build`     | Type-checks, then builds to `dist/`         |
| `npm run preview`   | Serves the production build locally         |
| `npm run lint`      | ESLint (`@fs-platform/eslint-config/react`) |
| `npm run typecheck` | `tsc --noEmit`                              |

## Layout

```
index.html            Vite entry document
src/main.tsx          React root, imports Tailwind styles
src/app.tsx           Root component
src/index.css         Tailwind directives
tailwind.config.js    Tailwind 3 config (content globs)
postcss.config.js     Tailwind + autoprefixer PostCSS pipeline
```

Styling is Tailwind utility classes only — no CSS modules or styled-components. TypeScript config comes
from `@fs-platform/tsconfig/react.json`.
