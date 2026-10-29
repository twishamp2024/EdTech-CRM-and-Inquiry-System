# Implementation Plan — EdTech CRM & Inquiry Management System

Status: **Planning complete; implementation not started.**
Design details live in [ARCHITECTURE.md](ARCHITECTURE.md); requirement-to-file mapping in [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md).

---

## 0. Environment inspection (2026-10-29)

| Item                    | Finding                                                                 | Impact |
|-------------------------|-------------------------------------------------------------------------|--------|
| Project directory       | Empty (no files to preserve)                                            | Start from scratch |
| Git                     | Not a repository. Global identity set (`Twishamp`, a gmail address)     | Will `git init` at Phase 1 |
| Node.js / npm           | Node v26.12.1, npm 11.20.0                                              | OK. Deploy targets pinned to Node 24 LTS |
| pnpm / yarn / bun       | Not installed                                                           | Use npm only |
| Build toolchain         | Xcode developer tools, Python 3.14 present                              | `bcrypt` can compile from source if no prebuilt binary matches |
| npm registry            | Reachable (`npm ping` OK). Latest: bcrypt 6.0.0, sequelize 6.37.8, vite 8.3.5, zod 4.6.7 | Dependencies installable |
| Supabase network        | Supavisor pooler host reachable on TCP 6543                              | Remote DB is reachable once credentials exist |
| Database credentials    | **None** in environment or files                                         | See blocker B1 |
| `psql` / Docker         | Not installed                                                           | No local Postgres; schema applied via Supabase SQL editor or `npm run db:migrate` |
| GitHub CLI              | `gh` 2.103.2, logged in (scopes include `repo`, `workflow`)             | Repo creation possible **only with your go-ahead** |
| Render / Vercel CLIs    | Not installed                                                           | Deploy through dashboards (or install CLIs with your go-ahead) |

### Blockers and open items

| ID | Item | Blocks | Needed from you |
|----|------|--------|-----------------|
| **B1** | No Supabase `DATABASE_URL` | Running `db:migrate`, integration tests, manual end-to-end test against a real DB, deployment | Create a Supabase project and put the **session-pooler** connection string in `backend/.env` yourself (please don't paste the password into chat) |
| **B2** | No admin credentials chosen | Seeding the first admin | Choose `ADMIN_EMAIL` / `ADMIN_PASSWORD` and set them in `backend/.env` when running `npm run seed:admin` |
| **B3** | No GitHub repo yet | "GitHub repository" deliverable | Approval to run `gh repo create` (name, public/private) and push |
| **B4** | No Render / Vercel access | Live deployment | Accounts connected to the GitHub repo; you trigger the deploys, or authorise me to |
| N1 | Git email vs GitHub account | Commit attribution only | Optional: confirm the commit email is verified on the GitHub account you'll push with |

None of these blocks writing the code. Everything except Phase 1's DB step, the integration test suite, and Phase 8 can be built and unit/API-tested offline.

---

## 1. Guiding decisions

1. **Two independent npm packages** (`frontend/`, `backend/`) — matches Render/Vercel root-directory deploys with no monorepo tooling.
2. **`schema.sql` is the source of truth**; Sequelize models mirror it; no `sync()` in production.
3. **Testability without a database:** `createApp({ services })` dependency injection lets Supertest cover routing, auth and validation with stubbed services. Real-DB tests run only when `TEST_DATABASE_URL` is set and are reported as *skipped* otherwise — never as passed. **No SQLite anywhere**, including tests.
4. **Vitest** for both packages (native ESM; same runner front and back).
5. **Bearer-token JWT** rather than cookies because of cross-site deployment (rationale in ARCHITECTURE §5).
6. **Server-side filtering, search and pagination** — the dashboard never downloads the whole table.
7. **Status column** is added with a default of `New` plus a small PATCH endpoint, so the required Status display is meaningful.

---

## 2. Work breakdown

Each phase ends with a verifiable checkpoint. Phases 3–4 and 5–6 can proceed in parallel once Phase 2 is done.

### Phase 1 — Repository & database

| # | Task | Output |
|---|------|--------|
| 1.1 | `git init`; root `.gitignore` (node_modules, `.env*` except `.env.example`, `dist`, coverage, OS files) | `.gitignore` |
| 1.2 | Write `schema.sql`: `pgcrypto` + `pg_trgm` extensions, `set_updated_at()` trigger function, `admins` and `inquiries` tables with `CHECK` constraints, indexes, triggers, RLS enabled. Fully idempotent (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`) | `schema.sql` |
| 1.3 | Root `.env.example` documenting every variable for both apps, with placeholder values only | `.env.example` |
| 1.4 | *(after B1)* Apply schema to Supabase; verify tables, constraints and RLS | Supabase DB |

**Checkpoint:** `schema.sql` applies twice without error (idempotent); inserting an invalid `category` is rejected by the DB; Supabase REST with the anon key returns no rows.

### Phase 2 — Backend foundation

| # | Task | Output |
|---|------|--------|
| 2.1 | `backend/package.json` (ESM, `engines`, scripts: `dev`, `start`, `test`, `test:integration`, `lint`, `db:migrate`, `seed:admin`); install express, sequelize, pg, pg-hstore, bcrypt, jsonwebtoken, zod, helmet, cors, express-rate-limit, dotenv; dev: vitest, supertest, eslint, prettier, nodemon | `backend/package.json` |
| 2.2 | `config/env.js` — Zod schema for all env vars; fail fast with readable errors | `src/config/env.js` |
| 2.3 | `config/database.js` — Sequelize postgres dialect, pg driver, SSL (`DB_SSL_CA` optional), pool, logging off in prod | `src/config/database.js` |
| 2.4 | `constants/inquiry.js`, `Admin` and `Inquiry` models (`underscored: true`, `isIn` validators matching `CHECK`s) | `src/constants`, `src/models` |
| 2.5 | `AppError`, `asyncHandler`, `logger`, `notFound`, `errorHandler` (maps ZodError → 400, Sequelize validation → 400, unique → 409, unknown → 500 without stack in prod) | `src/utils`, `src/middleware` |
| 2.6 | `app.js` (helmet, CORS allow-list, JSON limit, `trust proxy`, routes, error handling) and `server.js` (DB `authenticate()`, listen, SIGTERM graceful shutdown) | `src/app.js`, `src/server.js` |
| 2.7 | `GET /api/health` (+ `?db=1`) | `src/routes/index.js` |
| 2.8 | `scripts/db-migrate.js` executes `../schema.sql` in a transaction | `scripts/db-migrate.js` |
| 2.9 | `backend/.env.example` | `backend/.env.example` |

**Checkpoint:** `npm run dev` boots with a valid `.env`; boots refuse with a clear message when `DATABASE_URL` or `JWT_SECRET` is missing/too short; `/api/health` → 200.

### Phase 3 — Authentication

| # | Task | Output |
|---|------|--------|
| 3.1 | `utils/password.js` — `hashPassword`, `verifyPassword` (bcrypt, configurable rounds) | `src/utils/password.js` |
| 3.2 | `utils/jwt.js` — `signAccessToken(admin)`, `verifyAccessToken(token)` with pinned HS256, `iss`, `aud`, `exp` | `src/utils/jwt.js` |
| 3.3 | `validators/auth.schema.js` — login schema | `src/validators/auth.schema.js` |
| 3.4 | `services/auth.service.js` — login with dummy-hash timing protection, `last_login_at` update; `getAdminById` | `src/services/auth.service.js` |
| 3.5 | `middleware/authenticate.js` — Bearer parsing, verify, distinguish `TOKEN_EXPIRED` vs `INVALID_TOKEN`, active-admin check, `req.admin` | `src/middleware/authenticate.js` |
| 3.6 | `middleware/rateLimiters.js` — `loginLimiter` | `src/middleware/rateLimiters.js` |
| 3.7 | `auth.controller.js`, `auth.routes.js` — `POST /login`, `GET /me` | controllers, routes |
| 3.8 | `scripts/seed-admin.js` — env or interactive prompt, min password length 12, upsert by email, never logs the password | `scripts/seed-admin.js` |

**Checkpoint:** login returns a JWT for seeded credentials and `401` otherwise; `/api/auth/me` rejects missing, malformed, tampered, wrong-secret and expired tokens.

### Phase 4 — Inquiry APIs

| # | Task | Output |
|---|------|--------|
| 4.1 | `validators/inquiry.schema.js` — create, list-query (with coercion and defaults), status update, UUID param | `src/validators/inquiry.schema.js` |
| 4.2 | `middleware/validate.js` — generic `{ body, query, params }` validator that replaces inputs with parsed output | `src/middleware/validate.js` |
| 4.3 | `utils/buildInquiryWhere.js` — pure function: filters + search → Sequelize `where`; LIKE-escape; digits-only phone clause | `src/utils/buildInquiryWhere.js` |
| 4.4 | `services/inquiry.service.js` — `create`, `list` (`findAndCountAll`, order, limit/offset, meta), `getById`, `updateStatus` | `src/services/inquiry.service.js` |
| 4.5 | `inquiry.controller.js`, `inquiry.routes.js` — `POST /` public + `inquirySubmitLimiter`; `GET /`, `GET /:id`, `PATCH /:id/status` behind `authenticate` | controllers, routes |

**Checkpoint:** public POST creates a row with status `New`; list endpoint returns `401` without a token; each filter, search and every combination returns the correct subset.

### Phase 5 — Frontend foundation & public form

| # | Task | Output |
|---|------|--------|
| 5.1 | Scaffold Vite React (JavaScript) in `frontend/`; add react-router-dom, zod; dev: vitest, @testing-library/react, @testing-library/user-event, jsdom, eslint | `frontend/` |
| 5.2 | `config.js`, `api/client.js` (base URL, JSON, Bearer header, `ApiError`, 401 hook, timeout/abort) | `src/config.js`, `src/api/client.js` |
| 5.3 | Base styles / layout (CSS variables, responsive, accessible focus states) | `src/styles/` |
| 5.4 | `constants/inquiry.js`, `validation/inquiry.schema.js` mirroring backend | `src/constants`, `src/validation` |
| 5.5 | Form components and `InquiryFormPage` — two selects, four required fields, client validation, server error mapping, submitting/success/error states | `src/components/form`, `src/pages/InquiryFormPage.jsx` |
| 5.6 | `frontend/.env.example`, `vercel.json` (SPA rewrite, CSP and security headers) | config files |

**Checkpoint:** submitting the form against the local API creates a row; invalid input shows field errors without a network request.

### Phase 6 — Admin login & dashboard

| # | Task | Output |
|---|------|--------|
| 6.1 | `tokenStorage.js`, `AuthContext.jsx` (login, logout, restore via `/auth/me`), `ProtectedRoute.jsx` | `src/auth/` |
| 6.2 | `AdminLoginPage` with error handling and redirect-back | `src/pages/AdminLoginPage.jsx` |
| 6.3 | `useInquiryFilters` (URL query-string sync) and `useDebouncedValue` | `src/hooks/` |
| 6.4 | `FilterBar` (Category, User Type, Status, Clear), `SearchInput` (name/phone, debounced) | `src/components/dashboard/` |
| 6.5 | `InquiryTable` (Name, Phone, Email, User Type, Category, Date, Status), `StatusBadge`, expandable message, mobile card layout | `src/components/dashboard/` |
| 6.6 | `StatusSelect` with optimistic update + rollback; `Pagination`; loading / empty / error states; abort stale requests | `src/components/dashboard/` |
| 6.7 | `AdminDashboardPage` composing the above, header with admin name + Logout | `src/pages/AdminDashboardPage.jsx` |

**Checkpoint:** `/admin` redirects to login when signed out; after login, every filter, the search, and combinations update the table and the URL; refresh preserves the view; expired token returns the user to login.

### Phase 7 — Tests & quality gates

| # | Task | Output |
|---|------|--------|
| 7.1 | Backend unit tests: env validation, password utils, JWT utils (valid / expired / tampered / wrong secret / wrong alg), validators, `buildInquiryWhere` (every filter combination, escaping, digits clause) | `backend/tests/unit/` |
| 7.2 | Backend API tests (Supertest + stubbed services): login success/failure/validation, rate-limit headers, auth middleware on every protected route, inquiry create validation, list query validation, 404/error envelope | `backend/tests/api/` |
| 7.3 | Backend integration tests (only with `TEST_DATABASE_URL`): migrate, seed, create inquiries, list with combined filters/search, status update, constraint violations | `backend/tests/integration/` |
| 7.4 | Frontend tests: form validation and submit flow (mocked fetch), `ProtectedRoute` redirect, login flow, dashboard filter → query-string → API params, debounce behaviour | `frontend/tests/` |
| 7.5 | ESLint + Prettier config in both packages; `npm run build` for frontend | configs |
| 7.6 | `.github/workflows/ci.yml` — on push/PR: install, lint, unit + API tests, frontend build (integration tests skipped unless a secret is configured) | CI workflow |
| 7.7 | Secret scan before first commit (`git grep` for connection strings / keys; confirm `.env` ignored) | — |

**Checkpoint:** all suites executed locally with real output recorded; any skipped suite reported as skipped with the reason.

### Phase 8 — Documentation & deployment

| # | Task | Output |
|---|------|--------|
| 8.1 | `README.md`: overview, stack, structure, prerequisites, Supabase setup (pooler URL, SSL CA, apply schema), local setup for both apps, seeding admin, scripts, API reference, **authentication testing guide** (curl + UI: login, use token, missing/invalid/expired token cases, how to mint a short-lived token to test expiry), running tests, deployment, troubleshooting | `README.md` |
| 8.2 | `render.yaml` blueprint (rootDir `backend`, build/start commands, health check, env vars with `sync: false`) | `render.yaml` |
| 8.3 | Vercel settings documented (root `frontend`, Vite preset, `VITE_API_BASE_URL`) | README |
| 8.4 | `.nvmrc` / `engines` pins | config |
| 8.5 | Update `REQUIREMENTS_TRACEABILITY.md` status column with actual results | docs |
| 8.6 | *(after B3, with approval)* create GitHub repo and push | GitHub |
| 8.7 | *(after B1, B4, with approval)* deploy API → deploy frontend → set `CORS_ORIGINS` → smoke test (submit form, log in, filter, search, status change) | live URLs |

**Checkpoint:** a new developer can go from clone to working local app using only the README; deployed smoke test passes.

---

## 3. Definition of done

- Every row in REQUIREMENTS_TRACEABILITY.md is *Implemented* and *Verified*, with the verification method actually executed (or explicitly marked as pending a named blocker).
- No TODOs left on mandatory features.
- `git grep` finds no secrets; only `.env.example` files are committed.
- Backend unit + API tests and frontend tests pass locally; integration tests pass against a Supabase test DB once B1 is resolved.
- Frontend production build succeeds.
- README instructions reproduced from a clean checkout.

---

## 4. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `bcrypt` native binary mismatch on Node 26 locally | Low | bcrypt 6 ships N-API prebuilds; Xcode toolchain available for source build; deploy targets use Node 24 LTS |
| Supabase direct host is IPv6-only | High if direct URL used | Use the Supavisor pooler URL (documented) |
| Self-signed chain errors on SSL | Medium | `DB_SSL_CA` support; documented fallback |
| Render free-tier cold start | High | Health check, frontend "waking server" message, documented |
| CORS misconfiguration after deploy | Medium | Explicit `CORS_ORIGINS`, documented release order, smoke test |
| Integration tests unrunnable without DB | Certain until B1 | Clearly skipped, not reported as passed; API tests with stubs cover HTTP behaviour |
| Frontend/backend enum drift | Low | Constants in one file per package; integration test asserts accepted values; noted in README |
