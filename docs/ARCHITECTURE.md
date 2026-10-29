# Architecture — EdTech CRM & Inquiry Management System

Status: **Stage 2 complete — foundation and database layer implemented.** Authentication, inquiry APIs, the public form and the dashboard are still to come.
Sections are marked **[Implemented]** or **[Planned]**.
Companion docs: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md).

---

## 1. System overview

```
┌──────────────────────────┐        HTTPS/JSON         ┌──────────────────────────────┐   TLS verify-full (pg)  ┌───────────────────────────┐
│  Frontend (Vercel)       │  ───────────────────────▶ │  Backend API (Render)        │ ──────────────────────▶ │  Supabase PostgreSQL      │
│  React + Vite SPA        │   Authorization: Bearer   │  Node.js + Express 5         │   Sequelize + pg        │  via Supavisor pooler     │
│                          │   <JWT> (admin routes)    │  Zod · bcrypt · jsonwebtoken │                         │  tables: admins,          │
│  /            form       │ ◀───────────────────────  │                              │ ◀────────────────────── │          inquiries        │
│  /admin/login            │        JSON responses     │  /api/health  /api/health/db │                         │  RLS enabled, no policies │
│  /admin       dashboard  │                           │  /api/auth/*  (planned)      │                         │  (blocks PostgREST/anon)  │
└──────────────────────────┘                           │  /api/inquiries/* (planned)  │                         └───────────────────────────┘
        ▲ dev: Vite proxies /api → localhost:4000      └──────────────────────────────┘
```

Hard boundaries:

- The **frontend never talks to the database** and holds no Supabase keys. Its only API setting is `VITE_API_BASE_URL` (default: same-origin `/api`).
- **Supabase is used purely as managed PostgreSQL.** Supabase Auth, the Supabase JS client and PostgREST are not used.
- Admin authentication is **custom**: bcrypt hashes in our own `admins` table, JWTs signed and verified by the backend.

---

## 2. Repository layout [Implemented — current files]

```
/
├── backend/
│   ├── src/
│   │   ├── app.js                       # createApp({ config, logger, checkDatabase }) — no listen, no DB connect
│   │   ├── server.js                    # dotenv → config → DB connect (retry) → listen → graceful shutdown
│   │   ├── config/
│   │   │   ├── env.js                   # dotenv loading + Zod validation; loadConfig() / loadDatabaseConfig()
│   │   │   └── database.js              # Sequelize options, TLS, connectWithRetry, checkConnection, error hints
│   │   ├── constants/inquiry.js         # USER_TYPES, CATEGORIES, INQUIRY_STATUSES, FIELD_LIMITS
│   │   ├── models/
│   │   │   ├── index.js                 # initModels(sequelize)
│   │   │   ├── Admin.js
│   │   │   ├── Inquiry.js
│   │   │   └── schemaComparison.js      # model ↔ information_schema comparison (db:check + tests)
│   │   ├── controllers/health.controller.js
│   │   ├── routes/
│   │   │   ├── index.js                 # mounted at /api
│   │   │   └── health.routes.js
│   │   ├── middleware/
│   │   │   ├── cors.js                  # allow-list from FRONTEND_URL
│   │   │   ├── requestLogger.js
│   │   │   ├── validate.js              # Zod → req.validated (Express 5 req.query is read-only)
│   │   │   ├── notFound.js
│   │   │   └── errorHandler.js
│   │   ├── validators/common.schema.js  # uuidParamSchema
│   │   └── utils/
│   │       ├── AppError.js
│   │       └── logger.js                # levelled logger; JSON lines in production
│   ├── scripts/
│   │   ├── db-migrate.js                # applies ../schema.sql
│   │   ├── db-check.js                  # read-only: models ↔ tables, RLS enabled
│   │   └── lib/withDatabase.js
│   ├── tests/
│   │   ├── helpers/testApp.js
│   │   ├── unit/                        # env, database, models, errorHandler, logger, validate
│   │   ├── api/                         # Supertest: health, CORS, 404, body parsing, headers
│   │   ├── schema/schema.test.js        # runs schema.sql in PGlite (real PostgreSQL in WASM)
│   │   └── integration/                 # real PostgreSQL; skipped unless TEST_DATABASE_URL is set
│   ├── certs/README.md                  # where to put the Supabase CA certificate
│   ├── eslint.config.js · vitest.config.js · package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx · App.jsx           # shell page with live API status
│   │   ├── config.js                    # API_BASE_URL from VITE_API_BASE_URL (default /api)
│   │   ├── api/client.js                # fetch wrapper: JSON, Bearer token, timeout, ApiError
│   │   ├── api/health.api.js
│   │   └── styles/global.css            # CSS variables, light/dark
│   ├── tests/                           # Vitest + Testing Library (jsdom)
│   ├── public/favicon.svg · index.html
│   ├── vite.config.js                   # React plugin, /api dev proxy, test config
│   ├── vercel.json                      # SPA rewrite + security headers
│   ├── .env.example · eslint.config.js · package.json
├── docs/
├── schema.sql                           # authoritative initial schema
├── .env.example                         # backend variables (copy to backend/.env)
├── .gitignore · .prettierrc.json · .prettierignore · .editorconfig · .nvmrc
├── LICENSE · README.md
```

Planned additions: `backend/src/{services,controllers,routes}/{auth,inquiry}.*`, `validators/{auth,inquiry}.schema.js`, `middleware/{authenticate,rateLimiters}.js`, `utils/{jwt,password,buildInquiryWhere}.js`, `scripts/seed-admin.js`; frontend `auth/`, `pages/`, `components/`, `hooks/`, `validation/`; `render.yaml`; `.github/workflows/ci.yml`.

Both packages are independent npm projects with ES modules (`"type": "module"`), so Render builds `backend/` and Vercel builds `frontend/` from a root-directory setting with no workspace tooling.

---

## 3. Data model [Implemented]

`schema.sql` is the source of truth. Sequelize models mirror it with **explicit `field` mappings** (camelCase attribute → snake_case column). `sequelize.sync()` is never used; the schema is applied by `npm run db:migrate` or by pasting `schema.sql` into the Supabase SQL editor. The file is wrapped in `BEGIN … COMMIT` and is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`).

Future schema changes will be added as numbered files under `migrations/`, because `CREATE TABLE IF NOT EXISTS` never alters an existing table.

### `admins`

| Column (attribute)              | Type          | Constraints                                                               |
|---------------------------------|---------------|---------------------------------------------------------------------------|
| `id` (`id`)                     | `uuid`        | PK, default `gen_random_uuid()`                                           |
| `email` (`email`)               | `text`        | NOT NULL, `UNIQUE`, must equal `lower(btrim(email))`, format + ≤ 254 chars |
| `password_hash` (`passwordHash`)| `text`        | NOT NULL, must match the bcrypt format `$2[aby]$NN$<53 chars>`            |
| `created_at` (`createdAt`)      | `timestamptz` | NOT NULL, default `now()`                                                 |

Emails are lower-cased before storage (model setter + CHECK), so `UNIQUE` is effectively case-insensitive. The bcrypt-format CHECK makes it impossible to store a plaintext password even by mistake. The model's default scope excludes `passwordHash`, and `toJSON()` strips it.

### `inquiries`

| Column (attribute)        | Type          | Constraints                                                                    |
|---------------------------|---------------|--------------------------------------------------------------------------------|
| `id` (`id`)               | `uuid`        | PK, default `gen_random_uuid()`                                                |
| `name` (`name`)           | `text`        | NOT NULL, 2–100 chars after trimming                                           |
| `email` (`email`)         | `text`        | NOT NULL, format + ≤ 254 chars                                                 |
| `phone` (`phone`)         | `text`        | NOT NULL, ≤ 20 chars, `^\+?[0-9() -]+$`, 7–15 digits                           |
| `user_type` (`userType`)  | `text`        | NOT NULL, `IN ('Parent','Student','School')`                                   |
| `category` (`category`)   | `text`        | NOT NULL, `IN ('Scholarship','Concert','Admission','General Query')`           |
| `message` (`message`)     | `text`        | NOT NULL, 1–2000 chars after trimming                                          |
| `status` (`status`)       | `text`        | NOT NULL, default `'New'`, `IN ('New','In Progress','Resolved')`               |
| `created_at` (`createdAt`)| `timestamptz` | NOT NULL, default `now()` — shown as **Date** on the dashboard                 |
| `updated_at` (`updatedAt`)| `timestamptz` | NOT NULL, default `now()`, refreshed by trigger `inquiries_set_updated_at`     |

Indexes: `inquiries_created_at_idx (created_at DESC)`, `inquiries_category_created_at_idx (category, created_at DESC)`, `inquiries_user_type_created_at_idx (user_type, created_at DESC)`. The composite indexes serve the dashboard's most common query: filter by category or user type, newest first, paginated. Trigram indexes for `ILIKE` name/phone search are deferred until data volume justifies them.

Decisions:
- **`text` + `CHECK` instead of Postgres `ENUM`**: the database still rejects invalid values, values can be changed by swapping a constraint, and Sequelize does not try to manage a custom type.
- **Phone stored as text**: keeps a leading `+` and zeros, and allows readable formatting.
- **Allowed values are defined once per layer** (`constants/inquiry.js`, the `schema.sql` CHECKs); `tests/schema/schema.test.js` reads the CHECK definitions back from PostgreSQL and fails if they differ from the constants.
- `set_updated_at()` is declared with `SET search_path = ''`, as Supabase's security linter recommends.

### Row Level Security

Supabase exposes every `public` table through its auto-generated REST API to anyone holding the anon key. `schema.sql` enables RLS on both tables **with no policies**, which denies all PostgREST access. The backend connects as the table owner (`postgres`), which bypasses RLS. `npm run db:check` fails if RLS is off.

---

## 4. Backend design

### Request pipeline [Implemented]

```
helmet (API CSP: default-src 'none') → requestLogger → cors(allow-list) → express.json({ limit: '20kb' })
  → /api router → notFound → errorHandler
```

Planned per-route chain: `[rate limiter] → [authenticate] → validate(zod) → controller → service → model`.

| Layer       | Knows about                | Must not            |
|-------------|----------------------------|---------------------|
| routes      | URL, middleware order      | contain logic       |
| middleware  | HTTP, JWT, Zod             | touch models        |
| controllers | `req`/`res`, status codes  | build queries       |
| services    | business rules, models     | know `req`/`res`    |
| models      | table mapping              | contain HTTP logic  |

`createApp()` receives its dependencies (`config`, `logger`, `checkDatabase`, and later services), so Supertest tests exercise the real middleware stack without a database. Express 5 forwards errors thrown in async handlers to the error handler automatically, so no `asyncHandler` wrapper is needed.

### Error envelope [Implemented]

`{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "path", "message" } ] } }`

| Source                                    | Status | Code                    |
|-------------------------------------------|--------|-------------------------|
| `AppError`                                | as set | as set                  |
| `ZodError`                                | 400    | `VALIDATION_ERROR`      |
| Malformed JSON / body > 20 kb             | 400 / 413 | `INVALID_JSON` / `PAYLOAD_TOO_LARGE` |
| Disallowed CORS origin                    | 403    | `CORS_ORIGIN_DENIED`    |
| Unknown route                             | 404    | `NOT_FOUND`             |
| Sequelize unique / validation             | 409 / 400 | `CONFLICT` / `VALIDATION_ERROR` |
| Sequelize connection error                | 503    | `DATABASE_UNAVAILABLE`  |
| Anything else                             | 500    | `INTERNAL_ERROR` (no internals in production; a `debug` message is included in development) |

5xx responses are logged at `error` level; 4xx at `debug`.

### API surface

| Method | Path                         | Auth | Purpose                                              | Status       |
|--------|------------------------------|------|------------------------------------------------------|--------------|
| GET    | `/api/health`                | none | liveness — process is serving; never touches the DB  | Implemented  |
| GET    | `/api/health/db`             | none | readiness — `SELECT 1` with 3 s timeout; 503 if down | Implemented  |
| POST   | `/api/inquiries`             | none | public form submission (rate-limited)                | Planned      |
| POST   | `/api/auth/login`            | none | email + password → JWT (rate-limited)                | Planned      |
| GET    | `/api/auth/me`               | JWT  | validate token, return current admin                 | Planned      |
| GET    | `/api/inquiries`             | JWT  | list with filters, search, pagination, sort          | Planned      |
| GET    | `/api/inquiries/:id`         | JWT  | single inquiry                                       | Planned      |
| PATCH  | `/api/inquiries/:id/status`  | JWT  | change status                                        | Planned      |

Liveness and readiness are separate on purpose: Render's health check uses `/api/health`, so a brief database outage reports degraded readiness instead of making Render restart a healthy process.

`GET /api/inquiries` query parameters (planned): `category`, `userType`, `status`, `search` (1–100 chars, name **or** phone), `page` (≥ 1, default 1), `pageSize` (1–100, default 20), `sortBy` (`createdAt` | `name`), `sortDir` (`asc` | `desc`). Response: `{ data, meta: { page, pageSize, total, totalPages } }`.

**Combining semantics:** filters are ANDed; within `search`, name and phone are ORed:

```
WHERE category = :category AND user_type = :userType AND status = :status   -- each only if provided
  AND ( name ILIKE :term OR phone ILIKE :term
        OR regexp_replace(phone, '\D', '', 'g') LIKE :digits )               -- digits clause if ≥ 3 digits
```

LIKE wildcards (`%`, `_`, `\`) are escaped and every value is a bound parameter.

### Request validation rules (planned, Zod)

| Field      | Rule                                                                         |
|------------|------------------------------------------------------------------------------|
| `userType` | required, enum                                                                |
| `category` | required, enum                                                                |
| `name`     | required, trimmed, 2–100 chars                                                |
| `email`    | required, trimmed, lower-cased, valid email, ≤ 254 chars                      |
| `phone`    | required, trimmed, `+ digits spaces - ( )`, ≤ 20 chars, 7–15 digits           |
| `message`  | required, trimmed, 10–2000 chars (stricter than the DB's 1–2000)              |

---

## 5. Authentication design [Planned]

### Credentials
- bcrypt hashes, cost `BCRYPT_SALT_ROUNDS` (default 12).
- **No registration endpoint.** `npm run seed:admin` reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` (or prompts), enforces ≥ 12-character passwords, hashes and upserts. The plain password is never logged.

### Login (`POST /api/auth/login`)
1. Zod-validate `{ email, password }`; lower-case the email.
2. Load the admin with `Admin.scope('withPassword')`.
3. `bcrypt.compare`; if no admin exists, compare against a fixed dummy hash so timing does not reveal which emails exist.
4. Any failure → `401 INVALID_CREDENTIALS` with one generic message. Rate-limited per IP.
5. Success → `{ token, expiresIn, admin: { id, email } }`.

### Token

| Property  | Value                                                                      |
|-----------|----------------------------------------------------------------------------|
| Algorithm | HS256, pinned in both `sign` and `verify`                                  |
| Secret    | `JWT_SECRET` — ≥ 32 chars and not the `.env.example` placeholder, or the server will not start **[Implemented]** |
| Claims    | `sub` (admin id), `email`, `iat`, `exp`, `iss`, `aud`                      |
| Lifetime  | `JWT_EXPIRES_IN` (format `15m`/`1h`/`7d`, validated at startup), default `1h` |

### `authenticate` middleware
1. Require `Authorization: Bearer <token>` → else `401 AUTH_REQUIRED`.
2. `jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience })` checks **signature and `exp`**.
3. `TokenExpiredError` → `401 TOKEN_EXPIRED`; anything else → `401 INVALID_TOKEN`.
4. Confirm the admin (`sub`) still exists → else `401 INVALID_TOKEN`. Deleting an admin revokes access immediately.
5. Set `req.admin = { id, email }`.

### Frontend session
Token in React state, mirrored to `sessionStorage`; `/api/auth/me` restores sessions; `ProtectedRoute` guards `/admin`; any `401` clears the session. `apiRequest()` already accepts a `token` and sends the Bearer header **[Implemented]**.

**Why a Bearer header instead of an httpOnly cookie:** the frontend (Vercel) and API (Render) are on different sites, so a cookie would need `SameSite=None; Secure` and is dropped by browsers that block third-party cookies. A Bearer token works across origins and avoids CSRF. The XSS exposure is mitigated by React's escaping, never using `dangerouslySetInnerHTML`, a frontend CSP (planned in `vercel.json`) and short token lifetimes.

---

## 6. Frontend design

**[Implemented]** Vite + React 19 (JavaScript). `App.jsx` is a shell page that calls `/api/health` and shows whether the API is reachable, which proves the proxy/base-URL wiring end to end. `api/client.js` provides:
- base URL from `VITE_API_BASE_URL`, defaulting to same-origin `/api`;
- JSON request/response handling and an optional Bearer token;
- a 30 s default timeout (Render free-tier cold starts) → `ApiError(code: 'TIMEOUT')`;
- network failures → `NETWORK_ERROR`; backend envelopes → `ApiError` with `status`, `code`, `details`;
- caller cancellation via `AbortSignal` rejects with `AbortError` so components can ignore it.

**[Planned]** Routes `/` (inquiry form), `/admin/login`, `/admin` (protected dashboard), `*`. Dashboard columns: Name · Phone · Email · User Type · Category · Date · Status; Category, User Type and Status filters; debounced name/phone search; filters kept in the URL query string; server-side pagination; status updates; responsive card layout under ~768 px.

---

## 7. Configuration [Implemented]

All backend variables are validated by Zod in `src/config/env.js` at startup. Every problem is reported at once and the process exits with code 1. Empty values count as unset.

| Variable                   | Required | Default        | Notes |
|----------------------------|----------|----------------|-------|
| `NODE_ENV`                 | no       | `development`  | `development` / `production` / `test` |
| `PORT`                     | no       | `4000`         | Render injects it |
| `DATABASE_URL`             | **yes**  | —              | must be `postgres://` or `postgresql://`; any `sslmode` parameter is ignored with a warning |
| `DATABASE_SSL_MODE`        | no       | `verify-full`  | `verify-full` / `require` / `disable` (`disable` is rejected in production) |
| `DATABASE_SSL_CA_PATH`     | no*      | —              | PEM file; relative paths resolve from `backend/` |
| `DATABASE_SSL_CA`          | no*      | —              | inline PEM (`\n` escapes allowed), handy on Render |
| `DATABASE_POOL_MAX`        | no       | `5`            | 1–50 |
| `DATABASE_CONNECT_RETRIES` | no       | `5`            | startup retries for transient errors, exponential backoff capped at 15 s |
| `JWT_SECRET`               | **yes**  | —              | ≥ 32 chars, not the placeholder |
| `JWT_EXPIRES_IN`           | no       | `1h`           | `<number><s|m|h|d>` |
| `FRONTEND_URL`             | **yes**  | —              | comma-separated http(s) origins for CORS; normalised (trailing slash and path removed) |
| `TRUST_PROXY`              | no       | `0`            | set `1` on Render (needed for correct client IPs in rate limiting) |
| `LOG_LEVEL`                | no       | `info`         | `error` / `warn` / `info` / `debug` / `silent`; `debug` also logs SQL |
| `TEST_DATABASE_URL`        | tests    | —              | enables `tests/integration` |
| `VITE_API_BASE_URL`        | frontend | `/api`         | absolute API URL in production |
| `DEV_API_PROXY_TARGET`     | frontend dev | `http://localhost:4000` | Vite proxy target; not exposed to the bundle |

\* Required in practice for Supabase with `verify-full` (see below).

Files: root `.env.example` → copy to `backend/.env`; `frontend/.env.example` → optional `frontend/.env.local`. All `.env*` files except examples are git-ignored. The backend reads only `backend/.env`.

### Database connection and TLS

- **Endpoint:** the Supavisor **session pooler** (`aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<project-ref>`). The direct host `db.<ref>.supabase.co` is IPv6-only on most plans and Render's outbound IPv6 is unreliable. The transaction pooler (6543) also works with `pg`, which does not use named prepared statements.
- **Certificate verification** (checked on 2026-10-29 with `openssl s_client -starttls postgres` against `aws-0-us-east-1.pooler.supabase.com`): the pooler presents `*.pooler.supabase.com` ← `Supabase Intermediate 2021 CA` ← **`Supabase Root 2021 CA` (self-signed, private)**. Node's default trust store therefore cannot verify it.
- **Decision:** the default is `verify-full` (`rejectUnauthorized: true` plus hostname check). The operator supplies Supabase's CA from the dashboard via `DATABASE_SSL_CA_PATH` or `DATABASE_SSL_CA`. The CA is public, so committing `backend/certs/supabase-ca.crt` is acceptable. `require` (encrypt but do not verify) exists only as an explicit opt-in and logs a warning at every startup. Verification is never disabled silently.
- **Why the URL is parsed manually:** `pg` lets an `sslmode` query parameter override explicit `ssl` options. `buildSequelizeOptions()` extracts host/port/user/password/database itself, so TLS is controlled only by `DATABASE_SSL_MODE`.
- **Connection behaviour:** pg `connectionTimeoutMillis` 10 s, `statement_timeout` 15 s, keep-alive, pool max `DATABASE_POOL_MAX`, `application_name=edtech-crm-api`.
- **Startup failure handling:** `connectWithRetry()` retries transient errors (`ECONNREFUSED`, `ETIMEDOUT`, DNS…) with backoff. It fails immediately on errors retrying cannot fix (bad password `28P01`, Supavisor "tenant or user not found", certificate errors, unknown database). Each failure is logged with host, port, database, SSL mode, error code and a specific hint, **never the connection string or password**. The process then exits with code 1, so Render restarts it rather than serving traffic without a database.

### Logging

`utils/logger.js`: levelled logger, pretty lines in development, one JSON object per line in production (Render log search). The request logger records method, **path only** (query strings may contain names or phone numbers), status and duration; health checks log at `debug`.

---

## 8. Security controls summary

| Threat                              | Control                                                                         | Status |
|-------------------------------------|---------------------------------------------------------------------------------|--------|
| Plaintext passwords in DB           | bcrypt-format CHECK on `password_hash`; model validation                        | Implemented |
| Password hash leakage               | default scope excludes it; `toJSON()` strips it                                 | Implemented |
| Credential theft from DB            | bcrypt cost 12                                                                  | Planned |
| Brute-force login                   | rate limiter; generic error; dummy-hash compare                                 | Planned |
| Token forgery / alg confusion       | HS256 pinned, ≥ 32-char non-placeholder secret, `iss`/`aud` checked             | Secret check implemented; rest planned |
| Expired / revoked tokens            | `exp` verified; admin existence re-checked                                      | Planned |
| SQL injection                       | Sequelize bound parameters only; LIKE wildcards escaped                         | Planned (no user queries yet) |
| Invalid data                        | Zod at the API; Sequelize validators; DB CHECK / NOT NULL constraints           | DB + model implemented; API planned |
| Oversized bodies                    | 20 kb JSON limit → 413                                                          | Implemented |
| Spam on public form                 | rate limiter on `POST /api/inquiries`                                           | Planned |
| Direct access via Supabase REST     | RLS enabled, no policies; frontend has no Supabase keys                         | Implemented |
| DB traffic interception / MITM      | TLS `verify-full` by default with Supabase CA; `sslmode` URL override ignored   | Implemented |
| Cross-origin abuse                  | CORS allow-list (`FRONTEND_URL`); others → 403                                  | Implemented |
| Header-based attacks                | Helmet on API (CSP `default-src 'none'`, HSTS, nosniff…); security headers in `vercel.json` | Implemented (frontend CSP planned) |
| Secret leakage                      | env-only config; `.gitignore`; credentials never logged; no internals in production errors | Implemented |

---

## 9. Deployment topology

| Component | Platform | Root dir   | Build           | Start / output        | Health check   | Status |
|-----------|----------|------------|-----------------|-----------------------|----------------|--------|
| API       | Render Web Service | `backend`  | `npm ci`        | `npm start`           | `/api/health`  | Scripts ready; `render.yaml` planned |
| SPA       | Vercel (Vite preset) | `frontend` | `npm run build` | `dist/` + SPA rewrite | —              | `vercel.json` ready |
| Database  | Supabase | —          | `schema.sql` via SQL editor or `npm run db:migrate` | — | `npm run db:check` | Ready to apply |

Release order: apply schema → `db:check` → seed admin → deploy API (`FRONTEND_URL` = Vercel URL, `TRUST_PROXY=1`, CA configured) → deploy frontend (`VITE_API_BASE_URL`) → smoke test.

- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting connections, close idle keep-alive sockets, close the DB pool, force-exit after 10 s.
- Render's free tier sleeps; the frontend's 30 s timeout tolerates a cold start.
- Node: `engines` `>=22.12.0` (Vite 8, Vitest 5, jsdom 30 minimums); `.nvmrc` pins **24** (LTS) for Render/Vercel. Local development on Node 26 is verified.
- `bcrypt` 6 ships N-API prebuilt binaries (including `linux-x64` for Render), so no compiler is needed at install time.
- `backend/package.json` has `"overrides": { "uuid": "^11.1.1" }`. Sequelize 6 pins `uuid@8`, which is affected by GHSA-w5hq-g745-h8pq (buffer bounds in v3/v5/v6). Sequelize only calls `v1()`/`v4()`, so the bug was not reachable, but the override clears `npm audit` without the downgrade to Sequelize 3 that `npm audit fix --force` proposes. uuid 11 keeps the CommonJS `v1`/`v4` exports Sequelize requires, and the full test suite passes with it. Remove the override when Sequelize updates its dependency.
