# Requirements Traceability Matrix

Every mandatory requirement, the files that implement (or will implement) it, and how it is verified.
Last updated: **2026-10-30, end of stage 3** (public inquiry submission API). Status is only `Verified` when the named check was actually executed.
Phase numbers refer to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Paths are relative to the repository root.

**Status legend:** `Planned` → `Implemented` → `Verified` (verification actually executed). `Blocked (Bx)` = waiting on a blocker from the implementation plan.
**Status legend (partial):** `Partial` = the layers listed in *Done so far* exist and are verified; the rest is planned.
**Verification legend:** **UT** unit test · **API** Supertest with stubbed services · **DB** Supertest through the real app, service, Sequelize and `pg` against an isolated in-process PostgreSQL (PGlite socket, `backend/tests/database`) · **SCH** `schema.sql` executed in PGlite (real PostgreSQL in WASM, `backend/tests/schema`) · **IT** integration test against real Postgres (needs `TEST_DATABASE_URL`) · **FE** frontend component test · **MAN** manual check (steps in README) · **REV** code/file review · **CI** automated pipeline.

---

## 1. Public inquiry form

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| F-01 | User Type field with options Parent, Student, School | `backend/src/constants/inquiry.js` (`USER_TYPES`); `backend/src/validators/inquiry.schema.js` (`choice`); `backend/src/models/Inquiry.js` (`isIn`); `schema.sql` (CHECK); frontend select planned | UT `inquiry.schema.test.js`: each value accepted, `Teacher`/`parent`/`PARENT`/`Parents` rejected · API `inquiries.test.js`: invalid user type → 400 with message · SCH: CHECK values = constants · FE planned | 1, 4, 5 | Partial — **server side Verified** (UT, API, SCH); form dropdown planned (Phase 5) |
| F-02 | Category field with options Scholarship, Concert, Admission, General Query | `CATEGORIES` in constants; `backend/src/validators/inquiry.schema.js`; model `isIn`; `schema.sql` CHECK; frontend select planned | UT: 4 values accepted, `Sports`/`admission`/`General`/`General  Query` rejected · API: invalid category → 400 · SCH · FE planned | 1, 4, 5 | Partial — **server side Verified** (UT, API, SCH); form dropdown planned |
| F-03 | Name required | `backend/src/validators/inquiry.schema.js` (trim, required, 2–100 chars, ≥ 1 letter, no control chars, whitespace collapsed); `schema.sql` NOT NULL + length CHECK | UT: missing / null / empty / whitespace-only / non-string / too short / too long / digits-only / NUL byte · API: missing `name` → 400 `{field:"name"}`; whitespace-only → 400 · DB: invalid request writes no row | 4, 5 | Partial — **server side Verified**; client-side validation planned |
| F-04 | Email required | `backend/src/validators/inquiry.schema.js` (trim, required, ≤ 254, lower-cased, `z.email`); `schema.sql` format CHECK | UT: 8 malformed formats, > 254 chars, case normalised · API: `asha@example` → 400 with message, service not called · DB: stored lower-cased | 4, 5 | Partial — **server side Verified**; client-side validation planned |
| F-05 | Phone Number required | `backend/src/validators/inquiry.schema.js` (trim, required, international format: optional leading `+`, digits/spaces/hyphens/brackets, 7–15 digits per E.164, ≤ 20 chars; not tied to any one country); `schema.sql` CHECK | UT: 8 international formats accepted (US, UK, AU, DE, JP, IN, local); letters, misplaced `+`, leading `-`, < 7 / > 15 digits, > 20 chars rejected · API: invalid phone → 400 · DB: stored as text, `+` kept | 4, 5 | Partial — **server side Verified**; client-side validation planned |
| F-06 | Message/Query required | `backend/src/validators/inquiry.schema.js` (trim, required, 10–2000 chars, no control chars, CRLF → LF); `schema.sql` length CHECK (1–2000) | UT: missing / empty / < 10 / 2000 accepted / 2001 rejected / control chars · API: 2001 chars → 400 | 4, 5 | Partial — **server side Verified**; client-side validation planned |
| F-07 | Submissions saved to Supabase PostgreSQL | `backend/src/routes/inquiry.routes.js` (`POST /api/inquiries`); `controllers/inquiry.controller.js`; `services/inquiry.service.js` (`createInquiry`, explicit field allow-list, dedupe in a transaction); `models/Inquiry.js`; `config/database.js`; `server.js` wiring | API: 201 `{success, message, data:{id, duplicate:false}}`; service receives only sanitised fields · DB `inquiry.persistence.test.js`: row stored with status `New`, `created_at` = `updated_at` ≈ now, values normalised; response id = row id · live smoke test (PGlite over TCP) 201 and row verified · IT written (`TEST_DATABASE_URL`), not run | 4, 5 | **Verified** against PostgreSQL (PGlite); real Supabase run blocked (B1); frontend form planned |
| F-08 | Form is publicly accessible (no login) | `inquiry.routes.js`: `POST /` has no `authenticate` middleware; frontend route planned | API: submission with no Authorization header → 201; browser request from the allowed origin → 201 with CORS header · DB: same, end to end | 4, 5 | Partial — **API Verified**; frontend route planned |

## 2. Admin authentication

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| A-01 | Custom backend authentication (no Supabase Auth) | `backend/src/services/auth.service.js`; `backend/src/controllers/auth.controller.js`; `backend/src/routes/auth.routes.js`; `schema.sql` (`admins` table) | REV: no `@supabase/*` dependency in either `package.json`, no `auth.users` references · CI: `grep` check fails build if `@supabase/` appears | 3 | Planned |
| A-02 | Passwords hashed with bcrypt | `backend/src/utils/password.js`; `backend/scripts/seed-admin.js`; `admins.password_hash` | UT: hash ≠ plaintext, starts with `$2b$12$`, `verifyPassword` true/false · IT: stored value is a bcrypt hash | 3 | Planned |
| A-03 | Login issues a JWT via `jsonwebtoken` | `backend/src/utils/jwt.js` (`signAccessToken`); `auth.service.js` (`login`); `POST /api/auth/login` | UT: token decodes with `sub`, `exp`, `iss`, `aud` · API: valid creds → `200 { token, expiresIn, admin }`; wrong password / unknown email → identical `401`; malformed body → `400` · MAN: curl steps in README | 3 | Planned |
| A-04 | JWT signature verified | `backend/src/utils/jwt.js` (`verifyAccessToken`, `algorithms: ['HS256']`); `backend/src/middleware/authenticate.js` | UT: tampered payload, token signed with another secret, `alg: none` token → rejected · API: each → `401 INVALID_TOKEN` | 3 | Planned |
| A-05 | JWT expiration verified | `jwt.js` (`expiresIn` from `JWT_EXPIRES_IN`); `authenticate.js` (`TokenExpiredError` → `TOKEN_EXPIRED`); `frontend/src/api/client.js` (401 → logout) | UT: token with past `exp` → rejected · API: expired token → `401 TOKEN_EXPIRED` · FE: 401 response clears session and redirects · MAN: README shows how to mint a 10-second token and observe expiry | 3, 6 | Planned |
| A-06 | Admin dashboard protected | `frontend/src/auth/ProtectedRoute.jsx`; `frontend/src/auth/AuthContext.jsx`; `frontend/src/App.jsx` | FE: visiting `/admin` unauthenticated → redirected to `/admin/login`; authenticated → dashboard renders · MAN | 6 | Planned |
| A-07 | All inquiry-management APIs protected | `backend/src/routes/inquiry.routes.js` (`authenticate` on `GET /`, `GET /:id`, `PATCH /:id/status`); `GET /api/auth/me` | API: table-driven test hits every protected route with no token, malformed header, invalid token, expired token → all `401`; valid token → `2xx`. Note: `POST /api/inquiries` is intentionally public (F-08) | 3, 4 | Planned |
| A-08 | No hardcoded credentials; admin provisioning is secure | `backend/scripts/seed-admin.js` (env/prompt, min length 12, no logging); no registration route; `.env.example` placeholders only; server refuses the placeholder `JWT_SECRET` (done, UT); DB rejects non-bcrypt `password_hash` (done, SCH) | REV · UT: seed script rejects short passwords · CI: secret-pattern grep | 3, 7 | Planned |
| A-09 | Brute-force and enumeration resistance (production-conscious) | `backend/src/middleware/rateLimiters.js` (`loginLimiter`); dummy-hash compare in `auth.service.js` | API: 11th attempt in window → `429`; unknown email and wrong password return identical bodies | 3 | Planned |

## 3. Admin dashboard

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| D-01 | Display Name, Phone, Email, User Type, Category, Date, Status | `frontend/src/components/dashboard/InquiryTable.jsx`; `StatusBadge.jsx`; `backend/src/services/inquiry.service.js` (`list` attributes); `GET /api/inquiries` | FE: table renders all 7 column headers and values from mocked data; Date formatted from `createdAt` · API: list response items include all 7 fields | 4, 6 | Planned |
| D-02 | Filter by Category | `FilterBar.jsx`; `useInquiryFilters.js`; `inquiry.schema.js` (`category` query param); `buildInquiryWhere.js` | UT: `{category}` → `where.category` · API: invalid category → `400` · IT: only matching rows returned · FE: selecting a category sends `category=` and updates URL | 4, 6 | Planned |
| D-03 | Filter by User Type | As D-02 (`userType` → `user_type`) | UT · API · IT · FE | 4, 6 | Planned |
| D-04 | Search by Name or Phone Number | `SearchInput.jsx` (300 ms debounce); `useDebouncedValue.js`; `buildInquiryWhere.js` (`Op.or` of name `ILIKE`, phone `ILIKE`, digits-only phone); LIKE escaping; trigram indexes deferred (see ARCHITECTURE §3) | UT: OR clause built; `%`/`_` escaped; digits clause only when ≥3 digits · IT: partial, case-insensitive name match; phone match with and without formatting; `%` does not match everything · FE: typing debounces to one request | 1, 4, 6 | Planned |
| D-05 | Filters and search combine | `buildInquiryWhere.js` (AND of all filters, AND with search OR-group); `useInquiryFilters.js` (all params in one query string) | UT: every combination of {category, userType, status, search} produces the correct clause (table-driven) · IT: seeded dataset, combined query returns exact expected IDs · FE: setting two filters + search sends all params together · MAN | 4, 6 | Planned |
| D-06 | Dashboard usable at scale (production-conscious) | Server-side pagination (`page`, `pageSize` ≤ 100); `Pagination.jsx`; sort; indexes | API: `pageSize=500` → `400`; meta totals correct · IT | 4, 6 | Planned |
| D-07 | Status is meaningful and maintainable (New / In Progress / Resolved) | `status` column default `New` (SCH-verified); `PATCH /api/inquiries/:id/status`; `StatusSelect.jsx` | API: valid status → `200`, invalid → `400`, unknown id → `404`, no token → `401` · FE: optimistic update rolls back on error | 1, 4, 6 | Planned |

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
