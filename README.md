# EdTech CRM & Inquiry Management System

An EdTech CRM and inquiry management system designed for prospective student inquiries and administrative lead management.

> **Status:** all mandatory features are implemented and tested: the public inquiry form, custom admin authentication (bcrypt + JWT in an HttpOnly cookie), and the admin dashboard with server-side filters, search, pagination and status updates. Remaining: deployment config (Vercel/Render) and CI. See the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Project Structure & Documentation

Detailed project architecture, implementation plans, and requirement matrices can be found in the [`docs/`](./docs) folder:

- [System Architecture](docs/ARCHITECTURE.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Requirements Traceability Matrix](docs/REQUIREMENTS_TRACEABILITY.md)

```
backend/     Express 5 API, Sequelize models, database scripts, tests
frontend/    React + Vite single-page app
schema.sql   Reproducible initial PostgreSQL schema (source of truth)
.env.example Backend configuration template (copy to backend/.env)
docs/        Architecture, plan, traceability
```

## Tech Stack Overview

- **Frontend**: React + Vite SPA
- **Backend API**: Node.js + Express, Sequelize ORM, Zod, bcrypt, jsonwebtoken
- **Database**: Supabase PostgreSQL
- **Testing**: Vitest, Supertest
- **Deployment**: Vercel (Frontend), Render (Backend)

Supabase is used only as managed PostgreSQL. Admin authentication is custom (bcrypt + JWT in an HttpOnly cookie); Supabase Auth and the Supabase JS client are not used, and the frontend never connects to the database.

---

## Prerequisites

- **Node.js ≥ 22.12** (24 LTS recommended; see `.nvmrc`) and npm
- A **Supabase** project (free tier is fine)

## 1. Set up the database (Supabase)

1. Create a project at [supabase.com](https://supabase.com) and note the database password.
2. **Connection string:** in the project's **Connect** dialog (or *Project Settings → Database*), copy the **Session pooler** URI. It looks like:
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   Use the pooler, not the direct `db.<ref>.supabase.co` host, which is IPv6-only on most plans. Do not add `?sslmode=…`; TLS is configured separately (step 3).
3. **CA certificate:** *Project Settings → Database → SSL Configuration → Download certificate*, and save it as `backend/certs/supabase-ca.crt`. Supabase signs its certificates with its own root CA, so the backend needs this file to verify the server (`DATABASE_SSL_MODE=verify-full`, the default). The certificate is public, so it may be committed.
4. **Create the tables.** Either:
   - paste the contents of [`schema.sql`](schema.sql) into the Supabase **SQL Editor** and run it, or
   - run `npm run db:migrate` from `backend/` after step 2 below.

   `schema.sql` is idempotent and runs in a transaction, so running it twice is safe.

## 2. Configure and run the backend

```bash
cd backend
npm install
cp ../.env.example .env
```

Edit `backend/.env`:

| Variable | What to set |
|----------|-------------|
| `DATABASE_URL` | Session pooler URI from step 1.2 |
| `DATABASE_SSL_CA_PATH` | `./certs/supabase-ca.crt` (default in the example) |
| `JWT_SECRET` | A random string of at least 32 characters (command below). The server refuses the placeholder. |
| `FRONTEND_URL` | `http://localhost:5173` for local development |

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then:

```bash
npm run db:migrate   # apply schema.sql (skip if you used the SQL editor)
npm run db:check     # verify tables match the models and RLS is enabled
npm run admin:create # create your admin account (prompts; see Admin accounts)
npm run dev          # API on http://localhost:4000, restarts on file changes
```

Check it:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/db
```

The first returns `{"status":"ok",…}`. The second returns `{"status":"ok","database":"up",…}`, or a `503` if the database is unreachable.

### Backend scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start with `node --watch` (development) |
| `npm start` | Start for production |
| `npm test` | Unit, API and schema tests (no database needed) |
| `npm run test:integration` | Tests against a real database (needs `TEST_DATABASE_URL`) |
| `npm run lint` / `npm run format:check` | ESLint / Prettier |
| `npm run db:migrate` | Apply `schema.sql` to `DATABASE_URL` |
| `npm run db:check` | Read-only check that the schema matches the models and RLS is enabled |
| `npm run admin:create` | Create an admin account (see [Admin accounts](#admin-accounts)) |
| `npm run dev:memory` | Development only: API + in-memory PostgreSQL, no Supabase needed (see [Try the app locally](#try-the-app-locally-without-supabase)) |

### Startup behaviour

- Configuration is validated at startup. Missing or invalid variables are listed together and the process exits with code 1.
- The server connects to the database before accepting traffic. Transient errors are retried (`DATABASE_CONNECT_RETRIES`, default 5, with backoff). Errors retrying cannot fix (wrong password, certificate problems, unknown database) fail immediately. Every failure is logged with a hint, and credentials are never logged.
- `SIGTERM`/`SIGINT` trigger a graceful shutdown.

## API

| Method | Path | Access |
|--------|------|--------|
| `GET` | `/api/health`, `/api/health/db` | public |
| `POST` | `/api/inquiries` | public |
| `POST` | `/api/auth/login` | public (origin-checked, rate-limited) |
| `POST` | `/api/auth/logout` | origin-checked |
| `GET` | `/api/auth/me` | admin session |
| `GET` | `/api/inquiries?category=&userType=&search=&page=&pageSize=&sortBy=&sortDir=` | admin session; server-side filters (combined with AND), case-insensitive name/phone search (phone also ignores spaces and dashes), whitelisted sort, 20 per page by default (max 100); response `meta` has `total`, `totalPages`, `hasNextPage`, `hasPreviousPage` |
| `GET` | `/api/inquiries/:id` | admin session |
| `PATCH` | `/api/inquiries/:id/status` | admin session, origin-checked; body `{"status":"New"|"In Progress"|"Resolved"}` |

### `POST /api/inquiries` (public)

No authentication. JSON body with exactly these fields:

| Field | Rules |
|-------|-------|
| `name` | required, 2–100 characters, must include a letter |
| `email` | required, valid address, ≤ 254 characters (stored lower-cased) |
| `phone` | required, any country: optional leading `+`, digits, spaces, `-`, `(`, `)`; 7–15 digits; ≤ 20 characters |
| `userType` | `Parent`, `Student` or `School` |
| `category` | `Scholarship`, `Concert`, `Admission` or `General Query` |
| `message` | required, 10–2000 characters |

All strings are trimmed. Any other field (for example `status`) is rejected.

```bash
curl -i http://localhost:4000/api/inquiries \
  -H 'Content-Type: application/json' \
  -d '{"name":"Meera Iyer","email":"meera@example.com","phone":"+44 20 7946 0958","userType":"Parent","category":"Concert","message":"Are concert tickets open to parents?"}'
```

| Response | When |
|----------|------|
| `201` `{"success":true,"message":"Thank you! Your inquiry has been received.","data":{"id":"…","duplicate":false}}` | stored with status `New` |
| `200` `{…,"data":{"id":"<existing id>","duplicate":true}}` | the same inquiry was already received in the last `INQUIRY_DUPLICATE_WINDOW_MINUTES` (default 10) |
| `400` `{"success":false,"error":{"code":"VALIDATION_ERROR","details":[{"field":"email","message":"…"}]}}` | invalid or missing fields, malformed JSON, unknown fields |
| `413` / `415` | body over 20 kb / not `application/json` |
| `429` `RATE_LIMITED` | more than `INQUIRY_RATE_LIMIT_MAX` (default 10) submissions per IP per `INQUIRY_RATE_LIMIT_WINDOW_MINUTES` (default 15) |
| `503` / `500` | database unavailable or failed; nothing was saved |

## 3. Run the frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The app calls same-origin `/api/...`, and in development Vite proxies those requests to `http://localhost:4000` (override with `DEV_API_PROXY_TARGET` in `frontend/.env.local`). Because the browser only ever talks to `localhost:5173`, the admin session cookie is first-party, exactly as it will be behind the Vercel rewrite in production.

| Route | Page | Access |
|-------|------|--------|
| `/` | Public inquiry form | everyone |
| `/login` | Admin sign-in | everyone (signed-in admins are sent to the dashboard) |
| `/admin/dashboard` | Inquiry table with search (name or phone), Category and User Type filters, reset, sorting, pagination and status updates | signed-in admins; others are redirected to `/login` |

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm run build` / `npm run preview` | Production build / serve it locally |
| `npm test` | Vitest + Testing Library |
| `npm run lint` / `npm run format:check` | ESLint / Prettier |

Stack: React 19, React Router 8, Axios, React Hook Form + Zod, Lucide icons. Frontend Node requirement: `^22.22.0 || >=24` (React Router 8).

## Try the app locally without Supabase

`npm run dev:memory` (in `backend/`) runs the real API against an **in-memory PostgreSQL** (PGlite) with `schema.sql` applied. Nothing is persisted, and it refuses to run with `NODE_ENV=production`. Use it to click through the app before your Supabase project is set up.

```bash
# Terminal 1 — API + in-memory database (http://localhost:4000)
cd backend && npm install && npm run dev:memory
```

```bash
# Terminal 2 — create an admin in that database (prompts for email and password)
cd backend && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres DATABASE_SSL_MODE=disable npm run admin:create
```

```bash
# Terminal 3 — frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

**Public submission flow**
1. Open http://localhost:5173 and press **Send inquiry** with the form empty. Every field shows its own error, the first one is focused, and nothing is sent.
2. Fill in all fields and submit. The button changes to **Sending…** and the form is locked, so a second request cannot be sent.
3. **Thank you — your inquiry has been received** appears only after the API answers `201`, with a reference (the first 8 characters of the stored id). Submitting the identical inquiry again within 10 minutes shows **We already have this inquiry**.
4. To see a failure, stop terminal 1 and submit. You get **Your inquiry was not sent**, and your text stays in the form.

**Login flow**
1. Open http://localhost:5173/admin/dashboard. You are sent to `/login` with "Please sign in to continue."
2. A wrong password gives **Incorrect email or password.** (the same message for an unknown email). The password field is cleared and focused. Six failures in 15 minutes give the rate-limit message.
3. Correct credentials take you to `/admin/dashboard`. In DevTools, *Application → Cookies* shows `edtech_admin_session` as **HttpOnly**, and `document.cookie`, `localStorage` and `sessionStorage` are empty.
4. Reload the page: the session is restored through `GET /api/auth/me`.
5. **Sign out** calls `POST /api/auth/logout` and returns you to `/login` with "You have signed out." Opening `/admin/dashboard` again redirects to `/login`.

**Dashboard flow** (submit a few inquiries first, through the form or `curl`):
1. The table lists the inquiries newest first, 20 per page, with "Showing 1–n of N".
2. Pick a **Category**, then a **User type**: each change reloads from the API, and the URL records the filters.
3. Type part of a name (any case), or a phone number with or without spaces and dashes, into **Search**. Results update after you pause typing.
4. **Reset filters** clears everything. With more than 20 inquiries, **Next** and **Previous** page through them, and the filters are kept.
5. Change a row's **Status**. The select shows a spinner, then a confirmation message appears; reload the page to see that the change was saved.

In the in-memory mode the JWT secret is random per run, so restarting the API ends every session.

## Testing

```bash
cd backend && npm test
cd frontend && npm test
```

- **Frontend:** the real router, auth provider, forms and validation with the API modules mocked. Covers field validation and errors, loading and double-submit prevention, success only on confirmed saves, failure messages, the protected-route redirect, session restore, login and logout, the 401 → sign-in flow, no token in web storage, and an Axios client test with a fake adapter. `tests/validation.test.js` runs the same inputs through the frontend and backend schemas and fails if they disagree.
- **Backend:** unit tests (config, TLS options, retry logic, models, error handling, inquiry validation), Supertest API tests with stubbed services (health, CORS, headers, body parsing, 404, inquiry submission, rate limiting, database-failure responses), **persistence tests** that run the real app, Sequelize and `pg` against an in-process PGlite PostgreSQL over TCP, and **schema tests** that execute `schema.sql` in [PGlite](https://pglite.dev), a real PostgreSQL engine compiled to WebAssembly. These check constraints, defaults, the `updated_at` trigger, indexes and RLS without any database server. SQLite is not used anywhere.
- **Integration tests** run against a real PostgreSQL database and are **skipped** unless `TEST_DATABASE_URL` is set. Use a separate Supabase project or a disposable database, never production. They apply `schema.sql`, and every row they write is rolled back.
  ```bash
  TEST_DATABASE_URL='postgresql://…' npm run test:integration
  ```

## Admin accounts

There is no sign-up page and no default admin. Create one with the bootstrap script (from `backend/`, with `DATABASE_URL` configured):

```bash
npm run admin:create
```

It asks for the email and the password. The password is hidden and asked twice. Rules: at least 12 characters, at most 72 bytes, at least 5 different characters, not a common password, and not containing the email name. The password is hashed with bcrypt (cost `BCRYPT_SALT_ROUNDS`, default 12), and only the hash is stored in `admins.password_hash`. The script prints the email and id, never the password or hash. A duplicate email fails with exit code 1.

Non-interactive use, for example in a Render shell, reads the password from the environment or from one line on stdin. Passwords are never accepted as a command-line argument.

```bash
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD && ADMIN_EMAIL=you@school.org npm run admin:create; unset ADMIN_PASSWORD
```

## Authentication testing

### How it works

1. `POST /api/auth/login` with `{ email, password }`. The server looks up the admin and checks the password with `bcrypt.compare`. An unknown email does the same work against a dummy hash, so both failures look identical.
2. On success it signs a JWT (HS256) with only `sub` (admin id), `role`, `jti`, `iat`, `exp` (`JWT_EXPIRES_IN`, default 1 h), `iss` and `aud`. It sets that JWT as an **HttpOnly, SameSite=Strict** cookie (Secure and `__Host-` prefixed in production). The token is never in the response body.
3. Every admin request sends the cookie automatically. The `authenticate` middleware verifies signature, algorithm, expiry, issuer and audience, rejects revoked tokens, and confirms the admin still exists. The role comes from the server, never from the request.
4. State-changing requests (login, logout, status updates, or any unsafe request with the cookie) must carry an `Origin` from `FRONTEND_URL`. That is the CSRF protection, alongside SameSite=Strict.
5. `POST /api/auth/logout` revokes the token's `jti` and clears the cookie.

| Response | Meaning |
|----------|---------|
| `401 INVALID_CREDENTIALS` | wrong email or password (same for both) |
| `401 AUTH_REQUIRED` | no session cookie |
| `401 INVALID_TOKEN` | tampered, malformed, wrong issuer/audience/algorithm, or the admin was deleted |
| `401 TOKEN_EXPIRED` | past `exp` |
| `401 TOKEN_REVOKED` | signed out |
| `403 ORIGIN_NOT_ALLOWED` | state-changing request without an allowed `Origin` |
| `403 FORBIDDEN` | signed in but lacking the required role |
| `429 RATE_LIMITED` | more than `LOGIN_RATE_LIMIT_MAX` (default 5) failed logins per IP in 15 minutes |

### Try it with curl

Start the API (`npm run dev` in `backend/`) and create an admin first. `curl` sends no `Origin` header by default, so add the frontend origin on state-changing requests. `-c`/`-b` keep the cookie in a jar file, as a browser would.

```bash
API=http://localhost:4000/api
ORIGIN='Origin: http://localhost:5173'
read -rs PW   # type the admin password; it is not echoed
```

```bash
# 1. Protected data without a session → 401 AUTH_REQUIRED
curl -i $API/inquiries
```

```bash
# 2. Wrong password, then unknown email → identical 401 INVALID_CREDENTIALS
curl -i -H "$ORIGIN" -H 'Content-Type: application/json' -d '{"email":"you@school.org","password":"wrong-password"}' $API/auth/login
curl -i -H "$ORIGIN" -H 'Content-Type: application/json' -d '{"email":"nobody@school.org","password":"wrong-password"}' $API/auth/login
```

```bash
# 3. Valid login → 200 and Set-Cookie: edtech_admin_session=…; HttpOnly; SameSite=Strict; Max-Age=3600
curl -i -c cookies.txt -H "$ORIGIN" -H 'Content-Type: application/json' -d "{\"email\":\"you@school.org\",\"password\":\"$PW\"}" $API/auth/login
```

```bash
# 4. Use the session → 200
curl -b cookies.txt $API/auth/me
curl -b cookies.txt "$API/inquiries?page=1&pageSize=20"
```

```bash
# 5. Inspect the claims (payload only; the signature is what the server checks)
TOKEN=$(awk '/edtech_admin_session/ {print $7}' cookies.txt)
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" "$TOKEN"
```

```bash
# 6. Tampered signature → 401 INVALID_TOKEN
curl -i -H "Cookie: edtech_admin_session=${TOKEN%???}abc" $API/auth/me
```

```bash
# 7. State change without Origin → 403 ORIGIN_NOT_ALLOWED; with Origin → 200
ID=$(curl -s -b cookies.txt $API/inquiries | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0]?.id??''))")
curl -i -b cookies.txt -X PATCH -H 'Content-Type: application/json' -d '{"status":"In Progress"}' $API/inquiries/$ID/status
curl -i -b cookies.txt -X PATCH -H "$ORIGIN" -H 'Content-Type: application/json' -d '{"status":"In Progress"}' $API/inquiries/$ID/status
```

```bash
# 8. Logout → cookie cleared; the jar no longer authenticates, and replaying the old token → 401 TOKEN_REVOKED
curl -i -b cookies.txt -c cookies.txt -X POST -H "$ORIGIN" $API/auth/logout
curl -i -b cookies.txt $API/auth/me
curl -i -H "Cookie: edtech_admin_session=$TOKEN" $API/auth/me
```

**Expiry:** restart the API with `JWT_EXPIRES_IN=10s`, log in (step 3), save `TOKEN` (step 5), wait 11 seconds, then run `curl -i -H "Cookie: edtech_admin_session=$TOKEN" $API/auth/me`. You get `401 TOKEN_EXPIRED`. curl itself also drops the expired cookie from the jar, so `-b cookies.txt` gives `AUTH_REQUIRED`.

**Rate limit:** six wrong passwords in a row from one IP → the sixth gets `429` with `Retry-After`.

Run `unset PW TOKEN` and delete `cookies.txt` when you are done.

### Automated tests

`npm test` in `backend/` covers:
- valid login, wrong password and unknown email (identical responses);
- malformed requests, a missing cookie, invalid signatures, foreign secrets and `alg: none`;
- expired, revoked and orphaned tokens;
- cookie attributes, origin/CSRF checks, rate limiting and role-based 403;
- unauthorised access to every inquiry route;
- bcrypt hash storage (cost 12, no plaintext) and the `admin:create` script.

### Deployment note

Cookie authentication works best when the browser sees the SPA and the API on **one site**. Proxy `/api/*` from Vercel to Render with a rewrite, and leave `VITE_API_BASE_URL` empty. Set `FRONTEND_URL` to the exact Vercel origin and `TRUST_PROXY=2`. Without a proxy, the cookie would be third-party and some browsers would block it. See [ARCHITECTURE.md §5.8](docs/ARCHITECTURE.md).

## Database TLS options

| `DATABASE_SSL_MODE` | Behaviour |
|---------------------|-----------|
| `verify-full` (default) | Encrypted; certificate chain **and** hostname verified. Requires `DATABASE_SSL_CA_PATH` or `DATABASE_SSL_CA` for Supabase. |
| `require` | Encrypted but **not verified** (vulnerable to man-in-the-middle). Explicit opt-in only; logs a warning at startup. |
| `disable` | No TLS. Only for a local PostgreSQL; rejected when `NODE_ENV=production`. |

On hosts where adding a file is awkward (such as Render), set `DATABASE_SSL_CA` to the certificate's PEM text, with `\n` for line breaks, instead of `DATABASE_SSL_CA_PATH`.

## Troubleshooting

| Log hint / symptom | Fix |
|--------------------|-----|
| `SELF_SIGNED_CERT_IN_CHAIN` | Download the Supabase CA (step 1.3) and set `DATABASE_SSL_CA_PATH` |
| `Tenant or user not found` | The pooler user must be `postgres.<project-ref>`, and the region in the host must match the project |
| `28P01` authentication failed | Wrong database password in `DATABASE_URL`. URL-encode special characters (`@` → `%40`) |
| `ENETUNREACH` / `EHOSTUNREACH` | You are using the IPv6-only direct host; switch to the pooler URI |
| Browser shows `CORS_ORIGIN_DENIED` | Add the exact frontend origin to `FRONTEND_URL` (comma-separated for several) |
| Form says "We could not reach the server" | Start the backend on port 4000 (or `npm run dev:memory`), or set `DEV_API_PROXY_TARGET` |
| Sign-in says "The server did not accept requests from this site" | Add the exact frontend origin (e.g. `http://localhost:5173`) to `FRONTEND_URL` |

## License

[MIT](LICENSE)
