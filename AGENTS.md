# fs-platform

Turborepo + npm workspaces monorepo. Node >= 22.12 (`.nvmrc` pins 24, `.npmrc` sets `engine-strict=true`).

| Path                       | What it is                                                         |
| -------------------------- | ------------------------------------------------------------------ |
| `apps/be-identity-service` | NestJS 11 auth service (Prisma 7, PostgreSQL 18, RS256 JWT + JWKS) |
| `packages/eslint-config`   | Shared flat ESLint configs (`base.js`, `nest.js`)                  |
| `packages/tsconfig`        | Shared TS configs (`base.json`, `nestjs.json`)                     |

Service setup, endpoints, env vars, key rotation and troubleshooting live in
[apps/be-identity-service/README.md](apps/be-identity-service/README.md) — read it before changing that app;
update it when behaviour, scripts, or configuration change.

## Build and test

Run from the repo root (Turbo fans out to workspaces):

```bash
npm run lint && npm run typecheck && npm run build && npm test
npm run format          # Prettier write; format:check is what CI runs
npm run test:e2e        # needs a running, migrated database
```

Prisma commands run from `apps/be-identity-service` (the Prisma CLI is installed there, not at the root):
`npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run keys:generate`.
Exception: `npm run db:migrate` also works from the root (it delegates via `--workspace`).

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs, in order:
`format:check` → `lint` → `typecheck` → `build` → `test` → `db:migrate:deploy` → `test:e2e`.
Match that order locally before declaring work done.

## Non-obvious rules

- `apps/be-identity-service/src/generated/prisma/**` is generated and git-ignored. Never edit it; run
  `npm run db:generate` after touching `prisma/schema.prisma`. Type errors pointing there mean the client is stale.
- `DATABASE_URL` must be set even for `prisma generate` — `prisma.config.ts` resolves it eagerly.
- Local dev requires `apps/be-identity-service/.env` (copy `.env.example`) plus an RS256 key pair from
  `npm run keys:generate`. Never commit `.env`, `.keys/`, or `*.pem`.
- Schema changes need a migration in `prisma/migrations/`; never hand-edit `migration_lock.toml` or applied migrations.
- Commits are validated by commitlint (conventional commits) and `lint-staged` via husky. Don't bypass with `--no-verify`.
- Formatting is Prettier's job — don't hand-align code or add style-only edits.

## Service conventions (`apps/be-identity-service/src`)

- Folder per feature (`auth/`, `users/`, `keys/`, `health/`, `prisma/`, `common/`). No barrel `index.ts` files —
  import concrete paths.
- Env is validated with **zod** in [src/config/env.ts](apps/be-identity-service/src/config/env.ts); add new variables to that
  schema, to `.env.example`, and to the README's configuration table. Read them via `ConfigService<Env, true>` with
  `{ infer: true }`, not `process.env`.
- Request DTOs are classes in `dto/` using `class-validator` + `@ApiProperty`. The global `ValidationPipe`
  (`whitelist`, `forbidNonWhitelisted`, `transform`) means undecorated fields are rejected.
- Every route is guarded by the global `JwtAuthGuard` registered as `APP_GUARD` in
  [src/app.module.ts](apps/be-identity-service/src/app.module.ts). Opt out with `@Public()`; read the caller with `@CurrentUser()`.
- Prisma types and the client come from `../generated/prisma/client`; `PrismaService` is provided by a `@Global()` module.
- Throw NestJS HTTP exceptions (`ConflictException`, `UnauthorizedException`, …) rather than raw `Error`; map known
  Prisma error codes (e.g. `P2002`) explicitly.
- Auth code deliberately keeps timing constant (decoy argon2 hash for unknown users) and stores refresh tokens only as
  SHA-256 hashes with replay detection. Preserve those properties when editing `auth/`.

## Tests

- Unit tests are co-located `src/**/*.spec.ts` and mock `PrismaService`/`JwtService` — they must not need a database.
- E2E specs live in `test/*.e2e-spec.ts`, hit a real database, and run `--runInBand` because they share state;
  [test/setup-e2e.ts](apps/be-identity-service/test/setup-e2e.ts) mints throwaway keys when none are configured.
- New endpoints or auth behaviour changes need an e2e spec; new service logic needs a unit spec.
