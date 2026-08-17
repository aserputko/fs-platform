# be-identity-service

Authentication and token issuance for the fs-platform. Issues RS256-signed access tokens and
publishes the matching public keys at `/.well-known/jwks.json`, so other services can verify tokens
without sharing a secret.

**Stack:** NestJS 11 · Prisma 7 · PostgreSQL 18 · Passport · argon2 · Swagger

---

## Prerequisites

| Tool   | Version    | Notes                                              |
| ------ | ---------- | -------------------------------------------------- |
| Node   | >= 22.12   | `.nvmrc` pins 24. Prisma 7 rejects older runtimes. |
| npm    | >= 10      | Workspaces are used for the monorepo.              |
| Docker | any recent | Runs PostgreSQL locally.                           |

---

## Setup

Run steps 1 and 2 from the repository root, the rest from `apps/be-identity-service`.

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up -d identity-db
```

This starts `postgres:18-alpine` on port 5432 with database `identity_db` (user `identity`,
password `identity`) and waits for a `pg_isready` healthcheck.

### 3. Create the environment file

```bash
cd apps/be-identity-service
cp .env.example .env
```

The defaults already match the Docker Compose database, so only the signing keys are missing.

### 4. Generate the RS256 key pair

```bash
npm run keys:generate
```

This writes `.keys/jwt.private.pem` and `.keys/jwt.public.pem` (both git-ignored) and prints two
lines. Copy them into `.env`, replacing the empty `JWT_PRIVATE_KEY_B64=` and `JWT_PUBLIC_KEY_B64=`
placeholders:

```
JWT_PRIVATE_KEY_B64=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...
JWT_PUBLIC_KEY_B64=LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0t...
```

Keys are stored base64-encoded because raw PEM newlines do not survive `.env` files or container
environment variables cleanly. The service refuses to start if the two keys are not a matching RSA
pair of at least 2048 bits.

### 5. Apply migrations

```bash
npm run db:migrate
```

### 6. Seed an admin user (optional)

```bash
npm run db:seed
```

Prints a randomly generated password once. Set `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` to choose
your own.

---

## Running

```bash
npm run dev     # watch mode on http://localhost:3001
```

Or a production-style run:

```bash
npm run build
npm run start
```

Swagger UI is served at http://localhost:3001/docs (disable with `SWAGGER_ENABLED=false`).

### Verify it works

```bash
curl http://localhost:3001/health/ready
curl http://localhost:3001/.well-known/jwks.json
```

---

## Endpoints

| Method | Path                     | Auth   | Description                                     |
| ------ | ------------------------ | ------ | ----------------------------------------------- |
| `POST` | `/auth/register`         | –      | Create an account, returns a token pair         |
| `POST` | `/auth/login`            | –      | Exchange credentials for a token pair           |
| `POST` | `/auth/refresh`          | –      | Rotate a refresh token                          |
| `POST` | `/auth/logout`           | –      | Revoke the refresh token chain                  |
| `GET`  | `/users/me`              | Bearer | Current user profile                            |
| `GET`  | `/.well-known/jwks.json` | –      | Public keys for verifying access tokens         |
| `GET`  | `/health`                | –      | Liveness probe                                  |
| `GET`  | `/health/ready`          | –      | Readiness probe, checks the database connection |

Every route is protected by a global guard; public routes opt out with the `@Public()` decorator.

### Token model

Access tokens are short-lived RS256 JWTs (15 minutes by default) carrying the signing `kid` in the
header. Refresh tokens are opaque random strings, stored only as SHA-256 hashes and rotated on every
use. Presenting an already-rotated refresh token is treated as a replay and revokes the entire token
chain for that login.

---

## Testing

```bash
npm test           # unit tests
npm run test:e2e   # end-to-end, needs the database running and migrated
```

The e2e suite mints a throwaway key pair when `JWT_PRIVATE_KEY_B64` is unset, so it also runs on a
clean checkout in CI.

---

## Scripts

| Script               | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `dev`                | Start in watch mode                                      |
| `dev:logs`           | Watch mode, mirroring raw JSON logs to `logs/` for Loki  |
| `build` / `start`    | Compile to `dist/`, then run it                          |
| `keys:generate`      | Create an RS256 key pair                                 |
| `db:generate`        | Regenerate the Prisma client into `src/generated/prisma` |
| `db:migrate`         | Create and apply a migration in development              |
| `db:migrate:deploy`  | Apply existing migrations (production)                   |
| `db:seed`            | Insert the admin user                                    |
| `lint` / `typecheck` | ESLint and `tsc --noEmit`                                |
| `test` / `test:e2e`  | Unit and end-to-end tests                                |

Prisma commands must run from this directory, because the Prisma CLI is installed in this workspace
package rather than at the repository root.

---

## Docker

Build and run the service image from the **repository root** (the build context is the monorepo, so
Turborepo can prune the workspace):

```bash
docker build -f apps/be-identity-service/Dockerfile -t be-identity-service .
```

Or run the whole stack, database included:

```bash
export JWT_PRIVATE_KEY_B64=... JWT_PUBLIC_KEY_B64=...
docker compose --profile full up --build
```

The runtime image runs as a non-root user and deliberately excludes the Prisma CLI, so apply
migrations from a separate job or init container with `db:migrate:deploy`.

---

## Logging

Logs are structured JSON on stdout (pino), one object per line, ready to ship to any log backend.
Set `LOG_PRETTY=true` locally for a readable rendering; never enable it in a deployed environment.

Every request produces an access log line whose level follows the outcome — `info` for 2xx/3xx,
`warn` for 4xx, `error` for 5xx. Failures additionally produce a line from the global exception
filter carrying the reason (4xx, `warn`) or the full stack (5xx, `error`). Health, JWKS and Swagger
routes are excluded from the access log so probes do not drown out real traffic.

```json
{
  "level": "warn",
  "time": "2026-08-17T20:54:38.244Z",
  "service": "be-identity-service",
  "env": "production",
  "req": { "id": "8e520b02-…", "method": "POST", "url": "/auth/login", "ip": "10.0.0.7" },
  "userId": "…",
  "statusCode": 401,
  "reason": "Invalid credentials",
  "message": "POST /auth/login rejected"
}
```

Every line carries `req.id`, taken from the caller's `x-request-id` header when it is a short opaque
token and generated otherwise. The id is echoed back in the `x-request-id` response header and in
the `requestId` field of every error body, so a client report can be traced to its log lines.

Request and response bodies are never logged, and credential-shaped fields (`password`,
`passwordHash`, `accessToken`, `refreshToken`, `token`, `authorization`, `cookie`) are redacted as a
second line of defence. Failed logins are logged without revealing whether the account exists.

Errors are returned in one shape, with internal failures reduced to a generic message:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid credentials",
  "requestId": "8e520b02-…",
  "path": "/auth/login",
  "timestamp": "2026-08-17T20:54:38.244Z"
}
```

### Observability stack

Logs are collected by [Grafana Alloy](https://grafana.com/docs/alloy/), stored in
[Loki](https://grafana.com/docs/loki/) and queried in Grafana. All three run from the repository
root behind an opt-in compose profile:

```bash
docker compose --profile observability up -d
```

| Service | URL                      |
| ------- | ------------------------ |
| Grafana | <http://localhost:3000>  |
| Loki    | <http://localhost:3100>  |
| Alloy   | <http://localhost:12345> |

Grafana needs no login locally and ships with the **be-identity-service / logs** dashboard and two
alert rules (error rate, and refresh-token replay) provisioned from
`observability/grafana/provisioning`. The alert rules evaluate against Loki but deliver nowhere
until a contact point is configured — their state is visible under _Alerting → Alert rules_.

Alloy collects from two places, so it works whether the service runs in Docker or on the host:

| Source            | How to produce it                                                            |
| ----------------- | ---------------------------------------------------------------------------- |
| `source="docker"` | `docker compose --profile full --profile observability up -d --build`        |
| `source="dev"`    | `npm run dev:logs`, which tees raw JSON to `logs/be-identity-service.ndjson` |

`dev:logs` forces `LOG_PRETTY=false` so the file stays machine-readable, then pipes through
`pino-pretty` so the terminal does not. It needs `tee`, so it is macOS/Linux only; plain `npm run
dev` is unchanged and simply does not reach Loki.

The application never talks to Loki — it keeps writing to stdout, and collection happens outside
the process. **Do not add a pino network transport**: it would put a network dependency on the hot
path and lose buffered lines on a crash.

Only `service`, `env` and `level` become Loki labels. `req.id`, `userId` and `statusCode` are
attached as structured metadata instead, which keeps them filterable without exploding the index.
Lines that are not JSON (Postgres, Nest CLI output) pass through unparsed.

```logql
{service="be-identity-service", level="error"}          # errors only
{service="be-identity-service"} | status_code = `401`   # by response status
{service="be-identity-service"} | req_id = `8e520b02-…` # every line of one request
{service="be-identity-service"} |= `Refresh token reuse detected`
```

---

## Configuration

| Variable                      | Required | Default             | Description                                          |
| ----------------------------- | -------- | ------------------- | ---------------------------------------------------- |
| `DATABASE_URL`                | yes      | –                   | PostgreSQL connection string                         |
| `JWT_PRIVATE_KEY_B64`         | yes      | –                   | Base64 PKCS#8 PEM signing key                        |
| `JWT_PUBLIC_KEY_B64`          | yes      | –                   | Base64 SPKI PEM verification key                     |
| `JWT_ISSUER`                  | yes      | –                   | `iss` claim, must match across services              |
| `JWT_AUDIENCE`                | yes      | –                   | `aud` claim                                          |
| `PORT`                        | no       | `3001`              | HTTP port                                            |
| `NODE_ENV`                    | no       | `development`       | `development` \| `test` \| `production`              |
| `SWAGGER_ENABLED`             | no       | `true`              | Set `false` to disable `/docs`                       |
| `LOG_LEVEL`                   | no       | `info`              | `fatal` … `trace`, or `silent`                       |
| `LOG_PRETTY`                  | no       | `false`             | Set `true` for human-readable local output           |
| `JWT_ACCESS_TTL`              | no       | `15m`               | Access token lifetime                                |
| `JWT_REFRESH_TTL_DAYS`        | no       | `30`                | Refresh token lifetime in days                       |
| `JWT_PREVIOUS_PUBLIC_KEY_B64` | no       | –                   | Retired public key, kept published during a rotation |
| `JWT_KEY_ID`                  | no       | RFC 7638 thumbprint | Overrides the derived `kid`                          |

### Rotating signing keys

1. Generate a new pair with `npm run keys:generate`.
2. Move the current `JWT_PUBLIC_KEY_B64` value to `JWT_PREVIOUS_PUBLIC_KEY_B64`.
3. Set the new pair as `JWT_PRIVATE_KEY_B64` / `JWT_PUBLIC_KEY_B64` and restart.

Both keys stay in the JWKS, so access tokens signed with the old key keep verifying until they
expire. Drop `JWT_PREVIOUS_PUBLIC_KEY_B64` after one access-token lifetime has passed.

---

## Troubleshooting

**`Environment variable not found: DATABASE_URL`** — `prisma.config.ts` resolves `DATABASE_URL`
eagerly, so even `prisma generate` needs it set. Make sure `.env` exists in this directory.

**`Invalid environment configuration: JWT_PRIVATE_KEY_B64`** — the key variables are still empty in
`.env`. See step 4.

**`JWT_PUBLIC_KEY_B64 does not match the key pair of JWT_PRIVATE_KEY_B64`** — the two values come
from different `keys:generate` runs. Regenerate and copy both lines together.

**`Can't reach database server at localhost:5432`** — the container is not up. Run
`docker compose up -d identity-db` and check `docker compose ps`.

**Type errors referencing `src/generated/prisma`** — the Prisma client is generated code and is not
committed. Run `npm run db:generate`.
