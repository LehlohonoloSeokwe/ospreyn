# Ospreyn

Rights-recording and split-documentation infrastructure for independent artists, producers and music teams.

A rights record moves through one path: **create → define ownership → invite contributors → collect confirmations → preserve evidence → export.**

## Architecture

Four separately deployed pieces. Only the first goes on Netlify.

```
Browser
  │
  ├─ React SPA (Netlify, static)  ──── fetch with credentials ────┐
  │                                                               │
  └─ direct PUT/GET via presigned URL ──► Object storage          │
                                          (private bucket)        │
                                                                  ▼
                                                        Express API (Node)
                                                                  │
                                                                  ▼
                                                          PostgreSQL 16+
```

The frontend holds no data. Every song, split, confirmation and audit event lives in PostgreSQL. Uploaded documents live in private object storage and are reachable only through short-lived presigned URLs. Files never pass through the API server.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full deployment path.

## Local development

Requires Node 20+ and a PostgreSQL 16+ database.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npm run migrate             # creates tables; optionally bootstraps an owner
```

Then run the API and the frontend in two terminals:

```bash
npm run dev:api             # Express on :3000
npm run dev                 # Vite on :5173, proxying /api to :3000
```

Open http://localhost:5173 and create a workspace from the sign-in screen.

Leave `VITE_API_BASE_URL` empty locally. The Vite proxy keeps the browser same-origin, so cookies behave as they do in production without extra configuration.

## Scripts

| Script | What it does |
| :--- | :--- |
| `npm run dev` | Vite dev server for the frontend |
| `npm run dev:api` | API server with reload on change |
| `npm run build` | Production frontend build into `dist/` — this is what Netlify runs |
| `npm run build:server` | Bundles the API into `dist-server/` |
| `npm start` | Runs the bundled API |
| `npm run start:tsx` | Runs the API directly from TypeScript, no bundling step |
| `npm run migrate` | Applies `server/schema.sql` |
| `npm run lint` | `tsc --noEmit` across `src/` and `server/` |

## Layout

```
src/                    React frontend — the Netlify deployable
  lib/api.ts            API client; single place the base URL is configured
  components/           Views and tabs
  types.ts              Domain types shared with the server
server/                 Express API — deployed separately
  index.ts              Entry point: CORS, cookies, routing
  routes.ts             REST endpoints
  repo.ts               SQL data access
  db.ts                 Connection pool and transaction helper
  auth.ts               Password hashing, sessions, route guards
  storage.ts            Presigned URLs for the document vault
  agreements.ts         Split-sheet document rendering
  migrate.ts            Schema runner and first-owner bootstrap
  schema.sql            PostgreSQL schema, idempotent
netlify.toml            Build config, SPA fallback, security headers
.env.example            Every variable, split into frontend-safe and API-secret
```

## Data model notes

**Ownership is stored in basis points**, where 10,000 equals 100.00%. Integers avoid the rounding drift that makes a three-way split fail to reconcile. A 33.34% share is 3,334 bps. Composition and master are tracked independently and each must total exactly 10,000 before review links can be issued.

**Rights records are versioned.** A confirmed version cannot be edited. Changing agreed splits requires bumping to a new version with a stated reason, which supersedes the old one and revokes any review links still outstanding against it.

**Review links are single-use and hashed.** Only a SHA-256 hash is stored. The raw link is shown once, when it is created, and cannot be retrieved afterwards. Reissue if it is lost.

**The audit ledger is append-only.** Every state change writes an event scoped to the workspace, with the actor, the entity and a timestamp.

## What Ospreyn does not claim

Ospreyn records what parties say they agreed, with timestamps and the addresses responses came from. It does not provide legal advice, and it does not assert that an electronic confirmation is an enforceable signature in any jurisdiction. Have the agreement text and the confirmation mechanism reviewed by qualified counsel before relying on them.

## Not yet built

- Email delivery for review links. They are generated and shown for you to send.
- Rate limiting on sign-in. Add before opening public registration.
- Automated database backups. Configure with your provider.
