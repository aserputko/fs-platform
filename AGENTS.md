# fs-platform

Turborepo + npm workspaces monorepo. Node >= 22.12 (`.nvmrc` pins 24, `.npmrc` sets `engine-strict=true`).

| Path                       | What it is                                                             |
| -------------------------- | ---------------------------------------------------------------------- |
| `apps/be-identity-service` | NestJS 11 auth service (Prisma 7, PostgreSQL 18, RS256 JWT + JWKS)     |
| `packages/eslint-config`   | Shared flat ESLint configs (`base.js`, `nest.js`)                      |
| `packages/tsconfig`        | Shared TS configs (`base.json`, `nestjs.json`)                         |
| `observability/`           | Loki, Alloy and Grafana config for the `observability` compose profile |

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

## Service conventions (any NestJS app under `apps/`)

**[apps/be-identity-service/src/users](apps/be-identity-service/src/users) is the canonical blueprint.** Every new
feature module — and every new NestJS app added under `apps/` — copies its folder structure and layering. Follow
[.github/skills/nestjs-feature-module/SKILL.md](.github/skills/nestjs-feature-module/SKILL.md) when scaffolding or
reviewing one; the rules below are the summary.

- Folder per feature (`auth/`, `users/`, `keys/`, `health/`, `prisma/`, `common/`). No barrel `index.ts` files —
  import concrete paths.
- Feature layout: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.repository.ts`, `commands/`, `queries/`,
  `domain/`, `dto/`, with co-located `*.spec.ts`. Add a folder only when the feature needs it.
- Features follow CQRS: `commands/` and `queries/` hold one `@nestjs/cqrs` message class plus its handler per file,
  `<feature>.repository.ts` is the only place that touches Prisma, and `domain/<entity>.model.ts` owns the entity plus
  its validation rules. Controllers dispatch through `CommandBus`/`QueryBus` — do not add a `<Feature>Service`.
  `CqrsModule.forRoot()` is registered once (globally) in
  [src/app.module.ts](apps/be-identity-service/src/app.module.ts); do not import `CqrsModule` per feature module.
- Register the controller, repository, and every handler explicitly in the feature module's `providers`.
- Domain files import neither Prisma nor Nest: the repository maps `UserRecord` → `User.fromProps`, and domain rules
  throw `DomainValidationError`, which `DomainValidationFilter` (an `APP_FILTER`) turns into a 400. Keep it that way.
- Reads that need no business logic skip the domain: `findProfile` projects straight to `UserDto` with a Prisma
  `select`, so `passwordHash` is never loaded. Keep response shapes an explicit whitelist (a `select` or a literal) —
  never spread an entity and never rely on `@Exclude`.
- Env is validated with **zod** in [src/config/env.ts](apps/be-identity-service/src/config/env.ts); add new variables to that
  schema, to `.env.example`, and to the README's configuration table. Read them via `ConfigService<Env, true>` with
  `{ infer: true }`, not `process.env`.
- Request DTOs are classes in `dto/` using `class-validator` + `@ApiProperty`. The global `ValidationPipe`
  (`whitelist`, `forbidNonWhitelisted`, `transform`) means undecorated fields are rejected.
- Every route is guarded by the global `JwtAuthGuard` registered as `APP_GUARD` in
  [src/app.module.ts](apps/be-identity-service/src/app.module.ts). Opt out with `@Public()`; read the caller with `@CurrentUser()`.
- Logging is structured JSON via `nestjs-pino`, configured once in
  [src/logging/logging.module.ts](apps/be-identity-service/src/logging/logging.module.ts). Never log request bodies or
  credentials, and never `console.log`; use `new Logger(X.name)` from `@nestjs/common` with an object first argument
  (`logger.warn({ familyId }, 'Refresh token reuse detected')`) so fields stay queryable. Handlers do not log their own
  failures — `AllExceptionsFilter` logs every 4xx as `warn` and every 5xx as `error` and owns the error response shape.
  Global filters are matched in reverse registration order, so `AllExceptionsFilter` must stay listed before
  `DomainValidationFilter`.
- Logs are collected outside the process: Alloy → Loki → Grafana, started with
  `docker compose --profile observability up -d` and configured under [observability/](observability).
  Never add a pino network transport. Only `service`, `env` and `level` are Loki labels; `req.id`,
  `userId` and `statusCode` are structured metadata, so adding a high-cardinality field to
  `observability/alloy/config.alloy`'s `stage.labels` is a bug.
- Prisma types and the client come from `../generated/prisma/client`; `PrismaService` is provided by a `@Global()` module.
- Throw NestJS HTTP exceptions (`ConflictException`, `UnauthorizedException`, …) rather than raw `Error`; map known
  Prisma error codes (e.g. `P2002`) explicitly.
- Auth code deliberately keeps timing constant (decoy argon2 hash for unknown users) and stores refresh tokens only as
  SHA-256 hashes with replay detection. Preserve those properties when editing `auth/`.
- A new app under `apps/` mirrors `be-identity-service`'s wiring: shared `@repo/eslint-config` / `@repo/tsconfig`,
  zod-validated env, a `@Global()` Prisma module, and `CqrsModule.forRoot()`, `ValidationPipe`,
  `DomainValidationFilter`, and `JwtAuthGuard` registered once in `app.module.ts`.

## Tests

- Unit tests are co-located `src/**/*.spec.ts` and mock `PrismaService`/`JwtService` — they must not need a database.
- E2E specs live in `test/*.e2e-spec.ts`, hit a real database, and run `--runInBand` because they share state;
  [test/setup-e2e.ts](apps/be-identity-service/test/setup-e2e.ts) mints throwaway keys when none are configured.
- New endpoints or auth behaviour changes need an e2e spec; new service logic needs a unit spec.
