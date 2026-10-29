# Requirements Traceability Matrix

Every mandatory requirement, the files that will implement it, and how it will be verified.
Phase numbers refer to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Paths are relative to the repository root.

**Status legend:** `Planned` → `Implemented` → `Verified` (verification actually executed). `Blocked (Bx)` = waiting on a blocker from the implementation plan.
**Verification legend:** **UT** unit test · **API** Supertest with stubbed services · **IT** integration test against real Postgres (needs `TEST_DATABASE_URL`) · **FE** frontend component test · **MAN** manual check (steps in README) · **REV** code/file review · **CI** automated pipeline.

---

## 1. Public inquiry form

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| F-01 | User Type field with options Parent, Student, School | `backend/src/constants/inquiry.js` (`USER_TYPES`); `backend/src/validators/inquiry.schema.js`; `backend/src/models/Inquiry.js` (`isIn`); `schema.sql` (`CHECK`); `frontend/src/constants/inquiry.js`; `frontend/src/pages/InquiryFormPage.jsx` (`SelectField`) | UT: schema accepts each value and rejects others · FE: select renders exactly 3 options · IT: DB rejects invalid `user_type` | 1, 4, 5 | Planned |
| F-02 | Category field with options Scholarship, Concert, Admission, General Query | Same files as F-01 (`CATEGORIES`) | UT · FE: 4 options · IT: DB rejects invalid `category` | 1, 4, 5 | Planned |
| F-03 | Name required | `backend/src/validators/inquiry.schema.js`; `frontend/src/validation/inquiry.schema.js`; `schema.sql` (`NOT NULL`) | UT: missing/blank/too-short name → error · API: `400` with `details[].path = name` · FE: inline error, no request sent | 4, 5 | Planned |
| F-04 | Email required | As F-03 (email format + max length) | UT: missing/invalid email → error · API · FE | 4, 5 | Planned |
| F-05 | Phone Number required | As F-03 (allowed chars, 7–15 digits) | UT: missing, letters, too few/many digits → error; `+91 98765-43210` accepted · API · FE | 4, 5 | Planned |
| F-06 | Message/Query required | As F-03 (10–2000 chars); `schema.sql` length `CHECK` | UT · API · FE | 4, 5 | Planned |
| F-07 | Submissions saved to Supabase PostgreSQL | `backend/src/routes/inquiry.routes.js` (`POST /api/inquiries`); `backend/src/controllers/inquiry.controller.js`; `backend/src/services/inquiry.service.js` (`create`); `backend/src/models/Inquiry.js`; `backend/src/config/database.js`; `frontend/src/api/inquiries.api.js` | API: `201` + body shape, service called with parsed data · IT: row persisted with `status = 'New'` and `created_at` set · MAN: submit via UI, row visible in Supabase table editor | 4, 5 | Blocked (B1) for IT/MAN |
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
| A-08 | No hardcoded credentials; admin provisioning is secure | `backend/scripts/seed-admin.js` (env/prompt, min length 12, no logging); no registration route; `.env.example` placeholders only | REV · UT: seed script rejects short passwords · CI: secret-pattern grep | 3, 7 | Planned |
| A-09 | Brute-force and enumeration resistance (production-conscious) | `backend/src/middleware/rateLimiters.js` (`loginLimiter`); dummy-hash compare in `auth.service.js` | API: 11th attempt in window → `429`; unknown email and wrong password return identical bodies | 3 | Planned |

## 3. Admin dashboard

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| D-01 | Display Name, Phone, Email, User Type, Category, Date, Status | `frontend/src/components/dashboard/InquiryTable.jsx`; `StatusBadge.jsx`; `backend/src/services/inquiry.service.js` (`list` attributes); `GET /api/inquiries` | FE: table renders all 7 column headers and values from mocked data; Date formatted from `createdAt` · API: list response items include all 7 fields | 4, 6 | Planned |
| D-02 | Filter by Category | `FilterBar.jsx`; `useInquiryFilters.js`; `inquiry.schema.js` (`category` query param); `buildInquiryWhere.js` | UT: `{category}` → `where.category` · API: invalid category → `400` · IT: only matching rows returned · FE: selecting a category sends `category=` and updates URL | 4, 6 | Planned |
| D-03 | Filter by User Type | As D-02 (`userType` → `user_type`) | UT · API · IT · FE | 4, 6 | Planned |
| D-04 | Search by Name or Phone Number | `SearchInput.jsx` (300 ms debounce); `useDebouncedValue.js`; `buildInquiryWhere.js` (`Op.or` of name `ILIKE`, phone `ILIKE`, digits-only phone); LIKE escaping; `pg_trgm` indexes in `schema.sql` | UT: OR clause built; `%`/`_` escaped; digits clause only when ≥3 digits · IT: partial, case-insensitive name match; phone match with and without formatting; `%` does not match everything · FE: typing debounces to one request | 1, 4, 6 | Planned |
| D-05 | Filters and search combine | `buildInquiryWhere.js` (AND of all filters, AND with search OR-group); `useInquiryFilters.js` (all params in one query string) | UT: every combination of {category, userType, status, search} produces the correct clause (table-driven) · IT: seeded dataset, combined query returns exact expected IDs · FE: setting two filters + search sends all params together · MAN | 4, 6 | Planned |
| D-06 | Dashboard usable at scale (production-conscious) | Server-side pagination (`page`, `pageSize` ≤ 100); `Pagination.jsx`; sort; indexes | API: `pageSize=500` → `400`; meta totals correct · IT | 4, 6 | Planned |
| D-07 | Status is meaningful and maintainable | `status` column default `New`; `PATCH /api/inquiries/:id/status`; `StatusSelect.jsx` | API: valid status → `200`, invalid → `400`, unknown id → `404`, no token → `401` · FE: optimistic update rolls back on error | 1, 4, 6 | Planned |

## 4. Deliverables

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| R-01 | GitHub repository with `frontend/` and `backend/` | Repo layout per ARCHITECTURE §2; `gh repo create` + push | REV: tree contains both dirs · MAN: repo URL opens | 1, 8 | Blocked (B3) for push |
| R-02 | `schema.sql` | `schema.sql` (root) | IT: `npm run db:migrate` applies cleanly twice · MAN: paste into Supabase SQL editor | 1 | Planned |
| R-03 | `.env.example` | `.env.example` (root), `backend/.env.example`, `frontend/.env.example` | REV: every variable read by `config/env.js` / `config.js` appears; no real values · UT: env schema test iterates the example's keys | 1, 2, 5 | Planned |
| R-04 | `README.md` with setup and authentication-testing instructions | `README.md` | MAN: follow README from clean clone; auth-testing section covers login, token use, missing/invalid/expired token | 8 | Planned |
| R-05 | Deployment-ready application | `render.yaml`; `frontend/vercel.json`; `engines` / `.nvmrc`; `server.js` honours `PORT`, graceful shutdown; `/api/health`; env-driven CORS | CI: lint, tests, `vite build` pass · MAN: `NODE_ENV=production npm start` locally · MAN: deployed smoke test | 2, 7, 8 | Blocked (B1, B4) for live deploy |

## 5. Technology stack constraints

| ID | Requirement | Planned implementation | Verification | Phase | Status |
|----|-------------|------------------------|--------------|-------|--------|
| T-01 | React + Vite + JavaScript | `frontend/` scaffold, `.jsx` files only, no TypeScript | REV: `package.json`, no `tsconfig.json` · CI: `vite build` | 5 | Planned |
| T-02 | Node.js + Express | `backend/src/app.js`, `server.js` | REV · API tests | 2 | Planned |
| T-03 | Sequelize ORM | `backend/src/config/database.js`; `backend/src/models/*` | REV · IT | 2 | Planned |
| T-04 | Supabase PostgreSQL via connection string | `DATABASE_URL` in `config/env.js` / `database.js`; pooler guidance in README | IT against Supabase · MAN: `/api/health?db=1` → `ok` | 2 | Blocked (B1) |
| T-05 | `pg` driver | `backend/package.json` (`pg`, `pg-hstore`); `dialectModule` set explicitly | REV | 2 | Planned |
| T-06 | `bcrypt` and `jsonwebtoken` | `backend/package.json`; `utils/password.js`; `utils/jwt.js` | REV · UT | 3 | Planned |
| T-07 | Zod validation | `backend/src/validators/*`; `middleware/validate.js`; `config/env.js`; `frontend/src/validation/*` | UT · API | 2–5 | Planned |
| T-08 | Render/Vercel-compatible architecture | `render.yaml`; `frontend/vercel.json`; independent package roots | REV · MAN deploy | 8 | Blocked (B4) for live deploy |

## 6. Prohibitions and engineering rules

| ID | Rule | How it is enforced | Verification | Status |
|----|------|--------------------|--------------|--------|
| P-01 | No SQLite as production DB | Only `pg` dialect configured; SQLite not used in tests either | REV: no `sqlite3` in any `package.json` · CI grep | Planned |
| P-02 | No Supabase Auth | Custom auth (A-01) | REV · CI grep for `@supabase/` | Planned |
| P-03 | No direct DB connections from frontend | Frontend only knows `VITE_API_BASE_URL`; RLS blocks anon REST access | REV: no DB/Supabase deps or env vars in `frontend/` · MAN: anon REST call returns nothing | Planned |
| P-04 | Never hardcode or commit secrets | Env-only config; `.gitignore`; placeholder-only examples | Phase 7.7 secret scan before each commit · CI grep | Planned |
| P-05 | No mandatory feature left as TODO | — | `git grep -n TODO` reviewed before completion | Planned |
| P-06 | Don't claim tests passed unless executed | Test results recorded with real output; skipped suites reported as skipped | Status column updated only from executed runs | Ongoing |
| P-07 | No publish/deploy/external credentials without authorisation | B3/B4 require explicit approval | — | Ongoing |
| P-08 | Modular, maintainable code | Layered backend (routes → controllers → services → models), component-based frontend | REV · ESLint in CI | Planned |
