# Implementation Plan — EdTech CRM & Inquiry Management System

Status: **Stage 6 (admin dashboard and inquiry management) complete. All mandatory features are implemented.** Next: deployment (Phase 8: Vercel `/api` rewrite, `render.yaml`, Supabase) and CI (7.6).
Design details: [ARCHITECTURE.md](ARCHITECTURE.md). Requirement mapping: [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md).

---

## Progress

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Repository & database schema | **Done** (applying to Supabase blocked on B1) |
| 2 | Backend foundation | **Done** |
| 3 | Authentication | **Done**: bcrypt + JWT in an HttpOnly cookie, login/logout/me, `authenticate` + `requireRole`, CSRF origin checks, login rate limit, `admin:create` |
| 4 | Inquiry APIs | **Done**: public create; protected list with filters, search, whitelisted sort and pagination; detail; status update |
| 5 | Frontend foundation & public form | **Done** |
| 6 | Admin login & dashboard | **Done** |
| 7 | Tests & quality gates | Ongoing: suites exist for everything built so far; CI not set up |
| 8 | Documentation & deployment | README covers stage 2; deployment not started |

### Stage 6 verification log (2026-10-30)

| Command | Result |
|---------|--------|
| `backend: npm run lint` / `format:check` / `npm test` | pass / pass / **424 tests: 419 passed, 5 skipped** (integration) |
| `frontend: npm run lint` / `format:check` / `npm test` / `npm run build` | pass / pass / **94 passed** / pass, no warnings |
| `npm audit --omit=dev` (both) | 0 vulnerabilities |
| Mutation checks | removing LIKE escaping → 1 DB test fails; removing the digits-only phone match → 1 DB test fails (both reverted, file byte-identical) |
| Browser end to end | see traceability §11 |
| Found and fixed | stale debounced search re-applied after Reset (caught by a frontend test); Status column hidden at 1024 px; visually hidden labels inside the table widened the page on phones; the Next button's chevron was misaligned |

### Stage 5 verification log (2026-10-30)

| Command | Result |
|---------|--------|
| `frontend: npm run lint` / `format:check` | pass (React Compiler lint rules included) |
| `frontend: npm test` | **4 files, 71 tests passed**: `InquiryPage` 14, `auth` 21, `client` 11, `validation` 25 |
| `frontend: npm run build` | pass, no warnings; app 22.8 kB (7.7 kB gz), react 313 kB (99 kB gz), forms 117 kB (36 kB gz), vendor 66 kB (25 kB gz) |
| `backend: npm test` / `lint` | 351 passed, 5 skipped (integration, no `TEST_DATABASE_URL`) / pass. Only addition: `scripts/dev-memory.js` |
| Browser, end to end (`npm run dev:memory` + `vite`, in-app browser) | empty submit → 6 field errors, first focused, no request · valid submit → exactly one `POST /api/inquiries` 201 → confirmation with reference `D65834CA` = stored row id `d65834ca-…` (status `New`, equal timestamps) · `/admin/dashboard` anonymous → `/login` "Please sign in to continue." · wrong password → generic error, password cleared and focused · correct password → `/admin/dashboard` · `document.cookie`, `localStorage` and `sessionStorage` empty · reload → `/api/auth/me` 200, session restored · Sign out → `POST /api/auth/logout` 200 → "You have signed out." → `/admin/dashboard` again → `/login` · 375 px light theme: no horizontal overflow; public page made 0 `/api/auth/me` calls |
| Found and fixed during verification | email input stretched by the phone hint in the grid row; focus lost after server errors (fieldset still disabled); logout redirect race; public page calling `/api/auth/me`; topic cards pushing the form below the fold on phones |

### Stage 4 verification log (2026-10-30)

| Command | Result |
|---------|--------|
| `backend: npm run lint` / `format:check` | pass |
| `backend: npm test` | **16 files: 15 passed, 1 skipped; 356 tests: 351 passed, 5 skipped** (skipped = `tests/integration`, no `TEST_DATABASE_URL`) |
| New suites | `unit/auth.test.js` 48, `api/auth.test.js` 36, `api/inquiries.admin.test.js` 27, `database/auth.persistence.test.js` 13 |
| Mutation checks | allowing HS512 in `verify` → 1 test fails; making `verifyPassword` always succeed → 4 tests fail (both mutations reverted) |
| `frontend: npm run lint` / `npm test` / `npm run build` | pass / 11 passed / pass |
| Live run (server → PGlite over TCP, curl cookie jar) | `admin:create` stores `$2b$12$…` (60 chars); duplicate exits 1; password absent from output; anonymous list 401; wrong password and unknown email give identical 401s; login without Origin 403; valid login sets `HttpOnly; SameSite=Strict; Max-Age` with claims `sub, role, jti, iat, exp, iss, aud`; `/me` 200; admin list 200; PATCH without Origin 403; tampered signature 401 `INVALID_TOKEN`; logout 200 → 401 `AUTH_REQUIRED`; replayed old token 401 `TOKEN_REVOKED`; expired token 401 `TOKEN_EXPIRED`; no password or token in the API log |

**Not verified:** authentication against a real Supabase database (B1), and behaviour in a deployed browser setup (Vercel rewrite + Render, B4).

### Stage 3 verification log (2026-10-30)

| Command | Result |
|---------|--------|
| `backend: npm run lint` / `format:check` | pass |
| `backend: npm test` | **12 files: 11 passed, 1 skipped; 232 tests: 227 passed, 5 skipped** (skipped = `tests/integration`, no `TEST_DATABASE_URL`) |
| New suites | `unit/inquiry.schema.test.js` 58, `api/inquiries.test.js` 32, `database/inquiry.persistence.test.js` 8 (real app + Sequelize + pg → in-process PGlite) |
| Defect found and fixed | on insert `updated_at` could be 1 ms later than `created_at`; fixed with a `beforeCreate` hook |
| Live smoke test (server → PGlite over TCP) | 201 + row stored (trimmed, lower-cased email, status `New`, equal timestamps); identical repeat → 200 same id; invalid → 400 with 7 field errors; bad JSON 400; form post 415; 429 with `RateLimit` headers; DB stopped → 503 with a generic body, full error only in the server log |

**Not verified:** persistence and advisory-lock contention on a real Supabase/PostgreSQL server (B1; the integration test is written).

### Stage 2 verification log (2026-10-30)

| Command | Result |
|---------|--------|
| `backend: npm run lint` | pass (0 problems) |
| `backend: npm run format:check` | pass |
| `backend: npm test` | **8 files passed, 1 skipped; 121 tests passed, 4 skipped** (skipped = `tests/integration`, no `TEST_DATABASE_URL`) |
| `frontend: npm run lint` | pass (0 problems) |
| `frontend: npm test` | **2 files, 11 tests passed** |
| `frontend: npm run build` | pass (`dist/` 222 kB JS / 70 kB gzip) |
| `frontend: npm run format:check` | pass |
| `npm audit --omit=dev` (both) | 0 vulnerabilities (backend after the `uuid` override, see ARCHITECTURE §9) |
| Guard greps | no `@supabase/` packages, `sqlite3` not installed, no DB settings in `frontend/`, no secret patterns, no `.sync(` calls, no TODOs |
| Server boot with no env | exits 1, lists all missing variables |
| Server boot, DB port closed, 1 retry | retries once, logs `ECONNREFUSED` without credentials, exits 1 |
| Server boot against **real Supabase pooler**, `verify-full`, no CA | TLS rejected (`SELF_SIGNED_CERT_IN_CHAIN`) with CA hint, exits 1 (fails during the handshake, before any credentials are sent) |
| PGlite over the Postgres wire protocol (scratchpad only): `db:check` → `db:migrate` ×2 → `db:check` → `npm start` → curl | check fails before migrate; migrate is idempotent; check passes; `/api/health` 200, `/api/health/db` 200 then 503 after DB stopped; CORS allow/deny; 404 envelope; SIGTERM exits 0 |
| Vite dev server → `/api/health` via proxy | 200 with `Access-Control-Allow-Origin: http://localhost:5173` |

**Not verified:** a successful connection to a real Supabase database (no credentials available, B1), and `tests/integration` (needs `TEST_DATABASE_URL`).

---

## 0. Environment (re-inspected 2026-10-30)

| Item | Finding | Impact |
|------|---------|--------|
| Git | Repo exists on `main`, remote `origin` → `github.com/twishamp2024/EdTech-CRM-and-Inquiry-System`; commits contain LICENSE (MIT), README, `.gitignore`, docs | GitHub deliverable exists; stage 2 work is uncommitted |
| Node.js / npm | v26.12.1 / 11.20.0 | `engines >=22.12.0`, `.nvmrc` 24 for deploy targets |
| npm `allowScripts` | npm 11 skipped bcrypt's install script | Not needed: bcrypt 6 loads its bundled prebuilt binary (verified; `linux-x64` included for Render) |
| Supabase TLS | Pooler cert chain ends at the private `Supabase Root 2021 CA` | `verify-full` needs the CA file from the dashboard (see ARCHITECTURE §7) |
| psql / Docker | Not installed | Schema verified with PGlite in tests; real DB via Supabase |
| Render / Vercel CLIs | Not installed | Deploy through dashboards |

### Blockers and open items

| ID | Item | Blocks | Needed from you |
|----|------|--------|-----------------|
| **B1** | No Supabase `DATABASE_URL` | Applying the schema, `db:check`, integration tests, real end-to-end runs, deployment | Create the Supabase project. Put the **session pooler** URL in `backend/.env` yourself (not in chat) and download the CA certificate to `backend/certs/supabase-ca.crt` |
| **B2** | No real admin account | Signing in against Supabase | Run `npm run admin:create` yourself once B1 is done; choose the password at the prompt |
| B3 | ~~No GitHub repo~~ | — | **Resolved**: repo exists. Pushing still needs your go-ahead |
| **B4** | No Render / Vercel access | Live deployment | Connect accounts to the repo |
| N1 | Commit email (`…2022@gmail.com`) differs from the GitHub account's initial-commit email (`…2024@gmail.com`) | Commit attribution only | Optional: add the email to your GitHub account |

---

## 1. Guiding decisions

1. **Two independent npm packages** (`frontend/`, `backend/`) for plain root-directory deploys on Render and Vercel.
2. **`schema.sql` is the source of truth**; models mirror it with explicit field mappings; no `sync()`. Later changes go in numbered `migrations/` files.
3. **Testable without a database:** `createApp()` takes injected dependencies. Schema SQL is executed in **PGlite** (PostgreSQL 18 compiled to WASM). Real-DB tests run only with `TEST_DATABASE_URL` and report as *skipped* otherwise. **No SQLite anywhere.**
4. **Vitest** in both packages.
5. **JWT in an HttpOnly, SameSite=Strict cookie** (stage 4 decision, replacing the stage 1 Bearer-token plan). Deploy so the browser sees the SPA and the API as one site (Vercel `/api` rewrite), with Origin-header CSRF checks on state-changing requests.
6. **Server-side filtering, search and pagination.**
7. **Status** values `New` / `In Progress` / `Resolved`, default `New`, editable by admins.
8. **TLS `verify-full` by default** with Supabase's CA; unverified TLS only by explicit opt-in.
9. **Fail fast at startup** on invalid config or an unreachable database, with actionable, credential-free log messages.
10. **Express 5**: async errors propagate automatically. `req.query` is read-only, so validated input lives on `req.validated`.

Changes from the stage 1 plan, made to match the stage 2 requirements:
- `admins` has exactly `id`, `email`, `password_hash`, `created_at` (dropped `name`, `is_active`, `last_login_at`, `updated_at`). Revocation is done by deleting the admin.
- Status `Closed` removed.
- `CORS_ORIGINS` → `FRONTEND_URL`; `DB_SSL*` → `DATABASE_SSL_MODE` / `DATABASE_SSL_CA[_PATH]`.
- Health endpoints split into `/api/health` (liveness) and `/api/health/db` (readiness).
- `pg_trgm` search indexes deferred; composite filter+date indexes added instead.
- `nodemon` replaced by `node --watch`; `asyncHandler` dropped (Express 5).

---

## 2. Work breakdown

### Phase 1 — Repository & database ✅

| # | Task | Output | Status |
|---|------|--------|--------|
| 1.1 | Git repo; extend `.gitignore` (`!.env.example`, tool caches); `.editorconfig`, Prettier config, `.nvmrc` | root files | Done |
| 1.2 | `schema.sql`: tables, CHECK constraints, defaults, indexes, `updated_at` trigger, RLS; idempotent, transactional | `schema.sql` | Done — verified in PGlite |
| 1.3 | Root `.env.example` (placeholders only) | `.env.example` | Done |
| 1.4 | Apply schema to Supabase; run `db:check` | Supabase DB | **Blocked (B1)** |

### Phase 2 — Backend foundation ✅

| # | Task | Output | Status |
|---|------|--------|--------|
| 2.1 | `package.json` (ESM, engines, `dev`/`start`/`test`/`test:integration`/`lint`/`format`/`db:migrate`/`db:check`); dependencies | `backend/package.json` | Done |
| 2.2 | dotenv + Zod config with fail-fast errors | `src/config/env.js` | Done |
| 2.3 | Sequelize + pg, TLS modes, pool, timeouts, retry, health check, error hints | `src/config/database.js` | Done |
| 2.4 | Constants, `Admin` / `Inquiry` models with explicit field mappings | `src/constants`, `src/models` | Done |
| 2.5 | `AppError`, logger, request logger, `notFound`, `errorHandler`, `validate` | `src/utils`, `src/middleware` | Done |
| 2.6 | `app.js` (Helmet, CORS, JSON limit, trust proxy) and `server.js` (connect, listen, graceful shutdown) | `src/app.js`, `src/server.js` | Done |
| 2.7 | `GET /api/health`, `GET /api/health/db` | health controller + routes | Done |
| 2.8 | `db:migrate`, `db:check` scripts | `scripts/` | Done — verified against PGlite over TCP |

### Phase 3 — Authentication (next)

| # | Task | Output |
|---|------|--------|
| 3.1 ✅ | `utils/password.js` — `hashPassword`, `verifyPassword`, `getDummyHash` (bcrypt, `BCRYPT_SALT_ROUNDS` default 12) | `src/utils/password.js` |
| 3.2 ✅ | `utils/jwt.js` — HS256 pinned, `sub`/`role`/`jti`, `iss`, `aud`, `exp` | `src/utils/jwt.js` |
| 3.3 ✅ | Login schema + new-password policy | `src/validators/auth.schema.js` |
| 3.4 ✅ | `auth.service.js` — login (dummy hash), authenticate (verify → revocation → admin), logout | `src/services/auth.service.js`, `admin.repository.js`, `tokenRevocation.js` |
| 3.5 ✅ | `authenticate` (cookie only) + `requireRole` (403); `requireTrustedOrigin` + app-wide session CSRF guard | `src/middleware/authenticate.js`, `requireTrustedOrigin.js` |
| 3.6 ✅ | Login limiter (failures only) | `src/middleware/rateLimiters.js` |
| 3.7 ✅ | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; HttpOnly cookie helpers | controller, routes, `src/utils/authCookie.js` |
| 3.8 ✅ | `createAdmin.js` — prompt / env / pipe, policy, bcrypt 12, duplicate → exit 1, never prints secrets | `scripts/createAdmin.js`, `src/services/admin.service.js` |

**Checkpoint ✅:** an admin created with `admin:create` can log in; `/api/auth/me` rejects missing, malformed, tampered, wrong-secret, `alg:none` and expired tokens.

### Phase 4 — Inquiry APIs

| # | Task | Output |
|---|------|--------|
| 4.1 | ~~Create~~ (done), list-query, status-update schemas (reuse `uuidParamSchema`) | `src/validators/inquiry.schema.js` |
| 4.2 ✅ | `buildInquiryWhere`: pure filters + search → `where`; LIKE escaping; digits clause | `src/utils/buildInquiryWhere.js` |
| 4.3 | `inquiry.service.js` — ~~`createInquiry`~~ (done, with dedupe), `list` (`findAndCountAll`, meta), `getById`, `updateStatus` | `src/services/inquiry.service.js` |
| 4.4 | Routes: ~~public `POST /` + submit limiter~~ (done); `GET /`, `GET /:id`, `PATCH /:id/status` behind `authenticate` | controller + routes |

**Checkpoint:** public POST stores a `New` inquiry; list requires a token; every filter combination returns the right rows.

### Phase 5 — Frontend foundation & public form

| # | Task | Output | Status |
|---|------|--------|--------|
| 5.1 | Vite + React (JS), ESLint, Vitest + Testing Library | `frontend/` | Done |
| 5.2 | `config.js`, `api/client.js` (base URL, JSON, `credentials: 'include'`, timeout, `ApiError`) | `src/config.js`, `src/api/` | Done |
| 5.3 | Base styles (CSS variables, light/dark, focus states) | `src/styles/global.css` | Done |
| 5.4 | Mirrored constants + Zod schemas (parity test with the backend) | `src/constants`, `src/validation`, `tests/validation.test.js` | Done |
| 5.5 | React Router 8; Axios client; form components; `InquiryPage` with client validation, loading, double-submit guard, server error mapping, confirmed-only success | `src/routes.jsx`, `src/api`, `src/components`, `src/pages/InquiryPage.jsx` | Done |
| 5.6 | `.env.example`, `vercel.json` (SPA rewrite, security headers), Vite `/api` proxy | config | Done (frontend CSP still to add) |

### Phase 6 — Admin login & dashboard

Done in stage 5: `AuthProvider` (no token storage: HttpOnly cookie), `AdminSession`, `ProtectedRoute`, `LoginPage`, `AdminLayout` with logout, a dashboard landing page.

Remaining: `useInquiryFilters` (URL sync), `useDebouncedValue`; `FilterBar`, `SearchInput`, `InquiryTable` (Name, Phone, Email, User Type, Category, Date, Status), `StatusBadge`, `StatusSelect` (optimistic + rollback), `Pagination`; loading, empty and error states; responsive cards.

### Phase 7 — Tests & quality gates

| # | Task | Status |
|---|------|--------|
| 7.1 | Backend unit tests (env, database, models, errors, logger, validate) | Done for stage 2; auth/query-builder tests come with Phases 3–4 |
| 7.2 | Backend API tests (Supertest) | Done for health/CORS/body/404; auth/inquiry routes come with Phases 3–4 |
| 7.3 | Schema tests in PGlite | Done |
| 7.4 | Integration tests (`TEST_DATABASE_URL`) | Written; **not run** (B1) |
| 7.5 | Frontend tests | Done for client + shell; form/dashboard come with Phases 5–6 |
| 7.6 | ESLint + Prettier in both packages | Done |
| 7.7 | GitHub Actions CI: lint, format check, tests, build; grep guards for `@supabase/`, `sqlite3`, secret patterns | — |

### Phase 8 — Documentation & deployment

| # | Task | Status |
|---|------|--------|
| 8.1 | README: setup, Supabase/TLS, scripts, testing, **authentication testing guide** | Setup sections done; auth guide comes with Phase 3 |
| 8.2 | `render.yaml` (rootDir `backend`, `npm ci`, `npm start`, `/api/health`, `TRUST_PROXY=1`, env `sync: false`) | — |
| 8.3 | Vercel project settings documented | — |
| 8.4 | Create repo / push | Repo exists; push needs approval |
| 8.5 | Deploy + smoke test | Blocked (B1, B4) |

---

## 3. Definition of done

- Every row in REQUIREMENTS_TRACEABILITY.md is *Verified* by an executed check, or explicitly marked as waiting on a named blocker.
- No TODOs on mandatory features; `git grep` finds no secrets.
- Backend and frontend lint, tests and build pass; integration tests pass against a Supabase test DB once B1 is resolved.
- README reproduced from a clean checkout.

---

## 4. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Supabase CA not configured → `verify-full` fails | High on first setup | Clear startup hint, `certs/README.md`, README step; `require` mode as a documented, warned fallback |
| Supabase direct host is IPv6-only | High if used | Docs and error hint point to the pooler |
| Render free-tier cold start | High | Liveness endpoint; 30 s frontend timeout |
| CORS misconfiguration after deploy | Medium | `FRONTEND_URL` validated at boot; denied origins get an explicit 403 code |
| Schema drift between SQL and models | Low | PGlite test + `db:check` compare columns and nullability; allowed values compared to constants |
| `CREATE TABLE IF NOT EXISTS` won't alter existing tables | Certain for future changes | Numbered `migrations/` files for every change after the initial schema |
| Integration tests unrunnable without a DB | Until B1 | Reported as skipped, never as passed |
