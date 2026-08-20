# be-workflow-service

Approval workflow engine. Chains are described by seeded **workflow definitions**, snapshotted onto
each request at creation, and driven by a configurable per-step action list.

- NestJS 11, Prisma 7, PostgreSQL 18, CQRS
- Verifies RS256 user tokens minted by `be-identity-service` (no network call, no JWKS polling)
- Verifies RS256 **service** tokens minted by executor services, using a **separate key pair**
- Resolves display names from `be-identity-service`, degrading to `null` when it is unreachable

## Quick start

```bash
docker compose up -d workflow-db
cp apps/be-workflow-service/.env.example apps/be-workflow-service/.env

# User token key: copy be-identity-service's JWT_PUBLIC_KEY_B64 verbatim.
# Service token key: a SEPARATE pair, generated once for the platform.
npm run keys:generate --workspace @fs-platform/be-identity-service -- --service

npm run db:migrate --workspace @fs-platform/be-workflow-service
npm run db:seed --workspace @fs-platform/be-workflow-service
npm run dev --workspace @fs-platform/be-workflow-service
```

Swagger is at http://localhost:3003/docs when `SWAGGER_ENABLED` is on.

## Domain model

| Concept                | Meaning                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `WorkflowDefinition`   | A seeded chain template. `generic-approval` (2 steps) and `two-stage-approval` (3 steps) ship by default.                   |
| `StepTemplate`         | One phase. `allowedActions` is a JSON list of `{ type, commentRequired }` — this is what makes the action set configurable. |
| `ApprovalRequest`      | One live request. Owns `status`, `currentStepIndex` and an optimistic `version`.                                            |
| `ApprovalStep`         | A **snapshot** of a step template taken at creation, so editing a definition can never disturb an in-flight request.        |
| `ApprovalTask`         | One row per (step, approver). The inbox is a single-table lookup on this.                                                   |
| `ApprovalHistoryEntry` | Append-only audit trail, identical for requestor and approvers.                                                             |

### Chain semantics

- Step 0 is a real `REQUESTOR` step, completed at creation with a `SUBMIT` history entry.
  `currentStepIndex` starts at 1.
- **Approve advances.** Approving the final step closes the request as `APPROVED`; approving any
  earlier step moves to the next one and records a `STEP_ADVANCED` entry with `actorRole: SYSTEM`.
- **Reject terminates** the whole request wherever it happens. Every step that had not completed is
  marked `CANCELLED`. A future `SEND_BACK` action is what would return to a previous step.
- **Any one approver wins.** When a step has several approvers, the first to act completes their task
  and every sibling task is marked `SKIPPED`.
- **Cancel is an ordinary action** with `actorRole: REQUESTOR`, listed per step. The shipped
  definitions allow it only on the first approver step, which is what limits cancelling to "before
  anyone acted".
- Two approvers acting at the same instant both read the same `version`; exactly one `updateMany`
  matches and the loser gets `409 Request was modified concurrently`.

### Adding an action

`ActionType` is a code enum with a strategy entry in
[src/approval-requests/domain/actions/action-registry.ts](src/approval-requests/domain/actions/action-registry.ts);
the _allow-list_ lives in the database. Adding `SEND_BACK` means one registry entry, one branch in
`ApprovalChain.apply`, one Prisma enum value, and a definition update — no controller or DTO change.

## Endpoints

| Method | Path                                                 | Auth                                                             |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/approval-requests`                                 | User token; requestor is the caller                              |
| GET    | `/approval-requests/inbox`                           | User token; requests awaiting the caller                         |
| GET    | `/approval-requests/outbox`                          | User token; requests raised by the caller                        |
| GET    | `/approval-requests/by-source?sourceType=&sourceId=` | User token                                                       |
| GET    | `/approval-requests/:id`                             | User token; chain, history and `availableActions` for the caller |
| POST   | `/approval-requests/:id/actions`                     | User token; `actionType` in the body                             |
| POST   | `/internal/approval-requests`                        | **Service token**; `requestorUserId` in the body                 |
| GET    | `/health`, `/health/ready`                           | Public                                                           |

There is deliberately **one** action endpoint rather than one route per verb — that is what keeps the
action list configurable instead of compiled in.

Anyone named anywhere in a chain can read it, including on steps already passed and not yet reached.
Everyone else gets **404, never 403**, so a stranger cannot probe for request ids.

### Learning the outcome

There are no webhooks and no message broker. An executor stores `sourceType`/`sourceId` on the
request and polls `GET /approval-requests/by-source`.

## Service-to-service authentication

Executor services mint their own tokens with a **second RS256 key pair that is not the one
`be-identity-service` uses for user tokens**. A leaked service key therefore reaches `/internal/*`
but can never forge a user login or an `ADMIN` role, because user tokens are signed with a different
key and carry a different audience.

A service token carries `sub` and `iss` of `svc:<service-name>` and `aud` of
`fs-platform-internal`. The requestor's id travels in the request **body**, not in the token: the
token says which service is calling, the body says which human the request is for.

```
npm run keys:generate --workspace @fs-platform/be-identity-service -- --service
# private key  -> the executor service only
# public key   -> SERVICE_JWT_PUBLIC_KEY_B64 here
```

## Display names

`UserDirectoryService` calls `GET /users?ids=` on `be-identity-service`, forwarding **the caller's
own bearer token** so identity's existing guard applies. Results are cached for
`USER_CACHE_TTL_SECONDS`. Any failure — timeout, 5xx, unreachable host — degrades to
`displayName: null` rather than failing the read; an inbox must not go down because a name lookup
did. Requests read by a service principal have no token to forward, so they always come back with
null names, which is expected.

## Configuration

| Variable                      | Default                | Notes                                                    |
| ----------------------------- | ---------------------- | -------------------------------------------------------- |
| `NODE_ENV`                    | `development`          |                                                          |
| `PORT`                        | `3003`                 |                                                          |
| `SWAGGER_ENABLED`             | `true`                 | Any value but `false`/`0` enables it                     |
| `LOG_LEVEL`                   | `info`                 |                                                          |
| `LOG_PRETTY`                  | `false`                | Opt in with `true`/`1`                                   |
| `DATABASE_URL`                | —                      | Required                                                 |
| `JWT_ISSUER`                  | —                      | Required; identity's address, not this service's         |
| `JWT_AUDIENCE`                | —                      | Required                                                 |
| `JWT_PUBLIC_KEY_B64`          | —                      | Required; base64 PEM, verification only                  |
| `JWT_PREVIOUS_PUBLIC_KEY_B64` | —                      | Optional; covers a rotation overlap                      |
| `JWT_KEY_ID`                  | —                      | Optional; overrides the RFC 7638 thumbprint              |
| `SERVICE_JWT_PUBLIC_KEY_B64`  | —                      | Required; must be a **different** pair from the user key |
| `SERVICE_JWT_AUDIENCE`        | `fs-platform-internal` |                                                          |
| `SERVICE_JWT_ISSUERS`         | —                      | Required; comma-separated allow-list                     |
| `IDENTITY_BASE_URL`           | —                      | Required                                                 |
| `IDENTITY_TIMEOUT_MS`         | `2000`                 |                                                          |
| `USER_CACHE_TTL_SECONDS`      | `60`                   |                                                          |

The service refuses to start if `SERVICE_JWT_PUBLIC_KEY_B64` equals `JWT_PUBLIC_KEY_B64`.

## Tests

```bash
npm test --workspace @fs-platform/be-workflow-service        # unit, no database
npm run test:e2e --workspace @fs-platform/be-workflow-service # needs a migrated, seeded database
```

The e2e setup mints throwaway user and service key pairs, and points `IDENTITY_BASE_URL` at an
unroutable address on purpose so the degrade-to-null path is exercised on every run.

## Troubleshooting

| Symptom                                                   | Cause                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SERVICE_JWT_PUBLIC_KEY_B64 must be a different key pair` | The user and service keys are the same pair. Generate a separate one with `--service`. |
| `401` on `/internal/*` with a valid user token            | Correct: the internal surface only accepts service tokens.                             |
| `409 Request was modified concurrently`                   | Another approver transitioned the request first. Re-read and retry.                    |
| All `displayName` values are null                         | Identity is unreachable, or the read was made by a service principal.                  |
| Type errors pointing at `src/generated/prisma`            | Stale client — run `npm run db:generate`.                                              |
