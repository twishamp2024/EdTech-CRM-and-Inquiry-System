# Architecture — EdTech CRM & Inquiry Management System

Status: **Planning** (no application code written yet).
Companion docs: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md).

---

## 1. System overview

```
┌──────────────────────────┐        HTTPS/JSON         ┌──────────────────────────────┐       TLS (pg)        ┌───────────────────────────┐
│  Frontend (Vercel)       │  ───────────────────────▶ │  Backend API (Render)        │ ────────────────────▶ │  Supabase PostgreSQL      │
│  React + Vite SPA        │   Authorization: Bearer   │  Node.js + Express           │   Sequelize + pg      │  (session/txn pooler)     │
│                          │   <JWT> (admin routes)    │  Zod · bcrypt · jsonwebtoken │                       │  tables: admins,          │
│  /            form       │ ◀───────────────────────  │                              │ ◀──────────────────── │          inquiries        │
│  /admin/login            │        JSON responses     │  /api/health                 │                       │  RLS enabled, no policies │
│  /admin       dashboard  │                           │  /api/auth/*                 │                       │  (blocks PostgREST/anon)  │
└──────────────────────────┘                           │  /api/inquiries/*            │                       └───────────────────────────┘
                                                       └──────────────────────────────┘
```

Hard boundaries:

- The **frontend never talks to the database** and holds no Supabase keys. Its only configuration is `VITE_API_BASE_URL`.
- **Supabase is used purely as managed PostgreSQL.** Supabase Auth, the Supabase JS client, and PostgREST are not used.
- All admin authentication is **custom**: bcrypt password hashes in our own `admins` table, JWTs signed and verified by the backend.

---

## 2. Repository layout

```
/
├── backend/
│   ├── src/
│   │   ├── app.js                 # createApp({ services }) → Express app (no listen; used by tests)
│   │   ├── server.js              # boots env, DB connection check, app.listen, graceful shutdown
│   │   ├── config/
│   │   │   ├── env.js             # Zod-validated process.env; fails fast on boot
│   │   │   └── database.js        # Sequelize instance (postgres dialect, pg driver, SSL, pool)
│   │   ├── constants/inquiry.js   # USER_TYPES, CATEGORIES, STATUSES (single backend source of truth)
│   │   ├── models/
│   │   │   ├── index.js           # initialises models on the shared Sequelize instance
│   │   │   ├── Admin.js
│   │   │   └── Inquiry.js
│   │   ├── validators/
│   │   │   ├── auth.schema.js     # loginSchema
│   │   │   └── inquiry.schema.js  # createInquirySchema, listInquiriesQuerySchema, updateStatusSchema, idParamSchema
│   │   ├── middleware/
│   │   │   ├── authenticate.js    # Bearer JWT verification → req.admin
│   │   │   ├── validate.js        # validate({ body, query, params }) using Zod
│   │   │   ├── rateLimiters.js    # loginLimiter, inquirySubmitLimiter
│   │   │   ├── notFound.js
│   │   │   └── errorHandler.js    # AppError / ZodError / Sequelize errors → JSON envelope
│   │   ├── services/
│   │   │   ├── auth.service.js    # login(email, password), getAdminById(id)
│   │   │   └── inquiry.service.js # create, list(filters), getById, updateStatus
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   └── inquiry.controller.js
│   │   ├── routes/
│   │   │   ├── index.js           # mounts /health, /auth, /inquiries under /api
│   │   │   ├── auth.routes.js
│   │   │   └── inquiry.routes.js
│   │   └── utils/
│   │       ├── AppError.js
│   │       ├── asyncHandler.js
│   │       ├── jwt.js             # signAccessToken, verifyAccessToken
│   │       ├── password.js        # hashPassword, verifyPassword (bcrypt)
│   │       ├── buildInquiryWhere.js # filters + search → Sequelize where clause (pure, unit-tested)
│   │       └── logger.js
│   ├── scripts/
│   │   ├── db-migrate.js          # applies ../schema.sql (idempotent)
│   │   └── seed-admin.js          # creates/updates an admin from env or prompt
│   ├── tests/
│   │   ├── unit/                  # validators, jwt, password, buildInquiryWhere, authenticate
│   │   ├── api/                   # Supertest against createApp() with stubbed services
│   │   └── integration/           # real Postgres; runs only when TEST_DATABASE_URL is set
│   ├── .env.example
│   ├── package.json
│   └── vitest.config.js
├── frontend/
│   ├── src/
│   │   ├── main.jsx · App.jsx     # Router + AuthProvider
│   │   ├── config.js              # reads import.meta.env.VITE_API_BASE_URL
│   │   ├── constants/inquiry.js   # mirrors backend enum values
│   │   ├── api/
│   │   │   ├── client.js          # fetch wrapper: base URL, JSON, Bearer token, 401 handling, ApiError
│   │   │   ├── auth.api.js
│   │   │   └── inquiries.api.js
│   │   ├── auth/
│   │   │   ├── AuthContext.jsx    # token + admin state, login(), logout(), session restore via /auth/me
│   │   │   ├── tokenStorage.js    # sessionStorage wrapper (try/catch)
│   │   │   └── ProtectedRoute.jsx
│   │   ├── validation/inquiry.schema.js  # Zod schema mirroring backend rules (UX only)
│   │   ├── pages/
│   │   │   ├── InquiryFormPage.jsx
│   │   │   ├── AdminLoginPage.jsx
│   │   │   ├── AdminDashboardPage.jsx
│   │   │   └── NotFoundPage.jsx
│   │   ├── components/
│   │   │   ├── form/              # TextField, SelectField, TextAreaField, FormStatus
│   │   │   └── dashboard/         # FilterBar, SearchInput, InquiryTable, StatusBadge, StatusSelect, Pagination, EmptyState
│   │   ├── hooks/
│   │   │   ├── useDebouncedValue.js
│   │   │   └── useInquiryFilters.js # filters ⇄ URL query string
│   │   └── styles/
│   ├── tests/
│   ├── index.html
│   ├── vercel.json                # SPA rewrite + security headers
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
├── docs/
├── schema.sql                     # authoritative DDL
├── .env.example                   # documents every variable for both apps
├── render.yaml                    # Render blueprint for the backend
├── .github/workflows/ci.yml       # lint + test + build
├── .gitignore
└── README.md
```

Both packages are independent npm projects (no workspace tooling), so Render can build `backend/` and Vercel can build `frontend/` with a plain root-directory setting.
Both use ES modules (`"type": "module"`).

---

## 3. Data model

Authoritative definition: `schema.sql`. Sequelize models mirror it; **`sequelize.sync()` is never called in production** — the schema is applied by `npm run db:migrate` (which executes `schema.sql`) or by pasting `schema.sql` into the Supabase SQL editor.

### `admins`

| Column          | Type          | Constraints                                |
|-----------------|---------------|--------------------------------------------|
| `id`            | `uuid`        | PK, default `gen_random_uuid()`            |
| `name`          | `varchar(100)`| not null                                   |
| `email`         | `varchar(254)`| not null, unique on `lower(email)`         |
| `password_hash` | `varchar(100)`| not null (bcrypt, 60 chars)                |
| `is_active`     | `boolean`     | not null, default `true`                   |
| `last_login_at` | `timestamptz` | nullable                                   |
| `created_at`    | `timestamptz` | not null, default `now()`                  |
| `updated_at`    | `timestamptz` | not null, default `now()`                  |

### `inquiries`

| Column       | Type           | Constraints                                                                 |
|--------------|----------------|-----------------------------------------------------------------------------|
| `id`         | `uuid`         | PK, default `gen_random_uuid()`                                             |
| `user_type`  | `varchar(20)`  | not null, `CHECK (user_type IN ('Parent','Student','School'))`              |
| `category`   | `varchar(30)`  | not null, `CHECK (category IN ('Scholarship','Concert','Admission','General Query'))` |
| `name`       | `varchar(100)` | not null                                                                    |
| `email`      | `varchar(254)` | not null                                                                    |
| `phone`      | `varchar(20)`  | not null                                                                    |
| `message`    | `text`         | not null, `CHECK (char_length(message) <= 2000)`                            |
| `status`     | `varchar(20)`  | not null, default `'New'`, `CHECK (status IN ('New','In Progress','Resolved','Closed'))` |
| `created_at` | `timestamptz`  | not null, default `now()` — shown as **Date** on the dashboard              |
| `updated_at` | `timestamptz`  | not null, default `now()`                                                   |

Indexes: `(category)`, `(user_type)`, `(created_at DESC)`, and `pg_trgm` GIN indexes on `name` and `phone` so `ILIKE '%term%'` search stays fast as data grows.
A shared `set_updated_at()` trigger keeps `updated_at` correct even for writes outside Sequelize.

**Why `CHECK` constraints instead of Postgres `ENUM` types:** values can be added with a simple constraint swap, Sequelize does not try to manage the type, and the database still rejects invalid values independently of the API.

**Why Status exists:** the dashboard must display Status, so every inquiry starts as `New`. Admins can change it via `PATCH /api/inquiries/:id/status` — a small addition that makes the column meaningful.

### Row Level Security

Supabase exposes every `public` table through its auto-generated REST API to anyone holding the project's anon key. `schema.sql` therefore runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on both tables **with no policies**, which denies all access through PostgREST (`anon`/`authenticated` roles). The backend connects as the `postgres` role (table owner), which bypasses RLS, so the API is unaffected.

---

## 4. Backend design

### Request pipeline

```
helmet → cors(allow-list) → express.json({ limit: '20kb' }) → request logger
  → /api router
      → [rate limiter] → [authenticate] → validate(zod) → controller → service → Sequelize model
  → notFound → errorHandler
```

Layer responsibilities:

| Layer        | Knows about                    | Must not                                   |
|--------------|--------------------------------|--------------------------------------------|
| routes       | URL, middleware order          | contain logic                              |
| middleware   | HTTP, JWT, Zod                 | touch models                               |
| controllers  | `req`/`res`, status codes      | build queries                              |
| services     | business rules, models         | know about `req`/`res`                     |
| models       | table mapping                  | contain HTTP concerns                      |

`createApp({ authService, inquiryService })` accepts injected services (defaulting to the real ones) so API tests can exercise routing, auth and validation without a database.

### API surface

All responses are JSON. Errors use one envelope: `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [...] } }`.

| Method | Path                          | Auth  | Purpose                                         | Success |
|--------|-------------------------------|-------|-------------------------------------------------|---------|
| GET    | `/api/health`                 | none  | liveness; `?db=1` also checks DB connectivity   | 200     |
| POST   | `/api/inquiries`              | none  | public form submission (rate-limited)           | 201     |
| POST   | `/api/auth/login`             | none  | email + password → JWT (rate-limited)           | 200     |
| GET    | `/api/auth/me`                | JWT   | validate token, return current admin            | 200     |
| GET    | `/api/inquiries`              | JWT   | list with filters, search, pagination, sort     | 200     |
| GET    | `/api/inquiries/:id`          | JWT   | single inquiry (full message)                   | 200     |
| PATCH  | `/api/inquiries/:id/status`   | JWT   | change status                                   | 200     |

`GET /api/inquiries` query parameters (all optional, validated by Zod):

| Param      | Values                                             | Default         |
|------------|----------------------------------------------------|-----------------|
| `category` | one of the four categories                         | —               |
| `userType` | `Parent` · `Student` · `School`                    | —               |
| `status`   | one of the four statuses                           | —               |
| `search`   | 1–100 chars; matches name **or** phone             | —               |
| `page`     | integer ≥ 1                                        | `1`             |
| `pageSize` | integer 1–100                                      | `20`            |
| `sortBy`   | `createdAt` · `name`                               | `createdAt`     |
| `sortDir`  | `asc` · `desc`                                     | `desc`          |

Response: `{ data: Inquiry[], meta: { page, pageSize, total, totalPages } }`.

**Combining semantics:** every supplied filter is ANDed together; inside `search`, name and phone are ORed:

```
WHERE category = :category            -- if provided
  AND user_type = :userType            -- if provided
  AND status    = :status              -- if provided
  AND ( name ILIKE :term
        OR phone ILIKE :term
        OR regexp_replace(phone, '\D', '', 'g') LIKE :digits )   -- digits clause only if search has ≥3 digits
```

`%`, `_` and `\` in the search term are escaped before wrapping in `%…%`, and all values are bound parameters via Sequelize operators — no string-concatenated SQL. The digits-only clause lets `98765 43210` match `+91-9876543210`.

### Validation rules (Zod, backend is authoritative)

| Field      | Rule                                                                                  |
|------------|---------------------------------------------------------------------------------------|
| `userType` | required, enum                                                                         |
| `category` | required, enum                                                                         |
| `name`     | required, trimmed, 2–100 chars                                                         |
| `email`    | required, trimmed, lower-cased, valid email, ≤ 254 chars                               |
| `phone`    | required, trimmed, only `+ digits spaces - ( )`, ≤ 20 chars, 7–15 digits in total      |
| `message`  | required, trimmed, 10–2000 chars                                                       |

Unknown keys are stripped. The frontend uses a mirrored Zod schema purely for instant feedback; the server never trusts it.

---

## 5. Authentication design

### Credentials

- Passwords hashed with **bcrypt**, cost factor `BCRYPT_SALT_ROUNDS` (default 12, validated 10–15).
- **No public registration endpoint.** Admins are created by `npm run seed:admin`, which reads `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from the environment (or prompts), enforces a minimum password length of 12, hashes, and upserts. The plain password is never logged or stored.

### Login (`POST /api/auth/login`)

1. Zod-validate `{ email, password }`.
2. Look up active admin by `lower(email)`.
3. `bcrypt.compare` against the stored hash. If the admin does not exist, compare against a fixed dummy hash anyway so response time does not reveal which emails exist.
4. On any failure → `401 INVALID_CREDENTIALS` with the same generic message.
5. On success → update `last_login_at`, sign JWT, return `{ token, expiresIn, admin: { id, name, email } }`.
6. Protected by `loginLimiter` (e.g. 10 attempts / 15 min per IP).

### Token

| Property    | Value                                                         |
|-------------|---------------------------------------------------------------|
| Algorithm   | HS256 (pinned in both `sign` and `verify`)                     |
| Secret      | `JWT_SECRET`, must be ≥ 32 chars or the server refuses to boot |
| Claims      | `sub` (admin id), `email`, `iat`, `exp`, `iss`, `aud`          |
| Lifetime    | `JWT_EXPIRES_IN`, default `1h`                                 |

### `authenticate` middleware

1. Require header `Authorization: Bearer <token>` → else `401 AUTH_REQUIRED`.
2. `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer, audience })` — this checks the **signature and `exp`**.
3. `TokenExpiredError` → `401 TOKEN_EXPIRED`; any other verification error → `401 INVALID_TOKEN`.
4. Load the admin by `sub` and require `is_active` → else `401 INVALID_TOKEN` (deactivating an admin locks them out immediately).
5. Attach `req.admin = { id, name, email }`.

Applied to `/api/auth/me` and every `/api/inquiries` route except `POST /`.

### Frontend session handling

- Token kept in React state and mirrored to `sessionStorage` (cleared when the tab closes).
- On load, `AuthContext` calls `/api/auth/me` to restore the session; failure clears it.
- `ProtectedRoute` redirects unauthenticated users to `/admin/login` and returns them to the originally requested URL after login.
- The API client clears the session and redirects on any `401`.
- Logout clears client state. JWTs are stateless, so a stolen token is valid until `exp`; the short lifetime and `is_active` check limit this. Server-side revocation lists are out of scope.

**Why a Bearer header rather than an httpOnly cookie:** the frontend (Vercel) and API (Render) live on different sites, so a cookie would need `SameSite=None; Secure` and would be dropped by browsers that block third-party cookies (Safari, increasingly Chrome). A Bearer token works reliably across origins and makes CSRF a non-issue. The XSS exposure this introduces is mitigated by React's output escaping, never using `dangerouslySetInnerHTML`, a strict Content-Security-Policy on the frontend (`vercel.json`), and short token lifetime.

---

## 6. Frontend design

| Route          | Component             | Access    |
|----------------|-----------------------|-----------|
| `/`            | `InquiryFormPage`     | public    |
| `/admin/login` | `AdminLoginPage`      | public (redirects to `/admin` if already logged in) |
| `/admin`       | `AdminDashboardPage`  | protected |
| `*`            | `NotFoundPage`        | public    |

**Inquiry form:** controlled inputs; select fields for User Type and Category; client-side Zod validation on blur and submit; field-level server errors mapped from `details`; disabled submit while sending; success state that offers "submit another"; accessible labels, `aria-invalid`, `aria-describedby` for errors.

**Dashboard:**
- Columns: Name · Phone · Email · User Type · Category · Date · Status.
- `FilterBar` with Category and User Type selects (plus Status) and a "Clear filters" button.
- `SearchInput` (name or phone) debounced 300 ms.
- Filters, search and page live in the URL query string (`useInquiryFilters`), so views are shareable and survive refresh; changing any filter resets to page 1.
- Server-side pagination; loading, empty and error states; stale requests cancelled with `AbortController`.
- Row click / expand shows the full message; `StatusSelect` updates status optimistically with rollback on failure.
- Responsive: table collapses to stacked cards under ~768 px.
- Header with admin name and Logout.

State management is React state + context only; no external state library is needed at this size.

---

## 7. Configuration

| Variable                  | App      | Required | Notes                                                                  |
|---------------------------|----------|----------|------------------------------------------------------------------------|
| `NODE_ENV`                | backend  | no       | `development` / `production` / `test`                                 |
| `PORT`                    | backend  | no       | Render injects this; default `4000`                                    |
| `DATABASE_URL`            | backend  | **yes**  | Supabase pooler connection string                                      |
| `DB_SSL`                  | backend  | no       | default `true`                                                         |
| `DB_SSL_CA`               | backend  | no       | PEM of Supabase's CA; when set, certificates are fully verified        |
| `DB_POOL_MAX`             | backend  | no       | default `5`                                                            |
| `JWT_SECRET`              | backend  | **yes**  | ≥ 32 random chars                                                      |
| `JWT_EXPIRES_IN`          | backend  | no       | default `1h`                                                           |
| `JWT_ISSUER` / `JWT_AUDIENCE` | backend | no     | defaults `edtech-crm-api` / `edtech-crm-admin`                         |
| `BCRYPT_SALT_ROUNDS`      | backend  | no       | default `12`                                                           |
| `CORS_ORIGINS`            | backend  | **yes** (prod) | comma-separated allow-list, e.g. the Vercel URL                  |
| `TRUST_PROXY`             | backend  | no       | `1` on Render so rate limiting sees real client IPs                    |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | backend scripts | for seeding only | never set on the running service |
| `TEST_DATABASE_URL`       | backend tests | no  | enables integration tests; must point at a disposable database         |
| `VITE_API_BASE_URL`       | frontend | **yes**  | e.g. `https://edtech-crm-api.onrender.com/api`                          |

`config/env.js` parses and validates all backend variables with Zod at startup and exits with a clear message listing what is missing. `.env` files are git-ignored; only `.env.example` files are committed.

### Database connection

Supabase's direct host (`db.<ref>.supabase.co`) is IPv6-only on most plans, and Render does not reliably support outbound IPv6, so the backend uses the **Supavisor pooler**:

- **Session mode, port 5432** — recommended for the long-running Render service.
- **Transaction mode, port 6543** — use if the API is ever run serverless. This works with Sequelize because `pg` does not use named prepared statements by default.

SSL is always on. With `DB_SSL_CA` set, the server certificate is verified; without it the connection is still encrypted but uses `rejectUnauthorized: false` (documented trade-off, with instructions in the README for downloading the CA from the Supabase dashboard).

---

## 8. Security controls summary

| Threat                         | Control                                                                                   |
|--------------------------------|-------------------------------------------------------------------------------------------|
| Credential theft from DB       | bcrypt hashes, cost 12                                                                    |
| Brute-force login              | rate limiter on `/auth/login`; generic error; constant-time-ish dummy compare             |
| Token forgery / alg confusion  | HS256 pinned, ≥ 32-char secret, `iss`/`aud` checked                                       |
| Expired / revoked tokens       | `exp` verified; `is_active` re-checked on every request                                   |
| SQL injection                  | Sequelize bound parameters only; LIKE wildcards escaped                                   |
| Invalid / oversized input      | Zod on every body/query/param; 20 kb body limit; DB `CHECK` constraints                   |
| Spam on public form            | rate limiter on `POST /api/inquiries`                                                     |
| Direct DB access via Supabase REST | RLS enabled with no policies; frontend has no Supabase keys                           |
| Cross-origin abuse             | CORS allow-list from env                                                                  |
| Common header attacks          | `helmet` on API; CSP and security headers on Vercel                                       |
| Secret leakage                 | env-only config, `.gitignore`, no secrets in logs, error handler hides stack traces in production |

---

## 9. Deployment topology

| Component | Platform | Root dir   | Build                    | Start / output        | Health check        |
|-----------|----------|------------|--------------------------|-----------------------|---------------------|
| API       | Render Web Service (`render.yaml`) | `backend`  | `npm ci`        | `npm start`           | `/api/health`       |
| SPA       | Vercel (Vite preset)               | `frontend` | `npm run build` | `dist/` + SPA rewrite | —                   |
| Database  | Supabase                           | —          | `schema.sql` via SQL editor or `npm run db:migrate` | — | — |

Release order: database schema → seed admin → deploy API (set `CORS_ORIGINS` once the Vercel URL is known) → deploy frontend with `VITE_API_BASE_URL` → smoke test.

Notes:
- Render's free tier sleeps after inactivity; the first request can take ~30–60 s. The frontend shows a "waking the server" message on slow first loads.
- `app.js` exports the Express app without calling `listen`, so it could later be wrapped as a Vercel serverless function if a single-platform deploy is preferred (would then use the transaction pooler).
- Node version: deploy targets pinned to Node 24 LTS via `engines` and `.nvmrc`; local development on the installed Node 26 is also supported. Confirmed against what Render and Vercel offer at scaffold time.
