# Deploying Ospreyn

Ospreyn is four separately deployed pieces. Netlify hosts one of them.

| Piece | Where it goes | Why not Netlify |
| :--- | :--- | :--- |
| React frontend (`src/`, `index.html`) | **Netlify** | — |
| API server (`server/`) | Render, Railway, Fly.io, Cloud Run | Long-lived Express process with a connection pool |
| PostgreSQL 16+ | Neon, Supabase, RDS, Railway | Stateful |
| Object storage (document vault) | S3, Cloudflare R2, Backblaze B2 | Stores private files |

Deploy in this order: database, then object storage, then API, then frontend. The frontend needs the API's URL at build time, and the API needs the frontend's origin for CORS, so you will set one variable on each side after both exist.

---

## 1. PostgreSQL

Create a PostgreSQL 16+ database and copy its connection string.

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/ospreyn"
npm install
npm run migrate
```

`npm run migrate` applies `server/schema.sql`. The file is idempotent, so it is safe to run on every deploy.

To create your first sign-in account, set these before running it:

```bash
export BOOTSTRAP_EMAIL="you@example.com"
export BOOTSTRAP_PASSWORD="a-long-password-at-least-12-chars"
export BOOTSTRAP_FULL_NAME="Your Legal Name"
export BOOTSTRAP_ORG_NAME="Your Workspace"
npm run migrate
```

Remove `BOOTSTRAP_PASSWORD` from the environment afterwards. You can also just use the "Create workspace" form on the sign-in screen.

## 2. Object storage

Create a **private** bucket. Never enable public read.

The browser uploads directly to the bucket using presigned URLs, so the bucket needs a CORS rule allowing `PUT` from your Netlify origin:

```json
[
  {
    "AllowedOrigins": ["https://your-site.netlify.app"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type", "x-amz-checksum-sha256"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

If uploads fail with a network error and nothing appears in the API logs, this CORS rule is almost always the reason. The request never reaches Ospreyn.

Create an IAM user or API token scoped to `GetObject`, `PutObject`, `DeleteObject` and `HeadObject` on that bucket only.

## 3. API server

Any host that runs a Node process works. The server reads `PORT` from the environment.

- Build command: `npm install && npm run build:server`
- Start command: `npm start`
- Health check path: `/api/health`

Or skip the bundling step and run `npm install && npm run start:tsx`.

Set every API variable from `.env.example`. At minimum: `DATABASE_URL`, `APP_ORIGIN`, `API_ORIGIN`, `CORS_ORIGINS`, and the four `S3_*` values.

Run `npm run migrate` once against the production database before the first start.

## 4. Netlify frontend

Connect the repository. `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`) and the SPA fallback.

Set one environment variable in **Site configuration > Environment variables**:

```
VITE_API_BASE_URL = https://your-api-host.com
```

No trailing slash. This is compiled into the public bundle, so it must never hold a secret.

Deploy, then come back and add your final Netlify domain to `CORS_ORIGINS` and `APP_ORIGIN` on the API host, and to the bucket's CORS rule.

---

## Verifying the deployment

1. `curl https://your-api-host.com/api/health` returns `{"status":"ok","database":"connected"}`.
2. Open the Netlify site. You should see the sign-in screen, not an empty dashboard.
3. Sign in. The browser devtools Network tab should show requests to your API host returning 200, not 404 from Netlify.
4. Navigate to a song, then **hard refresh**. The page must reload on the same record rather than 404.
5. Create a rights record, set splits to 100% on both sides, issue a review link.
6. Open that link in a private window. It must load without a sign-in prompt.
7. Confirm the split there, then check the audit tab on the record.
8. Upload a file to the document vault, then download it. The downloaded file must be byte-identical to the original.
9. **Restart the API process**, reload the dashboard. Everything must still be there. If the catalogue empties, the API is not actually talking to PostgreSQL.

## Cookies across domains

Auth rides on an `httpOnly` session cookie. When the frontend and API are on different hosts, the cookie must be `SameSite=None; Secure`, which the server sets automatically once `APP_ORIGIN` and `API_ORIGIN` differ. Both must be served over HTTPS.

If sign-in appears to succeed but every later request returns 401, the cookie is being dropped. Check that both origins are HTTPS, that `CORS_ORIGINS` contains the exact frontend origin, and that Safari's cross-site tracking prevention is not blocking it. Putting the API on a subdomain of the frontend's domain and setting `COOKIE_DOMAIN` avoids this class of problem entirely.

## What is deliberately not included

- **Email delivery.** Review links are generated and shown once in the UI for you to send yourself. Wire up Resend, Postmark or SES in `server/routes.ts` where invitations are created.
- **Rate limiting** on the sign-in endpoint. Add `express-rate-limit` before opening registration publicly.
- **Automated backups.** Configure these with your database provider. For a rights ledger, this is not optional.
