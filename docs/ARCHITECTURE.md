# Architecture — EdTech CRM & Inquiry Management System

Status: **Stage 6 complete: all mandatory features are implemented (public form and API, custom cookie-JWT admin auth, admin dashboard with server-side filters, search, pagination and status management).** Still to come: deployment config and CI.
Sections are marked **[Implemented]** or **[Planned]**.
Companion docs: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md).

---

## 1. System overview

```
┌──────────────────────────┐        HTTPS/JSON         ┌──────────────────────────────┐   TLS verify-full (pg)  ┌───────────────────────────┐
│  Frontend (Vercel)       │  ───────────────────────▶ │  Backend API (Render)        │ ──────────────────────▶ │  Supabase PostgreSQL      │
│  React + Vite SPA        │  same-origin /api (proxy) │  Node.js + Express 5         │   Sequelize + pg        │  via Supavisor pooler     │
│                          │  Cookie: HttpOnly JWT     │  Zod · bcrypt · jsonwebtoken │                         │  tables: admins,          │
│  /            form       │ ◀───────────────────────  │                              │ ◀────────────────────── │          inquiries        │
│  /admin/login            │        JSON responses     │  /api/health  /api/health/db │                         │  RLS enabled, no policies │
│  /admin       dashboard  │                           │  POST /api/inquiries (public)│                         │  (blocks PostgREST/anon)  │
└──────────────────────────┘                           │  /api/auth/*, admin /inquiries│                         └───────────────────────────┘
        ▲ dev: Vite proxies /api → localhost:4000      └──────────────────────────────┘
```

Hard boundaries:

- The **frontend never talks to the database** and holds no Supabase keys. Its only API setting is `VITE_API_BASE_URL` (default: same-origin `/api`).
- **Supabase is used purely as managed PostgreSQL.** Supabase Auth, the Supabase JS client and PostgREST are not used.
- Admin authentication is **custom**: bcrypt hashes in our own `admins` table, JWTs signed and verified by the backend and carried in an HttpOnly cookie that JavaScript cannot read.

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
│   │   ├── constants/auth.js            # ADMIN_ROLE, PASSWORD_POLICY
│   │   ├── controllers/
│   │   │   ├── health.controller.js
│   │   │   ├── inquiry.controller.js    # public create + admin list / show / updateStatus
│   │   │   └── auth.controller.js       # login (sets cookie), logout (revokes + clears), me
│   │   ├── services/
│   │   │   ├── inquiry.service.js       # createInquiry (dedupe), listInquiries, getInquiry, updateInquiryStatus
│   │   │   ├── auth.service.js          # login (bcrypt + dummy hash), authenticate (verify → revocation → admin), logout
│   │   │   ├── admin.service.js         # createAdminAccount (policy, bcrypt, duplicate handling)
│   │   │   ├── admin.repository.js      # admin lookups for auth (hash only for login)
│   │   │   └── tokenRevocation.js       # in-memory revoked jti list
│   │   ├── routes/
│   │   │   ├── index.js                 # mounted at /api
│   │   │   ├── health.routes.js
│   │   │   ├── auth.routes.js           # POST /login, POST /logout, GET /me
│   │   │   └── inquiry.routes.js        # POST / public; GET /, GET /:id, PATCH /:id/status admin-only
│   │   ├── middleware/
│   │   │   ├── cors.js                  # allow-list from FRONTEND_URL, credentials
│   │   │   ├── requestLogger.js
│   │   │   ├── validate.js              # Zod → req.validated (Express 5 req.query is read-only)
│   │   │   ├── requireJson.js           # 415 unless Content-Type is application/json
│   │   │   ├── rateLimiters.js          # inquiry submission + login limiters (express-rate-limit)
│   │   │   ├── authenticate.js          # cookie JWT → req.auth; requireRole → 403
│   │   │   ├── requireTrustedOrigin.js  # Origin/Referer allow-list for unsafe requests (CSRF)
│   │   │   ├── notFound.js
│   │   │   └── errorHandler.js
│   │   ├── validators/
│   │   │   ├── common.schema.js         # uuidParamSchema
│   │   │   ├── inquiry.schema.js        # create, list query, status update
│   │   │   └── auth.schema.js           # loginSchema, adminEmailSchema, validateNewPassword
│   │   └── utils/
│   │       ├── jwt.js                   # createTokenService: issue / verify (HS256 pinned)
│   │       ├── password.js              # bcrypt hash / verify / dummy hash
│   │       ├── authCookie.js            # set / clear / read the session cookie (shared options)
│   │       ├── AppError.js
│   │       └── logger.js                # levelled logger; JSON lines in production
│   ├── scripts/
│   │   ├── db-migrate.js                # applies ../schema.sql
│   │   ├── db-check.js                  # read-only: models ↔ tables, RLS enabled
│   │   ├── createAdmin.js               # npm run admin:create — the only way to create an admin
│   │   ├── dev-memory.js                # npm run dev:memory — API + in-memory PostgreSQL for local development
│   │   └── lib/withDatabase.js
│   ├── tests/
│   │   ├── helpers/testApp.js
│   │   ├── unit/                        # env, database, models, errors, logger, validate, inquiry schema, auth (bcrypt, JWT, roles, origin)
│   │   ├── api/                         # Supertest, real auth over in-memory admins: health, CORS, inquiries, auth, admin routes
│   │   ├── database/                    # real app + Sequelize + pg → in-process PGlite: inquiries, admins, createAdmin script, sessions
│   │   ├── schema/schema.test.js        # runs schema.sql in PGlite (real PostgreSQL in WASM)
│   │   └── integration/                 # real PostgreSQL; skipped unless TEST_DATABASE_URL is set
│   ├── certs/README.md                  # where to put the Supabase CA certificate
│   ├── eslint.config.js · vitest.config.js · package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx · App.jsx · routes.jsx  # router setup and route tree
│   │   ├── config.js                    # API_BASE_URL from VITE_API_BASE_URL (default /api)
│   │   ├── api/                         # client.js (Axios, ApiError, 401 listener), inquiries.api.js, auth.api.js
│   │   ├── auth/                        # AuthProvider, authContext, useAuth, AdminSession, ProtectedRoute
│   │   ├── pages/                       # InquiryPage, LoginPage, AdminDashboardPage, NotFoundPage, RouteErrorPage
│   │   ├── components/                  # layout/ (Public/Admin layouts, Brand, SkipLink), form/fields.jsx, ui/ (Button, Alert, StatusScreen)
│   │   ├── constants/inquiry.js · validation/  # mirrored allowed values; Zod schemas for the forms
│   │   ├── lib/apiErrors.js             # user-facing error messages, server field-error mapping
│   │   └── styles/global.css            # design tokens, light/dark, components
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

Planned additions: `utils/buildInquiryWhere.js` (dashboard filters and search); frontend `auth/`, `pages/`, `components/`, `hooks/`, `validation/`; `render.yaml`; `.github/workflows/ci.yml`.

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

Success: `{ "success": true, "message": "…", "data": { … } }`
Error: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "field", "message" } ] } }`

`details` has one entry per field (the first problem found), one entry per unknown field (`Unknown field "status" is not allowed`), and entries without `field` for problems with the body as a whole.

| Source                                    | Status | Code                    |
|-------------------------------------------|--------|-------------------------|
| `AppError`                                | as set | as set                  |
| `ZodError`                                | 400    | `VALIDATION_ERROR`      |
| Malformed JSON / body > 20 kb             | 400 / 413 | `INVALID_JSON` / `PAYLOAD_TOO_LARGE` |
| Body not declared as JSON                 | 415    | `UNSUPPORTED_MEDIA_TYPE` |
| Rate limit exceeded                       | 429    | `RATE_LIMITED` (+ `Retry-After`, `RateLimit`, `RateLimit-Policy`) |
| Disallowed CORS origin                    | 403    | `CORS_ORIGIN_DENIED`    |
| Unknown route                             | 404    | `NOT_FOUND`             |
| Sequelize unique / validation             | 409 / 400 | `CONFLICT` / `VALIDATION_ERROR` |
| Sequelize connection / timeout error, or PostgreSQL `57014`, `57P01–03`, `53300`, `40001`, `40P01` | 503 | `DATABASE_UNAVAILABLE` |
| Other database error                      | 500    | `DATABASE_ERROR`        |
| Anything else                             | 500    | `INTERNAL_ERROR`        |

Responses never contain `err.message`, SQL, stack traces or connection details, in any environment. 5xx responses are logged at `error` level with the full error; 4xx at `debug`.

### API surface

| Method | Path                         | Auth | Purpose                                              | Status       |
|--------|------------------------------|------|------------------------------------------------------|--------------|
| GET    | `/api/health`                | none | liveness — process is serving; never touches the DB  | Implemented  |
| GET    | `/api/health/db`             | none | readiness — `SELECT 1` with 3 s timeout; 503 if down | Implemented  |
| POST   | `/api/inquiries`             | none | public form submission (rate-limited, deduplicated)  | Implemented  |
| POST   | `/api/auth/login`            | none (origin-checked) | email + password → session cookie (rate-limited) | Implemented |
| POST   | `/api/auth/logout`           | cookie (origin-checked) | revoke token, clear cookie (idempotent)      | Implemented  |
| GET    | `/api/auth/me`               | cookie | current admin identity                             | Implemented  |
| GET    | `/api/inquiries`             | cookie, role `admin` | filters, search, whitelisted sort, pagination (see below) | Implemented |
| GET    | `/api/inquiries/:id`         | cookie, role `admin` | single inquiry; 404 if unknown           | Implemented  |
| PATCH  | `/api/inquiries/:id/status`  | cookie, role `admin`, origin-checked | `{ status }` → updated inquiry | Implemented |

Liveness and readiness are separate on purpose: Render's health check uses `/api/health`, so a brief database outage reports degraded readiness instead of making Render restart a healthy process.

`GET /api/inquiries` query parameters **[Implemented]**:
- `category` and `userType`, each one allowed value; `status` is optional too.
- `search`, up to 100 characters, matched against name **or** phone.
- `page` (≥ 1, default 1) and `pageSize` (1–100, default 20).
- `sortBy`, whitelisted: `createdAt` / `name` / `category` / `userType` / `status`; `sortDir` is `asc` or `desc` (default `createdAt desc`, with `createdAt` and `id` tie-breakers).

Blank values mean "no filter". Repeated or unknown parameters return 400. The response is `{ success, data: [{ id, name, email, phone, userType, category, status, createdAt, updatedAt }], meta: { page, pageSize, total, totalPages, hasPreviousPage, hasNextPage, filters, sort } }`. `total` is counted with the same filters, so pagination never drops them. The message is not part of the list; `GET /api/inquiries/:id` returns it.

**Combining semantics:** filters are ANDed; within `search`, name and phone are ORed:

```
WHERE category = :category AND user_type = :userType AND status = :status   -- each only if provided
  AND ( name ILIKE :term OR phone ILIKE :term
        OR regexp_replace(phone, '\D', '', 'g') LIKE :digits )               -- digits clause if ≥ 3 digits
```

LIKE wildcards (`%`, `_`, `\`) are escaped and every value is a bound parameter.

### `POST /api/inquiries` [Implemented]

Pipeline: `inquirySubmissionLimiter` → `requireJson` (415) → `validate({ body: createInquirySchema })` (400) → `inquiryController.create` → `inquiryService.createInquiry`.

| Outcome | Status | Body |
|---------|--------|------|
| Stored | 201 | `{ success: true, message: "Thank you! Your inquiry has been received.", data: { id, duplicate: false } }` |
| Identical submission within the duplicate window | 200 | `{ success: true, message: "We have already received this inquiry…", data: { id: <existing>, duplicate: true } }` |
| Invalid | 400 | field errors |
| Too many submissions | 429 | `RATE_LIMITED` |
| Database unavailable / failed | 503 / 500 | generic message; nothing reported as saved |

- **Mass assignment:** `z.strictObject` rejects unknown keys (such as `status`, `id` or timestamps) with a 400. The service also passes an explicit field allow-list to `Inquiry.create(values, { fields })`.
- **Repeated submissions:** inside one transaction the service takes `pg_advisory_xact_lock(hashtextextended(<all six values>))`. It then looks for an identical inquiry created within `INQUIRY_DUPLICATE_WINDOW_MINUTES` (default 10) and either returns it or inserts. Double clicks and client retries therefore produce a single row, even when the requests arrive concurrently. Setting the window to 0 disables the check.
- **Success only after commit:** the 201/200 response is sent only after the transaction commits.
- **Rate limit:** per client IP, `INQUIRY_RATE_LIMIT_MAX` (default 10) per `INQUIRY_RATE_LIMIT_WINDOW_MINUTES` (default 15), using the in-memory store (one API instance; use a shared store if the API is scaled out). Requests that fail validation count. Requests rejected earlier by the JSON parser (malformed or oversized) do not reach the limiter, but they never reach the database either. Behind Render's proxy, `TRUST_PROXY=1` is required so the limiter sees real client IPs.

### Request validation rules [Implemented for `POST /api/inquiries`]

| Field      | Rule                                                                         |
|------------|------------------------------------------------------------------------------|
| `userType` | required, enum                                                                |
| `category` | required, enum                                                                |
| `name`     | required, trimmed, inner whitespace collapsed, 2–100 chars, at least one letter (any script), no control characters |
| `email`    | required, trimmed, lower-cased, `z.email()`, ≤ 254 chars                      |
| `phone`    | required, trimmed, whitespace collapsed; optional leading `+`; starts with a digit or `(`, ends with a digit or `)`; only digits, spaces, `-`, `(`, `)`; 7–15 digits (E.164 maximum); ≤ 20 chars. No country-specific rules. |
| `message`  | required, trimmed, 10–2000 chars (stricter than the DB's 1–2000), no control characters except tab/newline, CRLF → LF |
| `userType` / `category` | trimmed, then exact match (case-sensitive) |
| body       | must be a JSON object; unknown keys rejected                                  |

---

## 5. Authentication design [Implemented]

Custom backend authentication with bcrypt and JWT. **Supabase Auth is not used** (no `@supabase/*` package; the `auth` schema is never touched).

### 5.1 Admin accounts — `npm run admin:create`

There is **no sign-up endpoint and no default account**. `backend/scripts/createAdmin.js` is the only way to create an admin:

| Input | Accepted from | Never accepted from |
|-------|---------------|---------------------|
| email | `--email`, `ADMIN_EMAIL`, or an interactive prompt | — |
| password | hidden interactive prompt (typed twice), `ADMIN_PASSWORD`, or one line on piped stdin | command-line arguments (`--password` is refused: visible in shell history and `ps`) |

`createAdminAccount()` (`src/services/admin.service.js`):
1. Validates the email (trimmed, lower-cased, `z.email()`).
2. Applies the password policy (`validateNewPassword`, following NIST SP 800-63B):
   - 12+ characters, at most 72 bytes (bcrypt silently ignores anything beyond 72);
   - not whitespace-only, and at least 5 distinct characters;
   - not one of a list of common passwords, and must not contain the email's local part.
3. Rejects an existing email with `ADMIN_EXISTS`. A pre-check gives a friendly message; the `UNIQUE` constraint settles concurrent creations.
4. Hashes with bcrypt at `BCRYPT_SALT_ROUNDS` (default **12**, allowed 10–15) and stores **only the hash** in `admins.password_hash`. The database CHECK also refuses anything that is not a bcrypt hash.
5. Prints only the email, the id and the cost: never the password, the hash or the salt.

### 5.2 Login — `POST /api/auth/login`

```
loginLimiter (5 failures / 15 min / IP; successes not counted)
  → requireTrustedOrigin (403 ORIGIN_NOT_ALLOWED — also prevents login CSRF)
  → requireJson (415) → validate(loginSchema) (400)
  → authService.login(email, password)
      admin = admins.findByEmailWithPassword(email)           -- lower-cased email
      hash  = admin?.passwordHash ?? dummyHash(cost)          -- same work for unknown emails
      ok    = bcrypt.compare(password, hash)
      !admin || !ok → 401 INVALID_CREDENTIALS "Invalid email or password."
      token = tokenService.issue(admin.id)
  → Set-Cookie + 200 { success, message, data: { admin: { id, email, role }, expiresAt } }
```

- Unknown email and wrong password return byte-identical responses and both cost one bcrypt comparison.
- The password is not trimmed and is capped at 1024 characters to bound bcrypt work. Unknown body keys (for example `role`) are rejected.
- The token is **never** in the response body.

### 5.3 Token

| Property | Value |
|----------|-------|
| Algorithm | HS256, pinned in `sign` **and** `verify` (rejects `alg: none`, HS384/HS512 and other substitutions) |
| Secret | `JWT_SECRET`: ≥ 32 characters, not the `.env.example` placeholder, or the server will not start |
| Claims | `sub` (admin id), `role` (`"admin"`), `jti` (random UUID, for logout revocation), `iat`, `exp`, `iss`, `aud`. No email, password or hash. |
| Expiry | `exp` = `iat` + `JWT_EXPIRES_IN` (default `1h`) |
| Verification | signature, `exp`, `iss` = `JWT_ISSUER` (default `edtech-crm-api`), `aud` = `JWT_AUDIENCE` (default `edtech-crm-admin`); then the claims shape (`sub` and `jti` UUIDs, `role` = `admin`) |

### 5.4 Session cookie

| Attribute | Value | Why |
|-----------|-------|-----|
| Name | `__Host-edtech_admin_session` when Secure, else `edtech_admin_session` | the `__Host-` prefix makes browsers require Secure, `Path=/` and no `Domain`, so subdomains cannot set or read it |
| `HttpOnly` | always | JavaScript (including injected scripts) cannot read the token |
| `Secure` | `AUTH_COOKIE_SECURE`, default `true` in production; startup **fails** if set false in production | HTTPS only |
| `SameSite` | `AUTH_COOKIE_SAMESITE`, default `Strict` (`None` requires Secure) | not sent on cross-site requests |
| `Path` | `/` | — |
| `Max-Age`/`Expires` | the token's remaining lifetime | the cookie disappears when the token expires |

`setAuthCookie` and `clearAuthCookie` (`src/utils/authCookie.js`) share one options builder, so the clearing `Set-Cookie` has the same name, Path, Secure, SameSite and HttpOnly. Browsers delete a cookie only when these match.

### 5.5 `authenticate` middleware (`src/middleware/authenticate.js`)

1. Reads the token **only from the session cookie**. The `Authorization` header is ignored, and so is any role or id in headers, query or body.
2. No cookie → `401 AUTH_REQUIRED`.
3. `tokenService.verify` → `401 TOKEN_EXPIRED` or `401 INVALID_TOKEN` (bad signature, malformed, wrong issuer/audience/algorithm, bad claims).
4. Revoked `jti` (logged out) → `401 TOKEN_REVOKED`.
5. Loads the admin by `sub`. If the row is gone → `401 INVALID_TOKEN`, so deleting an admin revokes access immediately.
6. Sets `req.auth = { admin: { id, email, role }, tokenId, expiresAt }`. The **role comes from the server** (every `admins` row is an `admin`), not from the request.
7. On any 401 from steps 3–5 the stale cookie is cleared.

`requireRole(...roles)` → `403 FORBIDDEN` when the authenticated identity lacks the role (`401` when there is no identity). All admin inquiry routes use `authenticate` + `requireRole('admin')`. Only one role exists today; the 403 path is unit-tested and is in place for future roles.

### 5.6 CSRF / origin protection

- **SameSite=Strict:** the browser never attaches the cookie to requests initiated by other sites.
- **Origin check** (`requireTrustedOrigin`): state-changing methods must carry an `Origin` (or `Referer`) in `FRONTEND_URL`; a missing origin is rejected too. It applies:
  - on `POST /api/auth/login`, `POST /api/auth/logout` and `PATCH /api/inquiries/:id/status`;
  - **app-wide to any unsafe request that carries the session cookie** (`createSessionCsrfGuard`), so endpoints added later are covered automatically.
- **CORS** (`FRONTEND_URL` allow-list, `credentials: true`, allowed headers `Content-Type` only): other origins get 403 before any route runs.
- **JSON-only bodies** (`requireJson`, 415) rule out classic HTML-form CSRF payloads.

### 5.7 Logout — `POST /api/auth/logout`

Origin-checked and idempotent:
1. If the cookie holds a valid token, its `jti` is added to the revocation list until the token's `exp`.
2. The cookie is cleared with matching attributes.
3. The response is `200 { success: true, message: "Signed out." }`.

After logout the browser has no cookie (`AUTH_REQUIRED`), and a copied old token is refused (`TOKEN_REVOKED`).

**Limit:** the revocation list and both rate limiters are **in-memory**. That is correct for one API instance. After a restart, a token revoked before the restart is accepted again until it expires (at most `JWT_EXPIRES_IN`). Running several instances, or needing revocation to survive restarts, requires a shared store (a `revoked_tokens` table or Redis).

### 5.8 Deployment implications of cookie authentication

1. **Serve the API same-site as the SPA (recommended: a Vercel rewrite).** In `frontend/vercel.json`, proxy `/api/:path*` to `https://<render-service>.onrender.com/api/:path*` and leave `VITE_API_BASE_URL` empty. The browser then talks only to the Vercel origin, so the cookie is first-party and `SameSite=Strict` works. This mirrors the Vite dev proxy. (The rewrite itself is added in the deployment stage.)
2. **Separate sites without a proxy** (for example `*.vercel.app` → `*.onrender.com`) would make it a third-party cookie. It would need `AUTH_COOKIE_SAMESITE=none`, and browsers that block third-party cookies (Safari by default, Firefox with strict tracking protection) would drop it. **Not recommended.** Custom domains under one registrable domain (`crm.school.org` + `api.school.org`) are same-site, so `Strict` keeps working there.
3. **`FRONTEND_URL` must list the exact browser origin**, such as `https://<app>.vercel.app`, including any custom domain. Login, logout and status updates are rejected with 403 otherwise. Through a proxy, the browser's `Origin` header is forwarded unchanged.
4. **`TRUST_PROXY`** must count the proxies in front of Express so rate limits see real client IPs: `1` for Render alone, `2` behind Vercel's rewrite plus Render.
5. **HTTPS is mandatory in production**: Secure is forced, and the `__Host-` prefix will not be accepted over HTTP.
6. **Rotating `JWT_SECRET`** invalidates every session immediately (all tokens fail signature verification).
7. **Single instance** for now (in-memory revocation and rate limits; see 5.7).

---

## 6. Frontend design [Implemented: form, sign-in, session; dashboard planned]

Stack: React 19, React Router 8 (`createBrowserRouter`; `RouterProvider` from `react-router/dom`), Axios, React Hook Form + `@hookform/resolvers/zod`, Zod 4, Lucide icons. Plain CSS with design tokens (`styles/global.css`).

### Routes (`src/routes.jsx`)

```
errorElement: RouteErrorPage
├── PublicLayout
│   ├── /                 InquiryPage          (no session check)
│   └── *                 NotFoundPage
└── AdminSession (AuthProvider)                 one session for /login and /admin
    ├── PublicLayout
    │   └── /login        LoginPage            (signed-in admins → dashboard)
    └── /admin            ProtectedRoute → AdminLayout
        ├── (index)       → /admin/dashboard
        └── dashboard     AdminDashboardPage   (landing page; table next stage)
```

### API layer (`src/api/`)

- `client.js`: one Axios instance with `baseURL` = `VITE_API_BASE_URL` (default same-origin `/api`), `withCredentials: true`, a 30 s timeout and `Accept: application/json`. A response interceptor turns every failure into `ApiError { status, code, message, details, retryAfterSeconds }`, using the backend envelope when present (`NETWORK_ERROR` / `TIMEOUT` otherwise). Cancellations pass through. A 401 on any request not marked `skipSessionExpiry` notifies the session listener.
- `inquiries.api.js`: `submitInquiry()` resolves **only** when the response has `success: true` and a string `data.id`. Anything else is `UNCONFIRMED`, so the UI never reports a save the backend did not confirm.
- `auth.api.js`: `login`, `fetchCurrentAdmin` (`GET /api/auth/me`), `logout`. Login and session-check 401s are expected answers, not "session ended" events.

### Session handling (`src/auth/`)

- `AuthProvider` keeps `{ status: checking | authenticated | unauthenticated | unavailable, admin, endReason }`. It **never sees or stores the JWT**: the token is the API's HttpOnly cookie, and nothing goes to `localStorage` or `sessionStorage`.
- **On mount** it restores the session with `GET /api/auth/me`. 200 means authenticated; 401 means unauthenticated; any other failure means `unavailable`, shown as a retry screen rather than a misleading redirect.
- **`login()`** calls the API and stores the returned admin identity.
- **`logout()`** calls `POST /api/auth/logout` and only then clears local state. If the call fails, the admin stays signed in and is told so, because the cookie is still valid on the server.
- **Any admin request returning 401** (expired or revoked) switches the state to unauthenticated with `endReason: 'expired'`, and the login page explains it.
- `AdminSession` mounts the provider only around `/login` and `/admin`, so the public form never calls `/api/auth/me`.
- `ProtectedRoute` shows a loading screen while checking and a retry screen when the API is unreachable. Otherwise it redirects to `/login`, remembering the requested location. After sign-in the user returns there, but only to `/admin…` paths (no open redirect). **This is a UX convenience; the backend authorises every admin request.**

### Forms

- **Shared:**
  - React Hook Form with Zod resolvers; validation on blur, then on change.
  - Every control has a `<label>`, `required`, `aria-invalid`, and `aria-describedby` pointing at its hint and error.
  - On a failed submit, focus moves to the first invalid field. After a server-side field error, it moves to that field once the form re-enables.
  - Errors use `role="alert"`; status messages use `role="status"`.
- **Inquiry form** (`pages/InquiryPage.jsx`):
  - `validation/inquiry.schema.js` mirrors the backend rules (`tests/validation.test.js` checks they agree on 22 cases).
  - While a request is in flight the fieldset is disabled, the button shows "Sending…" with `aria-busy`, and a ref guard drops repeat submits (double click, Enter).
  - Backend field errors are shown next to their fields.
  - Success is a focused confirmation with a short reference, or "We already have this inquiry" for a duplicate.
  - On failure the typed values are kept and the message says nothing was submitted.
- **Login** (`pages/LoginPage.jsx`):
  - A wrong password or unknown email gives the same generic message; the password is cleared and refocused.
  - Rate limiting, network failures, server errors and an origin rejection each get a specific message.
  - The password visibility toggle is a real button with `aria-pressed` and `aria-controls`.

### Design and accessibility

- **Tokens and themes:** design tokens for color, spacing, radius and type, with light and dark themes via `prefers-color-scheme`.
- **Focus and keyboard:** a visible 3 px focus ring, a skip link to `#main`, and semantic landmarks (`header`, `nav`, `main`, `footer`, `section`).
- **Small screens and motion:** 44 px controls, and reduced spinner motion under `prefers-reduced-motion`.
- **Responsive layout:**
  - the form uses two columns from 640 px, with a sticky intro beside it from 960 px;
  - topic cards are hidden on phones so the form comes first;
  - no horizontal scrolling at 375 px (checked in the browser).
- **States:** loading (session check), "can't reach the server" with retry, a 404 page, a route error page, and an empty-state landing page for the dashboard.
- **Build:** vendor code is split into separately cached chunks (`react`, `forms`, `vendor`). App code is about 23 kB, 8 kB gzipped.

### Admin dashboard (`pages/AdminDashboardPage.jsx`) [Implemented]

- **View state lives in the URL** (`useInquiryQuery`): `search`, `category`, `userType`, `page`, `sortBy` and `sortDir`. Views survive a reload and can be shared. Invalid values in the URL are ignored rather than sent to the API, and any change other than `page` returns to page 1.
- **Data comes from the server.** Every change triggers one `GET /api/inquiries` with all parameters, and stale requests are cancelled with `AbortController`; no rows are filtered in the browser. Search waits for a 300 ms pause in typing (`useDebouncedValue`) and only writes to the URL once the debounce has settled on the box's value, so Reset and the back button are never undone.
- **Table** (`InquiryTable.jsx`):
  - exactly Name, Phone, Email, User Type, Category, Date, Status;
  - the date shows date and time in the viewer's locale and zone (`<time dateTime>`, full value in `title`);
  - missing values read "Not provided" to screen readers;
  - phone and email are `tel:` / `mailto:` links;
  - Name and Date sort through the API (`aria-sort`);
  - it scrolls horizontally inside a labelled, focusable region on narrow screens, and all columns fit from about 1000 px.
- **Status** (`StatusSelect.jsx`): one labelled select per row. While saving it is disabled with a spinner. On success the row takes the server's returned record and a dismissible message names the change; on failure the old value is restored and the reason shown.
- **States:** first-load spinner; refresh keeps the table (dimmed, `aria-busy`) with a live "Showing x–y of n" summary; error with retry; "No inquiries yet"; "No inquiries match your filters" with reset; past-the-last-page recovery.
- **Header:** session indicator (status dot plus admin email, "Signed in as" for screen readers) and Sign out.

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
| `JWT_ISSUER` / `JWT_AUDIENCE` | no    | `edtech-crm-api` / `edtech-crm-admin` | checked on every request |
| `BCRYPT_SALT_ROUNDS`       | no       | `12`           | 10–15; used by `admin:create` and for the login dummy hash |
| `AUTH_COOKIE_SECURE`       | no       | `true` in production, else `false` | `false` is rejected in production |
| `AUTH_COOKIE_SAMESITE`     | no       | `strict`       | `strict` / `lax` / `none` (`none` requires Secure) |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | no | `5` / `15` | failed logins per IP per window |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin:create` only | — | optional non-interactive input; never set on the running service |
| `FRONTEND_URL`             | **yes**  | —              | comma-separated http(s) origins for CORS; normalised (trailing slash and path removed) |
| `TRUST_PROXY`              | no       | `0`            | proxies in front of Express: `1` on Render, `2` behind a Vercel rewrite to Render |
| `INQUIRY_RATE_LIMIT_MAX`   | no       | `10`           | public submissions per IP per window |
| `INQUIRY_RATE_LIMIT_WINDOW_MINUTES` | no | `15`      | rate-limit window |
| `INQUIRY_DUPLICATE_WINDOW_MINUTES` | no | `10`       | identical-submission window; `0` disables |
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
| Credential theft from DB            | bcrypt cost 12; only hashes stored                                              | Implemented |
| Brute-force login                   | 5 failures / 15 min / IP; generic error; dummy-hash compare                     | Implemented |
| Account enumeration                 | identical response and work for unknown email vs wrong password                 | Implemented |
| Token forgery / alg confusion       | HS256 pinned, ≥ 32-char non-placeholder secret, `iss`/`aud` and claims checked  | Implemented |
| Token theft via XSS                 | HttpOnly cookie; token never in JSON or JS                                      | Implemented |
| Expired / revoked tokens            | `exp` verified; logout revokes `jti`; admin existence re-checked                | Implemented (revocation in-memory) |
| CSRF / login CSRF                   | SameSite=Strict, Origin/Referer allow-list on unsafe requests, CORS, JSON-only  | Implemented |
| Privilege escalation via client role | role derived server-side; strict schemas reject `role` fields; `requireRole` → 403 | Implemented |
| Unauthorised access to inquiries    | `authenticate` + `requireRole('admin')` on every admin route; unknown subpaths 401 | Implemented |
| SQL injection                       | Sequelize bound parameters / replacements only; LIKE wildcards escaped          | Implemented for inquiry creation; search planned |
| Invalid data                        | Zod at the API; Sequelize validators; DB CHECK / NOT NULL constraints           | Implemented |
| Mass assignment                     | strict schema + service field allow-list + `create({ fields })`                 | Implemented |
| Duplicate / replayed submissions    | locked dedupe window                                                            | Implemented |
| Oversized bodies                    | 20 kb JSON limit → 413                                                          | Implemented |
| Spam on public form                 | rate limiter on `POST /api/inquiries`                                           | Implemented |
| Direct access via Supabase REST     | RLS enabled, no policies; frontend has no Supabase keys                         | Implemented |
| DB traffic interception / MITM      | TLS `verify-full` by default with Supabase CA; `sslmode` URL override ignored   | Implemented |
| Cross-origin abuse                  | CORS allow-list (`FRONTEND_URL`); others → 403                                  | Implemented |
| Header-based attacks                | Helmet on API (CSP `default-src 'none'`, HSTS, nosniff…); security headers in `vercel.json` | Implemented (frontend CSP planned) |
| Secret leakage                      | env-only config; `.gitignore`; credentials never logged; no internals in any error response | Implemented |

---

## 9. Deployment topology

| Component | Platform | Root dir   | Build           | Start / output        | Health check   | Status |
|-----------|----------|------------|-----------------|-----------------------|----------------|--------|
| API       | Render Web Service | `backend`  | `npm ci`        | `npm start`           | `/api/health`  | Scripts ready; `render.yaml` planned |
| SPA       | Vercel (Vite preset) | `frontend` | `npm run build` | `dist/` + SPA rewrite | —              | `vercel.json` ready |
| Database  | Supabase | —          | `schema.sql` via SQL editor or `npm run db:migrate` | — | `npm run db:check` | Ready to apply |

Release order: apply schema → `db:check` → `npm run admin:create` → deploy API (`FRONTEND_URL` = Vercel URL, `TRUST_PROXY`, CA configured) → deploy frontend with the `/api` rewrite (see §5.8) → smoke test.

- Graceful shutdown on `SIGTERM`/`SIGINT`: stop accepting connections, close idle keep-alive sockets, close the DB pool, force-exit after 10 s.
- Render's free tier sleeps; the frontend's 30 s timeout tolerates a cold start.
- Node: `engines` `>=22.12.0` (Vite 8, Vitest 5, jsdom 30 minimums); `.nvmrc` pins **24** (LTS) for Render/Vercel. Local development on Node 26 is verified.
- `bcrypt` 6 ships N-API prebuilt binaries (including `linux-x64` for Render), so no compiler is needed at install time.
- `backend/package.json` has `"overrides": { "uuid": "^11.1.1" }`. Sequelize 6 pins `uuid@8`, which is affected by GHSA-w5hq-g745-h8pq (buffer bounds in v3/v5/v6). Sequelize only calls `v1()`/`v4()`, so the bug was not reachable, but the override clears `npm audit` without the downgrade to Sequelize 3 that `npm audit fix --force` proposes. uuid 11 keeps the CommonJS `v1`/`v4` exports Sequelize requires, and the full test suite passes with it. Remove the override when Sequelize updates its dependency.
