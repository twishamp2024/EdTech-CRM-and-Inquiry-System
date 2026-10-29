# Requirements Traceability Matrix

Every mandatory requirement, the files that implement (or will implement) it, and how it is verified.
Last updated: **2026-10-30, end of stage 2** (foundation + database layer). Status is only `Verified` when the named check was actually executed.
Phase numbers refer to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Paths are relative to the repository root.

**Status legend:** `Planned` → `Implemented` → `Verified` (verification actually executed). `Blocked (Bx)` = waiting on a blocker from the implementation plan.
**Status legend (partial):** `Partial` = the layers listed in *Done so far* exist and are verified; the rest is planned.
**Verification legend:** **UT** unit test · **API** Supertest with stubbed services · **SCH** `schema.sql` executed in PGlite (real PostgreSQL in WASM, `backend/tests/schema`) · **IT** integration test against real Postgres (needs `TEST_DATABASE_URL`) · **FE** frontend component test · **MAN** manual check (steps in README) · **REV** code/file review · **CI** automated pipeline.

---

## 1. Public inquiry form

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| F-01 | User Type field with options Parent, Student, School | `backend/src/constants/inquiry.js` (`USER_TYPES`); `backend/src/validators/inquiry.schema.js`; `backend/src/models/Inquiry.js` (`isIn`); `schema.sql` (`CHECK`); `frontend/src/constants/inquiry.js`; `frontend/src/pages/InquiryFormPage.jsx` (`SelectField`) | UT: schema accepts each value and rejects others · FE: select renders exactly 3 options · IT: DB rejects invalid `user_type` | 1, 4, 5 | Partial — DB CHECK, constants and model `isIn` verified (SCH, UT); API + form planned |
| F-02 | Category field with options Scholarship, Concert, Admission, General Query | Same files as F-01 (`CATEGORIES`) | UT · FE: 4 options · IT: DB rejects invalid `category` | 1, 4, 5 | Partial — DB CHECK, constants and model `isIn` verified (SCH, UT); API + form planned |
| F-03 | Name required | `backend/src/validators/inquiry.schema.js`; `frontend/src/validation/inquiry.schema.js`; `schema.sql` (`NOT NULL`) | UT: missing/blank/too-short name → error · API: `400` with `details[].path = name` · FE: inline error, no request sent | 4, 5 | Partial — DB NOT NULL/CHECK and model validators verified (SCH, UT); API + form planned |
| F-04 | Email required | As F-03 (email format + max length) | UT: missing/invalid email → error · API · FE | 4, 5 | Partial — DB NOT NULL/CHECK and model validators verified (SCH, UT); API + form planned |
| F-05 | Phone Number required | As F-03 (allowed chars, 7–15 digits) | UT: missing, letters, too few/many digits → error; `+91 98765-43210` accepted · API · FE | 4, 5 | Partial — DB NOT NULL/CHECK and model validators verified (SCH, UT); API + form planned |
| F-06 | Message/Query required | As F-03 (10–2000 chars); `schema.sql` length `CHECK` | UT · API · FE | 4, 5 | Partial — DB NOT NULL/CHECK and model validators verified (SCH, UT); API + form planned |
| F-07 | Submissions saved to Supabase PostgreSQL | `backend/src/routes/inquiry.routes.js` (`POST /api/inquiries`); `backend/src/controllers/inquiry.controller.js`; `backend/src/services/inquiry.service.js` (`create`); `backend/src/models/Inquiry.js`; `backend/src/config/database.js`; `frontend/src/api/inquiries.api.js` | API: `201` + body shape, service called with parsed data · IT: row persisted with `status = 'New'` and `created_at` set · MAN: submit via UI, row visible in Supabase table editor | 4, 5 | Partial — `Inquiry` model + Sequelize/pg connection layer done; integration test written, not run (B1); route planned |
| F-08 | Form is publicly accessible (no login) | `frontend/src/App.jsx` (route `/` outside `ProtectedRoute`); `inquiry.routes.js` (`POST /` without `authenticate`) | API: POST without token → `201` · FE: form renders without auth context | 4, 5 | Planned |

## 2. Admin authentication

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| A-01 | Custom backend authentication (no Supabase Auth) | `backend/src/services/auth.service.js`; `backend/src/controllers/auth.controller.js`; `backend/src/routes/auth.routes.js`; `schema.sql` (`admins` table) | REV: no `@supabase/*` dependency in either `package.json`, no `auth.users` references · CI: `grep` check fails build if `@supabase/` appears | 3 | Planned |
| A-02 | Passwords hashed with bcrypt | `backend/src/utils/password.js`; `backend/scripts/seed-admin.js`; `admins.password_hash` | UT: hash ≠ plaintext, starts with `$2b$12$`, `verifyPassword` true/false · IT: stored value is a bcrypt hash | 3 | Planned |
| A-03 | Login issues a JWT via `jsonwebtoken` | `backend/src/utils/jwt.js` (`signAccessToken`); `auth.service.js` (`login`); `POST /api/auth/login` | UT: token decodes with `sub`, `exp`, `iss`, `aud` · API: valid creds → `200 { token, expiresIn, admin }`; wrong password / unknown email → identical `401`; malformed body → `400` · MAN: curl steps in README | 3 | Planned |
| A-04 | JWT signature verified | `backend/src/utils/jwt.js` (`verifyAccessToken`, `algorithms: ['HS256']`); `backend/src/middleware/authenticate.js` | UT: tampered payload, token signed with another secret, `alg: none` token → rejected · API: each → `401 INVALID_TOKEN` | 3 | Planned |
| A-05 | JWT expiration verified | `jwt.js` (`expiresIn` from `JWT_EXPIRES_IN`); `authenticate.js` (`TokenExpiredError` → `TOKEN_EXPIRED`); `frontend/src/api/client.js` (401 → logout) | UT: token with past `exp` → rejected · API: expired token → `401 TOKEN_EXPIRED` · FE: 401 response clears session and redirects · MAN: README shows how to mint a 10-second token and observe expiry | 3, 6 | Planned |
| A-06 | Admin dashboard protected | `frontend/src/auth/ProtectedRoute.jsx`; `frontend/src/auth/AuthContext.jsx`; `frontend/src/App.jsx` | FE: visiting `/admin` unauthenticated → redirected to `/admin/login`; authenticated → dashboard renders · MAN | 6 | Planned |
| A-07 | All inquiry-management APIs protected | `backend/src/routes/inquiry.routes.js` (`authenticate` on `GET /`, `GET /:id`, `PATCH /:id/status`); `GET /api/auth/me` | API: table-driven test hits every protected route with no token, malformed header, invalid token, expired token → all `401`; valid token → `2xx` | 3, 4 | Planned |
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
