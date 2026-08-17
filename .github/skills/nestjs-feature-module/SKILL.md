---
name: nestjs-feature-module
description: Scaffold or review a NestJS feature module in this monorepo using the canonical CQRS + domain-model + repository layout of apps/be-identity-service/src/users. Use when adding a new feature/module/resource to an existing NestJS app, bootstrapping a new NestJS app under apps/, adding a command/query handler, adding a repository or domain model, or checking that an existing module follows the house architecture.
---

# NestJS feature module blueprint

`apps/be-identity-service/src/users` is the reference implementation. Every new feature module — in
any NestJS app under `apps/` — copies its shape. Read the real files before generating code; this
document describes the rules, the files are the source of truth.

## Folder layout

One folder per feature, directly under `src/`. No barrel `index.ts` files — import concrete paths.

```
src/<feature>/
  <feature>.module.ts        # declares controller + repository + every handler
  <feature>.controller.ts    # HTTP only: dispatch to CommandBus/QueryBus, return DTOs
  <feature>.repository.ts    # the ONLY file in the feature that touches Prisma
  <feature>.repository.spec.ts
  commands/
    <verb>-<entity>.command.ts       # Command class + @CommandHandler in one file
  queries/
    <verb>-<entity>.query.ts         # Query class + @QueryHandler in one file
    <verb>-<entity>.query.spec.ts
  domain/
    <entity>.model.ts        # entity + validation rules, zero framework imports
    <entity>.model.spec.ts
  dto/
    <name>.dto.ts            # request DTOs (class-validator) and response DTOs (@ApiProperty)
```

Add a folder only when the feature needs it — a read-only feature has no `commands/`.

## Rules

### Module

Register the controller, the repository, and every handler class explicitly in `providers`.
`CqrsModule.forRoot()` is registered once globally in `src/app.module.ts`; **never** import
`CqrsModule` in a feature module. Export the repository only if another module truly needs it —
prefer having the other module dispatch a query instead.

### Controller

- No business logic, no Prisma, no repository injection. Inject `CommandBus` / `QueryBus` only.
- Every route documented: `@ApiTags`, `@ApiOperation`, `@ApiOkResponse({ type: SomeDto })`, plus the
  error responses it can actually produce. Authenticated routes add `@ApiBearerAuth()`.
- Every route is guarded by the global `JwtAuthGuard`; opt out with `@Public()`, read the caller with
  `@CurrentUser()`.
- Return the DTO type directly (`Promise<UserDto>`), never a domain entity.

### Commands and queries

One file per operation, holding both the message class and its handler:

```ts
export class CreateUserCommand extends Command<User> {
  constructor(
    readonly email: string,
    readonly passwordHash: string,
    readonly displayName?: string,
  ) {
    super();
  }
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(private readonly users: UsersRepository) {}

  execute(command: CreateUserCommand): Promise<User> {
    const newUser = NewUser.create({ ... });

    return this.users.create(newUser);
  }
}
```

- Messages extend `Command<TResult>` / `Query<TResult>` from `@nestjs/cqrs` so `execute()` is typed.
- Handlers implement `ICommandHandler<TMessage, TResult>` / `IQueryHandler<TMessage, TResult>`.
- Handlers depend on the repository (and other injectables), never on Prisma directly.
- Handlers own _application_ concerns: NestJS HTTP exceptions (`NotFoundException`,
  `ConflictException`, …). Invariants belong in the domain model instead.
- Commands go through the domain model (`NewUser.create(...)`) before persisting.
- Return `Promise<T>` without `async` when you are just forwarding — matches the reference style.
- Name files `<verb>-<entity>.command.ts` / `.query.ts`; class names mirror the file.

### Domain model (`domain/`)

- Imports nothing from Prisma, NestJS, or any framework. Pure TypeScript.
- Entities have `private constructor` + static factories: `X.fromProps(props)` for persisted rows,
  `NewX.create(props)` for a validated, not-yet-persisted value (no `id`, no timestamps).
- Fields are `readonly`. Behaviour lives here (`get isAdmin()`, `canAuthenticate()`).
- Validation is exported `assertValidX(...)` helpers that return the normalized value and throw
  `DomainValidationError` (from `common/errors/domain-validation.error`). The global
  `DomainValidationFilter` turns those into 400s — do not throw HTTP exceptions from `domain/`.
- Normalizers (e.g. `normalizeEmail`) are exported so the repository can reuse them in `where`.

### Repository

- The only place in the feature that imports `PrismaService` or `../generated/prisma/client`.
- Maps Prisma records to the domain with a local `toDomain(record)` function; accepts and returns
  domain types (`NewUser`, `User`), never Prisma types, except…
- **Reads that need no business logic skip the domain**: project straight to the response DTO with a
  hoisted `const X_SELECT = { ... } as const` so secrets like `passwordHash` are never loaded.
- Response shapes are always an explicit whitelist (a `select` or a literal). Never spread an entity,
  never rely on `@Exclude`.
- Map known Prisma error codes (e.g. `P2002` → `ConflictException`) explicitly; never leak raw
  Prisma errors.

### DTOs

- Request DTOs: classes in `dto/` with `class-validator` decorators plus `@ApiProperty`. The global
  `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, `transform`, so undecorated fields
  are rejected.
- Response DTOs: classes with `@ApiProperty` / `@ApiPropertyOptional`, fields declared with `!`.
  They may import _types_ from `domain/` (`import type { Role } from '../domain/user.model'`).

### Tests

- Co-located `*.spec.ts`, no database. Mock collaborators as plain objects:
  `users = { findProfile: jest.fn() }` then `new GetUserProfileHandler(users as unknown as UsersRepository)`.
- Cover each handler's happy path and each failure branch; cover every domain validation rule.
- New endpoints or auth behaviour also need an e2e spec in `test/*.e2e-spec.ts`.

## New NestJS app under `apps/`

Mirror `apps/be-identity-service`: `package.json` extending the shared configs
(`@repo/eslint-config`, `@repo/tsconfig`), zod-validated env in `src/config/env.ts` read through
`ConfigService<Env, true>` with `{ infer: true }` (never `process.env`), a `@Global()` Prisma module,
`CqrsModule.forRoot()` + global `ValidationPipe` + `DomainValidationFilter` (`APP_FILTER`) +
`JwtAuthGuard` (`APP_GUARD`) in `app.module.ts`, then feature folders following the layout above.

## Checklist before declaring done

- [ ] Feature folder matches the layout; no `index.ts` barrels.
- [ ] Controller only dispatches through `CommandBus`/`QueryBus` and is fully Swagger-annotated.
- [ ] Every handler registered in the feature module; no per-module `CqrsModule` import.
- [ ] Prisma appears only in the repository; `domain/` imports no framework.
- [ ] Response shapes are explicit whitelists; no secret fields selected.
- [ ] Unit specs for handlers and domain rules; e2e spec for new endpoints.
- [ ] `npm run format:check && npm run lint && npm run typecheck && npm run build && npm test` pass.
