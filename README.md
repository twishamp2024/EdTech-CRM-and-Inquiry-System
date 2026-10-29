# EdTech CRM & Inquiry Management System

An EdTech CRM and inquiry management system designed for prospective student inquiries and administrative lead management.

> **Status:** stage 3 of the [implementation plan](docs/IMPLEMENTATION_PLAN.md): the foundation, the database layer and the public inquiry submission API (`POST /api/inquiries`) are in place. Admin authentication, the admin inquiry APIs, the form UI and the dashboard are built next.

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

Supabase is used only as managed PostgreSQL. Authentication is custom (bcrypt + JWT); Supabase Auth and the Supabase JS client are not used, and the frontend never connects to the database.

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

### Startup behaviour

- Configuration is validated at startup. Missing or invalid variables are listed together and the process exits with code 1.
- The server connects to the database before accepting traffic. Transient errors are retried (`DATABASE_CONNECT_RETRIES`, default 5, with backoff). Errors retrying cannot fix (wrong password, certificate problems, unknown database) fail immediately. Every failure is logged with a hint, and credentials are never logged.
- `SIGTERM`/`SIGINT` trigger a graceful shutdown.

## API

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

In development the app calls same-origin `/api/...`, and Vite proxies those requests to `http://localhost:4000` (override with `DEV_API_PROXY_TARGET` in `frontend/.env.local`). The page header shows **API online** when the backend answers.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm run build` / `npm run preview` | Production build / serve it locally |
| `npm test` | Vitest + Testing Library |
| `npm run lint` / `npm run format:check` | ESLint / Prettier |

For production, set `VITE_API_BASE_URL` to the deployed API (for example `https://<service>.onrender.com/api`). It is embedded in the public bundle, so never put secrets there.

## Testing

```bash
cd backend && npm test
cd frontend && npm test
```

- **Backend:** unit tests (config, TLS options, retry logic, models, error handling, inquiry validation), Supertest API tests with stubbed services (health, CORS, headers, body parsing, 404, inquiry submission, rate limiting, database-failure responses), **persistence tests** that run the real app, Sequelize and `pg` against an in-process PGlite PostgreSQL over TCP, and **schema tests** that execute `schema.sql` in [PGlite](https://pglite.dev), a real PostgreSQL engine compiled to WebAssembly. These check constraints, defaults, the `updated_at` trigger, indexes and RLS without any database server. SQLite is not used anywhere.
- **Integration tests** run against a real PostgreSQL database and are **skipped** unless `TEST_DATABASE_URL` is set. Use a separate Supabase project or a disposable database, never production. They apply `schema.sql`, and every row they write is rolled back.
  ```bash
  TEST_DATABASE_URL='postgresql://…' npm run test:integration
  ```

## Authentication testing

Admin login (bcrypt + JWT), the seed script and step-by-step instructions for testing valid, invalid and expired tokens are added in the next stage, together with `POST /api/auth/login`.

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
| Frontend shows **API unreachable** | Start the backend on port 4000, or set `DEV_API_PROXY_TARGET` |

## License

[MIT](LICENSE)
