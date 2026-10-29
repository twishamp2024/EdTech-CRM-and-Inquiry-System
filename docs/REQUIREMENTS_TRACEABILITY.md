# Requirements Traceability Matrix

Every mandatory requirement, the files that implement (or will implement) it, and how it is verified.
Last updated: **2026-10-30, end of stage 6** (admin dashboard: listing, filters, search, pagination, status management). Status is only `Verified` when the named check was actually executed.
Phase numbers refer to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Paths are relative to the repository root.

**Status legend:** `Planned` → `Implemented` → `Verified` (verification actually executed). `Blocked (Bx)` = waiting on a blocker from the implementation plan.
**Status legend (partial):** `Partial` = the layers listed in *Done so far* exist and are verified; the rest is planned.
**Verification legend:** **FE** frontend test (`frontend/tests`, real router/auth/forms, API modules mocked) · **E2E** clicked through in a browser against the real API on `npm run dev:memory` · **UT** unit test · **API** Supertest with stubbed services · **DB** Supertest through the real app, service, Sequelize and `pg` against an isolated in-process PostgreSQL (PGlite socket, `backend/tests/database`) · **SCH** `schema.sql` executed in PGlite (real PostgreSQL in WASM, `backend/tests/schema`) · **IT** integration test against real Postgres (needs `TEST_DATABASE_URL`) · **FE** frontend component test · **MAN** manual check (steps in README) · **REV** code/file review · **CI** automated pipeline.

---

## 1. Public inquiry form

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| F-01 | User Type field with options Parent, Student, School | `backend/src/constants/inquiry.js` (`USER_TYPES`); `backend/src/validators/inquiry.schema.js` (`choice`); `backend/src/models/Inquiry.js` (`isIn`); `schema.sql` (CHECK); frontend select planned | UT `inquiry.schema.test.js`: each value accepted, `Teacher`/`parent`/`PARENT`/`Parents` rejected · API `inquiries.test.js`: invalid user type → 400 with message · SCH: CHECK values = constants · FE planned | 1, 4, 5 | **Verified**: server (UT, API, SCH) and form dropdown with exactly 3 options (FE, E2E) |
| F-02 | Category field with options Scholarship, Concert, Admission, General Query | `CATEGORIES` in constants; `backend/src/validators/inquiry.schema.js`; model `isIn`; `schema.sql` CHECK; frontend select planned | UT: 4 values accepted, `Sports`/`admission`/`General`/`General  Query` rejected · API: invalid category → 400 · SCH · FE planned | 1, 4, 5 | **Verified**: server and form dropdown with exactly 4 options (FE, E2E) |
| F-03 | Name required | `backend/src/validators/inquiry.schema.js` (trim, required, 2–100 chars, ≥ 1 letter, no control chars, whitespace collapsed); `schema.sql` NOT NULL + length CHECK | UT: missing / null / empty / whitespace-only / non-string / too short / too long / digits-only / NUL byte · API: missing `name` → 400 `{field:"name"}`; whitespace-only → 400 · DB: invalid request writes no row | 4, 5 | **Verified**: server and client-side validation with field-level errors (FE, E2E); parity test `frontend/tests/validation.test.js` |
| F-04 | Email required | `backend/src/validators/inquiry.schema.js` (trim, required, ≤ 254, lower-cased, `z.email`); `schema.sql` format CHECK | UT: 8 malformed formats, > 254 chars, case normalised · API: `asha@example` → 400 with message, service not called · DB: stored lower-cased | 4, 5 | **Verified**: server and client-side validation with field-level errors (FE, E2E); parity test `frontend/tests/validation.test.js` |
| F-05 | Phone Number required | `backend/src/validators/inquiry.schema.js` (trim, required, international format: optional leading `+`, digits/spaces/hyphens/brackets, 7–15 digits per E.164, ≤ 20 chars; not tied to any one country); `schema.sql` CHECK | UT: 8 international formats accepted (US, UK, AU, DE, JP, IN, local); letters, misplaced `+`, leading `-`, < 7 / > 15 digits, > 20 chars rejected · API: invalid phone → 400 · DB: stored as text, `+` kept | 4, 5 | **Verified**: server and client-side validation with field-level errors (FE, E2E); parity test `frontend/tests/validation.test.js` |
| F-06 | Message/Query required | `backend/src/validators/inquiry.schema.js` (trim, required, 10–2000 chars, no control chars, CRLF → LF); `schema.sql` length CHECK (1–2000) | UT: missing / empty / < 10 / 2000 accepted / 2001 rejected / control chars · API: 2001 chars → 400 | 4, 5 | **Verified**: server and client-side validation with field-level errors (FE, E2E); parity test `frontend/tests/validation.test.js` |
| F-07 | Submissions saved to Supabase PostgreSQL | `backend/src/routes/inquiry.routes.js` (`POST /api/inquiries`); `controllers/inquiry.controller.js`; `services/inquiry.service.js` (`createInquiry`, explicit field allow-list, dedupe in a transaction); `models/Inquiry.js`; `config/database.js`; `server.js` wiring | API: 201 `{success, message, data:{id, duplicate:false}}`; service receives only sanitised fields · DB `inquiry.persistence.test.js`: row stored with status `New`, `created_at` = `updated_at` ≈ now, values normalised; response id = row id · live smoke test (PGlite over TCP) 201 and row verified · IT written (`TEST_DATABASE_URL`), not run | 4, 5 | **Verified** against PostgreSQL (DB tests + E2E: browser submit → 201 → row with status `New`). Real Supabase run blocked (B1) |
| F-08 | Form is publicly accessible (no login) | `inquiry.routes.js`: `POST /` has no `authenticate` middleware; frontend route planned | API: submission with no Authorization header → 201; browser request from the allowed origin → 201 with CORS header · DB: same, end to end | 4, 5 | **Verified**: API (no auth) and UI (`/` outside the admin session; makes no `/api/auth/me` call; FE + E2E) |

## 2. Admin authentication

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| A-01 | Custom backend authentication (no Supabase Auth) | `backend/src/services/auth.service.js`, `admin.service.js`, `admin.repository.js`; `controllers/auth.controller.js`; `routes/auth.routes.js`; `utils/{jwt,password,authCookie}.js`; `middleware/authenticate.js`; `admins` table | REV + guard grep: no `@supabase/` package in either lockfile, no `auth.users` use · all auth tests below run against our own code | 3 | **Verified** |
| A-02 | Passwords hashed with bcrypt | `utils/password.js` (bcrypt, `BCRYPT_SALT_ROUNDS` default 12); `services/admin.service.js`; `scripts/createAdmin.js`; DB CHECK on `admins.password_hash` | UT `auth.test.js` "produces a salted bcrypt hash…" · DB `auth.persistence.test.js` "stores only a bcrypt hash (cost 12)…": row is `$2b$12$` + 53 chars, ≠ plaintext, `bcrypt.compare` true · SCH plaintext rejected · live: stored `$2b$12$…`, 60 chars | 3 | **Verified** |
| A-03 | Login issues a JWT via `jsonwebtoken` | `utils/jwt.js` `issue()` (HS256; claims `sub`, `role`, `jti`, `iat`, `exp`, `iss`, `aud`); `auth.service.js` `login()`; `POST /api/auth/login` sets the HttpOnly cookie | UT "issues a token with only the necessary claims" · API valid login 200 + cookie, wrong password / unknown email identical 401, 8 malformed bodies 400, bad JSON 400, form 415, no-Origin/foreign-Origin 403, rate limit 429 · live curl | 3 | **Verified** |
| A-04 | JWT signature verified | `utils/jwt.js` `verify()` (`algorithms: ['HS256']`, issuer, audience, claims schema); `middleware/authenticate.js` | UT 13 rejection cases: tampered payload/signature, other secret, wrong issuer/audience, HS512, `alg: none`, wrong role, missing/invalid `sub`, missing `jti`, garbage, empty · API invalid signature, foreign secret, malformed → 401 `INVALID_TOKEN` · mutation check (allowing HS512 fails a test) · live tampered cookie 401 | 3 | **Verified** |
| A-05 | JWT expiration verified | `jwt.js` (`exp` from `JWT_EXPIRES_IN`) → `TOKEN_EXPIRED`; cookie `Max-Age` = token lifetime; frontend client sends cookies (session UI in Phase 6) | UT expired → `TOKEN_EXPIRED` · API expired cookie → 401 `TOKEN_EXPIRED`; expired token on every inquiry route → 401 · live: `JWT_EXPIRES_IN=3s`, replay after 4 s → 401 `TOKEN_EXPIRED` · FE redirect planned | 3, 6 | **Verified**: API returns `TOKEN_EXPIRED`; UI reacts to any admin 401 by returning to `/login` with "Your session has ended" (FE) |
| A-06 | Admin dashboard protected | `frontend/src/auth/ProtectedRoute.jsx`, `AuthProvider.jsx`, `AdminSession.jsx`; `src/routes.jsx` | FE: anonymous `/admin/dashboard` → `/login`; loading state; session restored via `/api/auth/me`; API-unreachable retry screen; signed-in admin on `/login` → dashboard · E2E same | 6 | **Verified** (UX only; the API enforces access, see A-07) |
| A-07 | All inquiry-management APIs protected | `routes/inquiry.routes.js`: `router.use(authenticate, requireRole('admin'))` before `GET /`, `GET /:id`, `PATCH /:id/status` (and any other subpath); `GET /api/auth/me` uses `authenticate` | API `inquiries.admin.test.js`: 3 routes × {no cookie, invalid signature, expired, malformed} → 401, no data, service never called; unknown subpath → 401; valid session → 200 · DB end-to-end anonymous 401 → login → 200 → logout → 401 · live curl | 3, 4 | **Verified** |
| A-08 | No hardcoded credentials; admin provisioning is secure | `scripts/createAdmin.js` (prompt / env / pipe; refuses `--password`); `validateNewPassword` (12+ chars, ≤ 72 bytes, not common, not containing the email); no registration route; no default account; `.env.example` placeholders only; placeholder `JWT_SECRET` refused | UT policy (8 cases) · DB: script creates an admin without printing password/hash/salt, duplicate → exit 1, weak password → exit 1 without echo, `--password` refused · live: password absent from output | 3, 7 | **Verified** |
| A-09 | Brute-force and enumeration resistance (production-conscious) | `rateLimiters.js` `createLoginLimiter` (5 failures / 15 min / IP, successes skipped); dummy-hash compare in `auth.service.js` | API "blocks further attempts after repeated failures" (429 + `Retry-After`), "does not count successful sign-ins", unknown email = wrong password response · mutation check (always-true password fails 4 tests) | 3 | **Verified** |

## 3. Admin dashboard

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| D-01 | Display Name, Phone, Email, User Type, Category, Date, Status | `frontend/src/components/dashboard/InquiryTable.jsx` (exactly 7 columns; readable date + time in `<time>`; "Not provided" for missing values); `backend/src/services/inquiry.service.js` (`LIST_ATTRIBUTES`) | FE "shows exactly the seven required columns, in order", "shows each value and formats the date readably", "handles missing and malformed values" · DB list rows have exactly the list attributes · E2E | 4, 6 | **Verified** |
| D-02 | Filter by Category | `DashboardToolbar.jsx` → URL `category` → `GET /api/inquiries?category=` → `listInquiriesQuerySchema` (enum) → `buildInquiryWhere` | UT SQL for each of the 4 categories · API invalid → 400 · DB each of the 4 categories returns exactly the matching seeded rows · FE select → API params + URL · E2E Scholarship → 8/26 | 4, 6 | **Verified** |
| D-03 | Filter by User Type | As D-02 (`userType` → `user_type`) | UT 3 types · DB each of the 3 types · FE · E2E | 4, 6 | **Verified** |
| D-04 | Search by Name or Phone Number | `DashboardToolbar` search box (300 ms debounce, URL `search`) → `buildInquiryWhere`: `name ILIKE`, `phone ILIKE`, and `regexp_replace(phone, '[^0-9]', '', 'g') LIKE` digits when ≥ 3 digits; LIKE wildcards escaped; values passed as escaped literals | UT generated SQL (ILIKE, digits clause, escaping, injection literal) · DB case-insensitive partial name, phone as typed, phone ignoring formatting, `%`/`_` literal, injection strings return nothing and delete nothing · FE debounce sends one request · E2E `asha` → 3 rows, `9876543210` → `+91 98765-43210` · mutation checks (no escaping / no digit match → tests fail) | 1, 4, 6 | **Verified** |
| D-05 | Filters and search combine | `buildInquiryWhere` (AND of filters, OR inside the search); all params in one URL / one API call | UT combined SQL · DB category + userType + search exact ids · FE URL with all three → one API call · E2E Scholarship + Parent + phone digits → 2 rows | 4, 6 | **Verified** |
| D-06 | Dashboard usable at scale (production-conscious) | Server-side pagination (`page`, `pageSize` default 20, max 100; `meta.total`, `totalPages`, `hasNextPage`, `hasPreviousPage`); `Pagination.jsx` Previous/Next | DB default 20 of 26, last page 21–26, beyond last page empty with total, paging through filtered and filtered+searched results with constant total and no gaps or duplicates · API pageSize 500 → 400 · FE next/prev keep filters, filter change resets page 1, past-the-end recovery · E2E page 2 of 2 | 4, 6 | **Verified** |
| D-07 | Status is meaningful and maintainable (New / In Progress / Resolved) | `PATCH /api/inquiries/:id/status` (strict `{ status }` enum New / In Progress / Resolved; 404 unknown; 503/500 DB errors); `StatusSelect.jsx` (disabled + spinner while saving, row updated from response, success / error message, old value restored on failure) | DB valid updates change the row and `updated_at`; 4 invalid values 400 with row unchanged; unknown id 404; unauthenticated 401 and no-Origin 403 with row unchanged · API DB deadlock → 503, other DB error → 500 without details · FE success feedback, failure reverts, dismiss · E2E New → Resolved, PATCH 200, DB row Resolved | 1, 4, 6 | **Verified** |

## 4. Deliverables

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| R-01 | GitHub repository with `frontend/` and `backend/` | Repo layout per ARCHITECTURE §2; `gh repo create` + push | REV: tree contains both dirs · MAN: repo URL opens | 1, 8 | Partial — repo exists at github.com/twishamp2024/EdTech-CRM-and-Inquiry-System with `frontend/` and `backend/` locally; stage 2 not yet committed/pushed |
| R-02 | `schema.sql` | `schema.sql` (root) | IT: `npm run db:migrate` applies cleanly twice · MAN: paste into Supabase SQL editor | 1 | Verified (SCH: applied twice, constraints, defaults, trigger, RLS; `db:migrate` + `db:check` over the Postgres wire protocol against PGlite). Not yet applied to Supabase (B1) |
| R-03 | `.env.example` | `.env.example` (root, backend variables — copy to `backend/.env`), `frontend/.env.example` | REV: every variable read by `config/env.js` / `config.js` appears; no real values · UT: env schema test iterates the example's keys | 1, 2, 5 | Verified — root `.env.example` (backend) + `frontend/.env.example`; UT asserts required keys and that placeholders are refused |
| R-04 | `README.md` with setup and authentication-testing instructions | `README.md` | MAN: follow README from clean clone; auth-testing section covers login, token use, missing/invalid/expired token | 8 | Partial — setup, Supabase/TLS, scripts and testing documented; auth-testing guide comes with Phase 3 |
| R-05 | Deployment-ready application | `render.yaml`; `frontend/vercel.json`; `engines` / `.nvmrc`; `server.js` honours `PORT`, graceful shutdown; `/api/health`; env-driven CORS | CI: lint, tests, `vite build` pass · MAN: `NODE_ENV=production npm start` locally · MAN: deployed smoke test | 2, 7, 8 | Partial — `PORT`, graceful shutdown, health endpoints, env-driven CORS, `vercel.json`, engines/.nvmrc done and smoke-tested locally; `render.yaml` + live deploy pending (B1, B4) |

## 5. Technology stack constraints

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| T-01 | React + Vite + JavaScript | `frontend/` scaffold, `.jsx` files only, no TypeScript | REV: `package.json`, no `tsconfig.json` · CI: `vite build` | 5 | Verified — Vite 8 + React 19, `.jsx` only; `npm run build` passes |
| T-02 | Node.js + Express | `backend/src/app.js`, `server.js` | REV · API tests | 2 | Verified — Express 5 app; API tests + local boot |
| T-03 | Sequelize ORM | `backend/src/config/database.js`; `backend/src/models/*` | REV · IT | 2 | Verified — Sequelize 6 models; UT field mappings; db:check compares models with live tables |
| T-04 | Supabase PostgreSQL via connection string | `DATABASE_URL` in `config/env.js` / `database.js`; pooler guidance in README | IT against Supabase · MAN: `/api/health/db` → `200` | 2 | Partial — `DATABASE_URL` parsing, pooler + TLS verify-full done; TLS rejection verified against the real Supabase pooler; real connection blocked (B1) |
| T-05 | `pg` driver | `backend/package.json` (`pg`, `pg-hstore`); `dialectModule` set explicitly | REV | 2 | Verified — `pg` passed as `dialectModule` (UT) |
| T-06 | `bcrypt` and `jsonwebtoken` | `backend/package.json`; `utils/password.js`; `utils/jwt.js` | REV · UT | 3 | Partial — installed; bcrypt prebuilt binary verified; usage in Phase 3 |
| T-07 | Zod validation | `backend/src/validators/*`; `middleware/validate.js`; `config/env.js`; `frontend/src/validation/*` | UT · API | 2–5 | Partial — Zod used for env config and `validate` middleware (UT); request schemas planned |
| T-08 | Render/Vercel-compatible architecture | `render.yaml`; `frontend/vercel.json`; independent package roots | REV · MAN deploy | 8 | Blocked (B4) for live deploy |

## 6. Prohibitions and engineering rules

| ID | Rule | How it is enforced | Verification | Status |
|----|------|--------------------|--------------|--------|
| P-01 | No SQLite as production DB | Only `pg` dialect configured; SQLite not used in tests either | REV: no `sqlite3` in any `package.json` · CI grep | Verified 2026-10-30 — only `pg` dialect; `sqlite3` not installed (appears only in Sequelize's optional peer list) |
| P-02 | No Supabase Auth | Custom auth (A-01) | REV · CI grep for `@supabase/` | Verified 2026-10-30 — no `@supabase/` package in either lockfile |
| P-03 | No direct DB connections from frontend | Frontend only knows `VITE_API_BASE_URL`; RLS blocks anon REST access | REV: no DB/Supabase deps or env vars in `frontend/` · MAN: anon REST call returns nothing | Verified 2026-10-30 — no DB/Supabase deps or variables in `frontend/`; RLS enabled (SCH) |
| P-04 | Never hardcode or commit secrets | Env-only config; `.gitignore`; placeholder-only examples | Phase 7.7 secret scan before each commit · CI grep | Verified 2026-10-30 — secret-pattern scan clean; only `.env.example` files present; config never logs credentials (UT) |
| P-05 | No mandatory feature left as TODO | — | `git grep -n TODO` reviewed before completion | Ongoing — no TODOs in code |
| P-06 | Don't claim tests passed unless executed | Test results recorded with real output; skipped suites reported as skipped | Status column updated only from executed runs | Ongoing |
| P-07 | No publish/deploy/external credentials without authorisation | B3/B4 require explicit approval | — | Ongoing |
| P-08 | Modular, maintainable code | Layered backend (routes → controllers → services → models), component-based frontend | REV · ESLint in CI | Ongoing — layered backend; ESLint clean in both packages |

## 7. Stage 2 — foundation & database requirements

| ID | Requirement | Implementation | Verification | Status |
|----|-------------|----------------|--------------|--------|
| S-01 | `frontend/` (React + Vite) and `backend/` (Node + Express) with config, models, controllers, routes, middleware, validators, scripts, tests directories | `frontend/`, `backend/src/{config,models,controllers,routes,middleware,validators,constants,utils}`, `backend/scripts`, `backend/tests` | REV · both packages lint, test, build | Verified |
| S-02 | Root `schema.sql`, `.env.example`, `.gitignore`, `README.md`; planning docs preserved | root files; docs updated in place | REV | Verified |
| S-03 | Express app, JSON parsing | `backend/src/app.js` (`express.json`, 20 kb limit) | API: malformed JSON → 400, oversized → 413 | Verified |
| S-04 | Environment configuration with dotenv | `backend/src/config/env.js` (`loadDotenv`, Zod schema) | UT (16 cases) · boot with empty env lists all missing vars | Verified |
| S-05 | Helmet security headers | `app.js` (`helmet`, API CSP `default-src 'none'`) | API: nosniff, HSTS, CSP, no `X-Powered-By` | Verified |
| S-06 | Restricted CORS | `middleware/cors.js` (allow-list from `FRONTEND_URL`) | API: allowed origin, preflight, multiple origins, denied origin → 403 · curl through Vite proxy | Verified |
| S-07 | Centralised error handling | `middleware/errorHandler.js`, `notFound.js`, `utils/AppError.js` | UT: Zod, Sequelize, unknown errors; production hides internals · API: 404 envelope | Verified |
| S-08 | `GET /api/health` | `controllers/health.controller.js`, `routes/health.routes.js` (+ `/api/health/db`) | API (4 tests) · curl against live server: 200 / 200 / 503 when DB stopped | Verified |
| S-09 | Development and production scripts | `backend`: `dev` (`node --watch`), `start`, `test`, `test:integration`, `lint`, `format`, `db:migrate`, `db:check`; `frontend`: `dev`, `build`, `preview`, `test`, `lint`, `format` | All executed | Verified |
| S-10 | Connection failure handling and sensible logging | `config/database.js` (`connectWithRetry`, `describeDatabaseError`, `checkConnection` timeout); `server.js` (exit 1, graceful shutdown); `utils/logger.js`; `middleware/requestLogger.js` | UT: retry/give-up/no-retry/timeout; credentials absent from logs · boot: ECONNREFUSED retry → exit 1; SIGTERM → exit 0 | Verified |
| S-11 | Sequelize → Supabase via `DATABASE_URL` using `pg` | `config/database.js` (`buildSequelizeOptions`, `dialectModule: pg`) | UT · PGlite over TCP end to end | Verified locally; Supabase blocked (B1) |
| S-12 | `admins`: id PK, email required+unique, password_hash required, created_at | `schema.sql`; `models/Admin.js` | SCH: unique, NOT NULL, normalised email, bcrypt-only hash · UT | Verified |
| S-13 | `inquiries`: id, name, email, phone (text), user_type, category, message, status (default New), created_at, updated_at | `schema.sql`; `models/Inquiry.js` | SCH: defaults, allowed values, NOT NULL for each field, text phone keeps `+`/leading zeros, `updated_at` trigger · UT | Verified |
| S-14 | Constraints for allowed values and required fields | `schema.sql` CHECK + NOT NULL | SCH: CHECK definitions read back from PostgreSQL equal `constants/inquiry.js` | Verified |
| S-15 | Indexes on category, user type, creation date | `inquiries_created_at_idx`, `inquiries_category_created_at_idx`, `inquiries_user_type_created_at_idx` | SCH | Verified |
| S-16 | Models with explicit camelCase ↔ snake_case mappings | `field:` on every attribute in `Admin.js`, `Inquiry.js` | UT: exact attribute→field maps · SCH + `db:check`: every column mapped, nullability matches | Verified |
| S-17 | No `sync({ alter: true })`; `schema.sql` is the reproducible schema | `scripts/db-migrate.js` runs `schema.sql`; no `sync` call anywhere | grep: no `.sync(` call · SCH: idempotent | Verified |
| S-18 | `.env.example` placeholders for NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_URL | `/.env.example` | UT | Verified |
| S-19 | Vite proxies API requests in development | `frontend/vite.config.js` (`/api` → `DEV_API_PROXY_TARGET`, default `localhost:4000`) | curl `localhost:5173/api/health` → 200 from Express | Verified |
| S-20 | Appropriate TLS verification for the Supabase endpoint | `DATABASE_SSL_MODE=verify-full` default + `DATABASE_SSL_CA[_PATH]`; `require` opt-in with warning; `disable` refused in production; URL `sslmode` ignored | UT · live: real Supabase pooler rejected without CA (`SELF_SIGNED_CERT_IN_CHAIN`) | Verified (successful verified connection needs B1 + CA) |
| S-21 | Automated tests for health endpoint and foundation | `backend/tests/**`, `frontend/tests/**` | backend 121 passed / 4 skipped; frontend 11 passed | Verified |

## 8. Stage 3 — public inquiry submission API (`POST /api/inquiries`)

| ID | Requirement | Implementation | Verification (test file → cases) | Status |
|----|-------------|----------------|----------------------------------|--------|
| I-01 | Public endpoint, no authentication | `routes/inquiry.routes.js` (no auth middleware) | `api/inquiries.test.js` "is public", "works for browser requests from the configured frontend origin" · `database/…` all cases unauthenticated | Verified |
| I-02 | Accepts name, email, phone, userType, category, message | `validators/inquiry.schema.js` (`createInquirySchema`) | `unit/inquiry.schema.test.js` "accepts a complete inquiry" · API "creates an inquiry…" | Verified |
| I-03 | Server-side validation independent of the frontend | Zod in `validate()` middleware before the controller | API: every invalid case → 400 and `createInquiry` **not called** | Verified |
| I-04 | Trim string input | `.trim()` on every field; enums trimmed in `preprocess`; inner whitespace collapsed for single-line fields | UT "trims every field and normalises…" · API "passes only sanitised, approved fields" · DB: stored `Ravi Kumar` from `"  Ravi  Kumar "` | Verified |
| I-05 | Reject empty required fields | `requiredText()` (`min(1)` after trim, `null`/missing → "X is required") | UT "reports every missing field", blanks `''`/`'   '`/`'\t\n'`, null · API "lists every missing required field", one test per field, whitespace-only | Verified |
| I-06 | Validate email format | `z.email()` after trim + lower-case, ≤ 254 | UT 8 invalid formats + length · API "rejects an invalid email" | Verified |
| I-07 | Phone length and reasonable international formatting | `PHONE_FORMAT` + 7–15 digit count + ≤ 20 chars | UT 8 valid international numbers, 7 invalid · API "rejects an invalid phone number" | Verified |
| I-08 | Sensible maximum lengths | name 100, email 254, phone 20, message 2000 (`FIELD_LIMITS`); matching DB CHECKs | UT boundary cases (100/101, 254/255+, 2000/2001) · API over-long message | Verified |
| I-09 | Only Parent / Student / School | `choice('User type', USER_TYPES)` | UT, API, SCH | Verified |
| I-10 | Only Scholarship / Concert / Admission / General Query | `choice('Category', CATEGORIES)` | UT, API, SCH | Verified |
| I-11 | Limit message length | 10–2000 chars | UT, API | Verified |
| I-12 | Reject malformed and invalid input | `express.json` errors → `INVALID_JSON`; non-object bodies → 400; `requireJson` → 415; control characters rejected | API "rejects malformed JSON", "JSON array body", "empty JSON body", form/text bodies → 415 · UT non-object bodies, NUL bytes | Verified |
| I-13 | Prevent mass assignment | `z.strictObject` rejects unknown keys with a per-field error; `CREATABLE_FIELDS` allow-list in the service and `Inquiry.create(…, { fields })` | UT `status`/`id`/`createdAt`/`isAdmin` rejected · API "rejects attempts to set unapproved fields", service not called · DB "writes nothing for an invalid request" | Verified |
| I-14 | 400 with understandable field errors | `errorHandler.formatZodIssues`: `details: [{ field, message }]`, first problem per field, unknown fields listed | API exact-body assertions · UT "reports only the first problem for each field" | Verified |
| I-15 | Save with Sequelize; status defaults to New | `inquiry.service.js` → `Inquiry.create`; model + DB default `New` | DB "stores a valid inquiry with status New…" · live smoke test row check | Verified (PGlite); Supabase blocked (B1) |
| I-16 | Timestamps populated correctly | Sequelize timestamps; `beforeCreate` hook makes `updatedAt` = `createdAt` on insert; DB trigger on update | DB: both ≈ request time and equal (this test found a 1 ms mismatch, now fixed) · SCH trigger test | Verified |
| I-17 | 201 + consistent JSON with success message and record id | `inquiry.controller.js`: `{ success: true, message, data: { id, duplicate } }`; errors `{ success: false, error: {…} }` | API exact-body assertions · DB response id = stored id | Verified |
| I-18 | Database errors without stack traces, credentials or internals | `errorHandler`: connection / timeout / transient PG codes → 503 `DATABASE_UNAVAILABLE`; other DB errors → 500 `DATABASE_ERROR`; unknown → 500 `INTERNAL_ERROR`; the response never includes `err.message`, in any environment; full detail logged server-side | API 5 failure cases assert no host, password, SQL or stack text in the body and that the failure is logged · UT transient codes · DB unreachable database → 503 with no leak · live outage → 503 | Verified |
| I-19 | Never report success when persistence fails | 201/200 are sent only after `createInquiry` resolves, i.e. after the transaction commits | API: every failure case asserts `success: false` and no `data` · DB unreachable → 503 · live outage → 503 | Verified |
| I-20 | Limit request body size | global `express.json({ limit: '20kb' })` | API "rejects bodies larger than 20 kb with 413", service not called | Verified |
| I-21 | Rate-limit public submissions | `middleware/rateLimiters.js` (express-rate-limit, per IP, default 10 / 15 min, `INQUIRY_RATE_LIMIT_*`), 429 `RATE_LIMITED` + `Retry-After` + `RateLimit` headers | API "allows the configured number…then 429", "counts invalid submissions too" · live smoke test 429 with headers | Verified. In-memory store (single instance). Bodies rejected by the JSON parser (malformed, oversized) never reach the limiter, but they never touch the database either |
| I-22 | Handle repeated submissions gracefully | `inquiry.service.js`: an identical submission within `INQUIRY_DUPLICATE_WINDOW_MINUTES` (default 10) returns the existing id with HTTP 200 and `duplicate: true`; transaction + `pg_advisory_xact_lock` serialises check-and-insert | DB "returns the existing id…", "stores one row when identical submissions arrive at the same time", "changed message is new", "window passed", "detection disabled" · API 200 shape · IT concurrent dedupe on real PostgreSQL written, not run (B1) | Verified on PGlite (which serialises connections); real lock contention verified only by IT once B1 is resolved |
| I-23 | Credentials only in the backend | `DATABASE_URL` read only by `backend/src/config`; frontend has no DB settings | Guard grep (P-03) | Verified |
| I-24 | Centralised error handling | every failure flows through `errorHandler` (Zod, body parser, 415, 429, Sequelize, unknown) | API + UT above | Verified |
| I-25 | Tests use no production credentials | API tests use stubs; DB tests use in-process PGlite on a random port; IT only with an explicit `TEST_DATABASE_URL` | REV | Verified |

### Test inventory (run 2026-10-30, `cd backend && npm test`)

| File | Tests | Result |
|------|-------|--------|
| `tests/unit/inquiry.schema.test.js` | 58 | passed |
| `tests/api/inquiries.test.js` | 32 | passed |
| `tests/database/inquiry.persistence.test.js` | 8 | passed |
| `tests/unit/errorHandler.test.js` | 15 | passed |
| `tests/schema/schema.test.js` | 39 | passed |
| `tests/unit/models.test.js` | 20 | passed |
| `tests/unit/database.test.js` | 20 | passed |
| `tests/unit/env.test.js` | 17 | passed |
| `tests/unit/foundation.test.js` | 6 | passed |
| `tests/api/app.test.js` | 8 | passed |
| `tests/api/health.test.js` | 4 | passed |
| `tests/integration/database.test.js` | 5 | **skipped** (no `TEST_DATABASE_URL`) |
| **Total** | **232** | **227 passed, 5 skipped, 0 failed** |

Required test categories → where they are covered:

| Requested test | Covered by |
|----------------|-----------|
| Valid submission | API "creates an inquiry and returns 201…"; DB "stores a valid inquiry with status New…" |
| Missing required fields | API "lists every missing required field" + 6 per-field cases + whitespace-only; UT required-field group |
| Invalid email | API "rejects an invalid email"; UT 8 formats + length |
| Invalid category and user type | API "rejects an invalid category and user type"; UT 4 + 4 values |
| Malformed or oversized requests | API malformed JSON, array body, empty body, 413 oversize, 415 form/text; UT non-object bodies, control chars |
| Database failure handling | API 503 unreachable, 503 timeout, 500 DB error, 500 unknown, 409 unique; DB real unreachable database → 503 |
| Public submission without authentication | API "is public…", CORS browser case; DB end-to-end cases |

## 9. Stage 4 — custom admin authentication

| ID | Requirement | Implementation | Verification (file → cases) | Status |
|----|-------------|----------------|-----------------------------|--------|
| AU-01 | Secure admin bootstrap | `scripts/createAdmin.js` (`npm run admin:create`), `services/admin.service.js` | DB `auth.persistence.test.js` → script: env, pipe, duplicate, weak password, `--password` refused; `createAdminAccount`: hash, duplicate (case-insensitive), concurrent creation, invalid input | Verified |
| AU-02 | Validate email and password | `adminEmailSchema`, `validateNewPassword` | UT `auth.test.js` → `validateNewPassword` (9 cases); DB invalid input writes nothing | Verified |
| AU-03 | bcrypt work factor 12; store only the hash | `BCRYPT_SALT_ROUNDS` default 12; `hashPassword` | UT cost/format; DB stored row `$2b$12$`; config default 12 | Verified |
| AU-04 | Reject duplicate emails | pre-check + `UNIQUE` constraint → `ADMIN_EXISTS` | DB duplicate, case-insensitive duplicate, concurrent; script exit 1 | Verified |
| AU-05 | Never log passwords or hashes | script prints email, id and cost only; logger never given secrets | DB script output checked for password, hash and salt; live API log has neither password nor token | Verified |
| AU-06 | No public default password / hardcoded credentials | no seed data and no default; test credentials only in `tests/helpers` | REV; secret grep | Verified |
| AU-07 | `POST /api/auth/login`: validate → find → `bcrypt.compare` → generic error → signed JWT | `auth.routes.js`, `auth.controller.js`, `auth.service.js` | API `auth.test.js` → login group (19 cases) | Verified |
| AU-08 | Only necessary claims; explicit expiration; issuer verified | `jwt.js` | UT exact claim keys; `exp − iat` = 3600; wrong issuer/audience rejected | Verified |
| AU-09 | Login rate limiting | `createLoginLimiter` | API rate-limit cases | Verified |
| AU-10 | HttpOnly cookie, Secure in production, SameSite, consistent clearing options | `utils/authCookie.js`; `buildAuthCookieConfig` | API cookie attributes, production `__Host-` + Secure, logout clearing attributes; UT config (Secure cannot be off in production, `none` needs Secure) | Verified |
| AU-11 | Restricted origins + CSRF/origin protection | CORS allow-list with credentials; `requireTrustedOrigin`; `createSessionCsrfGuard` | UT origin checks (8 cases); API login/logout/PATCH without Origin → 403, cookie-carrying POST elsewhere → 403, preflight allows `Content-Type` only with credentials | Verified |
| AU-12 | `POST /api/auth/logout`, `GET /api/auth/me` | `auth.controller.js` | API me (9 cases), logout (3 cases incl. replay → `TOKEN_REVOKED`) | Verified |
| AU-13 | Reusable middleware: extract from cookie; verify signature, expiry, issuer; 401 for missing/expired/malformed/invalid; populate identity; never trust client role | `middleware/authenticate.js`, `auth.service.authenticate` | API missing, expired, malformed, invalid signature, foreign secret, deleted admin, `Authorization` header ignored, `X-Role`/query role ignored | Verified |
| AU-14 | Protect every admin inquiry endpoint | `inquiry.routes.js` `router.use(authenticate, requireRole('admin'))` | API `inquiries.admin.test.js` (12 unauthorised cases + unknown subpath) | Verified |
| AU-15 | 403 when authenticated but not permitted | `requireRole` → `FORBIDDEN` | UT `requireRole` (allowed / 403 / 401). Only the `admin` role exists, so no route returns 403 for a valid admin today | Verified (unit) |
| AU-16 | Logout and subsequent requests | revocation list + cookie clearing | API logout flow; DB end to end; live | Verified (in-memory revocation: single instance) |
| AU-17 | Deployment implications documented | ARCHITECTURE §5.8, README "Deployment note" | REV | Done |
| AU-18 | No Supabase Auth | — | guard grep | Verified |

### Test inventory (run 2026-10-30, `cd backend && npm test`)

| File | Tests | Result |
|------|-------|--------|
| `tests/unit/auth.test.js` | 48 | passed |
| `tests/api/auth.test.js` | 36 | passed |
| `tests/api/inquiries.admin.test.js` | 27 | passed |
| `tests/database/auth.persistence.test.js` | 13 | passed |
| `tests/unit/inquiry.schema.test.js` | 58 | passed |
| `tests/api/inquiries.test.js` | 32 | passed |
| `tests/database/inquiry.persistence.test.js` | 8 | passed |
| `tests/schema/schema.test.js` | 39 | passed |
| `tests/unit/models.test.js` | 20 | passed |
| `tests/unit/database.test.js` | 20 | passed |
| `tests/unit/env.test.js` | 17 | passed |
| `tests/unit/errorHandler.test.js` | 15 | passed |
| `tests/unit/foundation.test.js` | 6 | passed |
| `tests/api/app.test.js` | 8 | passed |
| `tests/api/health.test.js` | 4 | passed |
| `tests/integration/database.test.js` | 5 | **skipped** (no `TEST_DATABASE_URL`) |
| **Total** | **356** | **351 passed, 5 skipped, 0 failed** |

Requested stage 4 tests → where they are covered:

| Requested test | Covered by |
|----------------|-----------|
| Valid login | API "signs in with valid credentials and sets a hardened session cookie"; DB session flow; live |
| Incorrect password | API "rejects an incorrect password with a generic 401 and no cookie"; DB; live |
| Unknown email | API "rejects an unknown email with exactly the same response"; live |
| Malformed requests | API 8 invalid bodies, malformed JSON, form body (415) |
| Missing JWT | API `/me` "returns 401 AUTH_REQUIRED without a cookie"; every inquiry route with no cookie |
| Invalid signature | UT tampered payload/signature, other secret, `alg: none`, HS512; API invalid signature + foreign secret; live |
| Expired token | UT `TOKEN_EXPIRED`; API `/me` and every inquiry route; live with a 3 s token |
| Protected route authorization | API authorised list/get/patch, `requireRole` 403 (UT), CSRF on PATCH |
| Logout and subsequent requests | API logout → `AUTH_REQUIRED`, replay → `TOKEN_REVOKED`; DB flow; live |
| Password hash storage | DB "stores only a bcrypt hash (cost 12)…"; UT hashing; SCH CHECK |
| Unauthorized access to inquiry records | API `inquiries.admin.test.js` unauthorised group; DB anonymous 401 and after logout 401 |

## 10. Stage 5: public inquiry form, admin sign-in, frontend session

| ID | Requirement | Implementation | Verification | Status |
|----|-------------|----------------|--------------|--------|
| UI-01 | `/` with User Type (Parent/Student/School) and Category (Scholarship/Concert/Admission/General Query) dropdowns, Name, Email, Phone, Message, Submit | `pages/InquiryPage.jsx`, `components/form/fields.jsx`, `constants/inquiry.js` | FE "has labelled controls with exactly the allowed options"; E2E | Verified |
| UI-02 | Responsive, professional layout | `styles/global.css` (tokens, 2-column form ≥ 640 px, intro beside ≥ 960 px, topic cards hidden on phones) | E2E desktop and 375 px (no horizontal overflow), light and dark | Verified |
| UI-03 | Accessible labels, keyboard access, focus styles, semantic HTML | `<label for>`, `aria-invalid`/`aria-describedby`, `required`, 3 px focus ring, skip link, landmarks, `role="alert"`/`"status"`, password toggle with `aria-pressed` | FE uses `getByLabelText`, `toHaveAccessibleDescription`, focus assertions, skip link test; E2E keyboard Enter submit | Verified |
| UI-04 | Client-side validation with field-level errors | `validation/inquiry.schema.js` (mirrors backend), RHF + zodResolver | FE empty submit → 6 messages + first field focused + no request; email/phone format; parity test (22 shared cases + constants) | Verified |
| UI-05 | Loading state; no repeated submission while a request runs | fieldset disabled, "Sending…" + `aria-busy`, ref guard | FE "submits, shows a loading state…", "sends only one request when submit is triggered repeatedly" (2 clicks + Enter → 1 call); E2E single POST | Verified |
| UI-06 | Real `POST /api/inquiries`; success only when the backend confirms | `api/inquiries.api.js` (requires `success: true` + `data.id`, else `UNCONFIRMED`) | FE client "rejects an unconfirmed response" ×4; FE no success before resolve; E2E reference = stored id | Verified |
| UI-07 | Success and failure messages | confirmation panel (focused, reference, duplicate variant); error alert keeping values; specific messages for network, rate limit, unconfirmed, 5xx; server field errors inline | FE 7 cases; E2E success | Verified |
| UI-08 | `/login` with email, password, validation, loading, error messages; redirect to `/admin/dashboard` | `pages/LoginPage.jsx`, `validation/login.schema.js` | FE validation, loading, redirect, generic error with password cleared and focused, rate limit / network / 5xx messages, return to the original page, open-redirect guard; E2E | Verified |
| UI-09 | Custom JWT API; no Supabase Auth | `api/auth.api.js` → `/api/auth/*` | guard grep: no `@supabase/` in the frontend lockfile; E2E | Verified |
| UI-10 | Credentials sent; no JWT in localStorage | Axios `withCredentials: true`; the token stays in the HttpOnly cookie | FE client config test; FE "never stores the session in localStorage or sessionStorage"; E2E `document.cookie` = "" and storages empty | Verified |
| UI-11 | Restore login via `GET /api/auth/me` | `AuthProvider` on mount | FE "restores an existing session…"; E2E reload → `/me` 200 | Verified |
| UI-12 | Logout through the backend; clear frontend state | `AuthProvider.logout` → `POST /api/auth/logout`, then state cleared; on failure stays signed in and says so | FE logout success (no further `/me` call, redirect) and failure; E2E 200 → "You have signed out." → dashboard redirects | Verified |
| UI-13 | Reusable protected route redirecting to login | `auth/ProtectedRoute.jsx` (loading, unavailable + retry, redirect with `from`) | FE 5 cases; E2E | Verified |
| UI-14 | Helpful empty and error states | `StatusScreen`, `NotFoundPage`, `RouteErrorPage`, dashboard empty state, API-unreachable retry | FE 404 and retry tests; E2E dashboard | Verified |
| UI-15 | API base URL / Vite proxy configured | `config.js` (`VITE_API_BASE_URL`, default `/api`), `vite.config.js` proxy | E2E through the proxy; FE client baseURL test | Verified |
| UI-16 | Build and lint | `npm run build`, `npm run lint` (incl. React Compiler rules) | pass, no warnings | Verified |

### Frontend test inventory (run 2026-10-30, `cd frontend && npm test`)

| File | Tests | Result |
|------|-------|--------|
| `tests/InquiryPage.test.jsx` | 14 | passed |
| `tests/auth.test.jsx` | 21 | passed |
| `tests/client.test.js` | 11 | passed |
| `tests/validation.test.js` | 25 | passed |
| **Total** | **71** | **71 passed** |

Backend at the end of stage 5: 351 passed, 5 skipped (integration, no `TEST_DATABASE_URL`).

## 11. Stage 6: admin dashboard and inquiry management

| ID | Requirement | Implementation | Verification | Status |
|----|-------------|----------------|--------------|--------|
| DB-01 | `/admin/dashboard` with app header, title, session indicator, logout, search, Category filter, User Type filter, reset, table | `pages/AdminDashboardPage.jsx`, `components/dashboard/*`, `components/layout/AdminLayout.jsx` (green dot + hidden "Signed in as" + email; Sign out) | FE "shows a loading state, then the header, session, controls and table" · E2E | Verified |
| DB-02 | Loading, error, empty and no-results states | first-load spinner; refresh keeps the table with `aria-busy` and dimming; error alert with retry; "No inquiries yet" with a link to the form; "No inquiries match your filters" with reset; past-last-page recovery | FE 5 state tests · E2E no-results | Verified |
| DB-03 | Exactly Name, Phone, Email, User Type, Category, Date, Status | `InquiryTable.jsx` | FE header order test | Verified |
| DB-04 | Readable timestamps; missing values handled | `lib/format.js` (`Intl.DateTimeFormat` date + time in the viewer's locale and zone, ISO in `dateTime`, full value in `title`); "Not provided" (screen readers) / "—" (visual); invalid dates handled; missing status shows New | FE formatting and missing-value tests | Verified |
| DB-05 | Category filter across all 4 categories | see D-02 | DB 4 cases; FE options exactly the 4 | Verified |
| DB-06 | User-type filter across all 3 types | see D-03 | DB 3 cases; FE options exactly the 3 | Verified |
| DB-07 | Search by name | see D-04 | DB case-insensitive and partial; E2E | Verified |
| DB-08 | Search by phone | see D-04 | DB as typed and formatting-insensitive; E2E | Verified |
| DB-09 | Combined filters and search | see D-05 | DB, FE, E2E | Verified |
| DB-10 | Clear filters | `useInquiryQuery.resetFilters` + search box reset; disabled when nothing is active | FE reset clears the URL, API params and search box. This test caught a real bug, now fixed: a stale debounced value re-applied the old search after reset. E2E reset | Verified |
| DB-11 | Filtering and search on the backend, not in browser memory | every change → new `GET /api/inquiries?…`; the UI never filters rows locally | FE asserts the API parameters for every control; DB tests prove server-side results | Verified |
| DB-12 | Sequelize conditions; case-insensitive PostgreSQL matching; no raw input concatenation | `Op.iLike`, `Op.like`, `Sequelize.where/fn/col`; `escapeLike` | UT SQL inspection (quotes escaped, nothing outside literals); DB injection attempts | Verified |
| DB-13 | Validate category and user type; whitelist sort fields | `listInquiriesQuerySchema` (enums, blank = no filter, arrays and unknown params rejected, search ≤ 100 chars without control characters, `sortBy` ∈ createdAt/name/category/userType/status, `sortDir` ∈ asc/desc) | UT 13 rejection cases; DB invalid params → 400 | Verified |
| DB-14 | Pagination: default 20, current page, total, next/previous; filters preserved | see D-06 | see D-06 | Verified |
| DB-15 | `PATCH /api/inquiries/:id/status` accepting only New / In Progress / Resolved; nonexistent records; DB errors; table updated; visible feedback | see D-07 | see D-07 | Verified |
| DB-16 | Every admin inquiry endpoint requires backend authentication | `router.use(authenticate, requireRole('admin'))` before list / detail / status routes | API 12 unauthorised cases + unknown subpath; DB unauthenticated list 401 and PATCH 401 (row unchanged) | Verified |
| DB-17 | Responsive, accessible table | scroll region (`role="region"`, labelled, focusable); sortable headers with `aria-sort`; status selects labelled "Status for {name}"; all 7 columns fit at 1024 px; page width exactly 375 px on phones (table scrolls inside) | E2E measurements. Found and fixed: Status column hidden at 1024 px; visually hidden labels inside the table widening the page on phones | Verified |

### Requested stage 6 tests → where they are covered

| Requested test | Covered by |
|----------------|-----------|
| Authenticated inquiry listing | DB `inquiry.dashboard.test.js` "lists the first 20 for a signed-in admin…"; API `inquiries.admin.test.js` authorised list; FE dashboard tests |
| Rejection of unauthenticated requests | DB "rejects unauthenticated requests without returning data"; API 12 unauthorised cases |
| Category filter | DB 4 cases; UT 4 SQL cases; FE "filters by category" |
| User-type filter | DB 3 cases; UT 3 SQL cases; FE "filters by user type" |
| Name search | DB "searches names case-insensitively and by part of the name"; UT ILIKE SQL |
| Phone search | DB "searches phone numbers as typed", "…regardless of spaces, dashes and brackets"; UT digits clause; FE debounced search |
| Combined filters | DB "combines category, user type and search", "pages through combined filters and search"; UT combined SQL; FE URL restore |
| Pagination | DB 4 pagination tests; FE 3 pagination tests |
| Valid status updates | DB "updates the status and the updated_at timestamp", accepts In Progress / New; FE success feedback |
| Invalid status rejection | DB 4 invalid values (row unchanged); API invalid bodies |
| Unauthorized status updates | DB unauthenticated 401 and no-Origin 403 (row unchanged); API PATCH with no cookie, invalid signature, expired or malformed token → 401 |

### Test inventory (run 2026-10-30)

**Backend** (`cd backend && npm test`): **424 tests: 419 passed, 5 skipped** (`tests/integration`, needs `TEST_DATABASE_URL`), 0 failed. New or extended this stage: `tests/database/inquiry.dashboard.test.js` 34, `tests/unit/inquiryQuery.test.js` 30, `tests/api/inquiries.admin.test.js` 31 (was 27).

**Frontend** (`cd frontend && npm test`): **94 passed**: `dashboard.test.jsx` 23 (new), `auth.test.jsx` 21, `validation.test.js` 25, `InquiryPage.test.jsx` 14, `client.test.js` 11. `npm run build` passes with no warnings.

**Browser, end to end** (`npm run dev:memory` + Vite, 26 test inquiries in the throwaway database):
- sign in → 1–20 of 26, newest first;
- Category = Scholarship → 8;
- plus User Type = Parent → 4;
- plus search `9876543210` → the 2 rows stored as `+91 98765-43210`;
- Reset → all 26 with an empty search box;
- `asha` → Asha Verma ×2 + ASHA Patel, one request per search;
- Next → 21–26, Page 2 of 2, Next disabled;
- status New → Resolved: PATCH 200, success message, DB row Resolved with a newer `updated_at`;
- unmatched search → no-results state;
- 1024 px: all 7 columns fit; 375 px dark theme: no page overflow.

## 12. Stage 7: enhancements (analytics, CSV export, usability)

| ID | Enhancement | Implementation | Verification | Status |
|----|-------------|----------------|--------------|--------|
| EN-01 | Summary cards: total, New, In progress, Resolved | `GET /api/inquiries/stats` (admin; `COUNT … GROUP BY status` and `GROUP BY category` via Sequelize, zero-filled); `SummaryCards.jsx` (cards also act as status filters, `aria-pressed`) | UT `inquiryStats.test.js` (4); DB stats tests (exact counts vs seed, numbers only, no parameters, 401); FE (5); E2E counts equal SQL ground truth (26 / 14 / 6 / 6) | Verified |
| EN-02 | Category breakdown chart | `CategoryBreakdown.jsx`: one hue, bars ≤ 24 px with 4 px rounded data ends, visible count and share (doubles as the table view), each bar filters by category | FE (3); E2E 8 / 7 / 6 / 5 | Verified |
| EN-03 | CSV export of the current filtered results, admin only | `GET /api/inquiries/export` (same filters, search and sort as the list; strict params; refuses more than 5000 rows with 422); `utils/csv.js` (every field quoted, quotes doubled, CRLF, UTF-8 BOM, OWASP formula neutralization of `= + - @`, tab and CR); `utils/inquiryCsv.js` (inquiry fields only) | UT `csv.test.js` (33); DB export tests (headers, order, filters, parity with the list, formula row, no hash or admin data, 400s, row cap); API 401 for every bad-token case; FE export (4); mutation check (no neutralization → 13 failures); E2E 5 filtered rows, formula neutralized, anonymous 401 | Verified |
| EN-04 | Usability | sortable Date (existing); counts "x–y of n matching (N in total)"; active-filter chips with per-filter remove and Clear all; sticky Name column under 1000 px; stats refresh after a status change; labelled, keyboard-operable controls | FE chips (3), counts (2), stats refresh (1); E2E | Verified |

Test totals (2026-10-30): backend **486 tests: 481 passed, 5 skipped** (integration, needs `TEST_DATABASE_URL`); frontend **112 passed**; lint and build pass in both packages.
