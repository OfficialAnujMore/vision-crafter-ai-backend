# Vision Crafter AI — Backend

REST API for Vision Crafter AI: Google OAuth, project persistence, presigned S3 uploads, AI image operations through Replicate, and a Stripe-backed token economy.

This repo is the **Express 5 + TypeScript API**. The client lives in [vision-crafter-ai-frontend](https://github.com/OfficialAnujMore/vision-crafter-ai-frontend).

---

## Demo

| | |
|---|---|
| **Video walkthrough** | _<!-- Paste your public YouTube / Google Drive link here -->_ |
| **Live API** | _<!-- Paste your deployed URL here -->_ |
| **Frontend repo** | [OfficialAnujMore/vision-crafter-ai-frontend](https://github.com/OfficialAnujMore/vision-crafter-ai-frontend) |

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+, TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL |
| ORM | Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| Auth | Google ID token exchange → JWT in HttpOnly cookies |
| Storage | AWS S3 via presigned PUT URLs (`@aws-sdk/client-s3`) |
| AI | Replicate (FLUX, SDXL, Imagen 3, Bria, 851-labs background remover) |
| Payments | Stripe Checkout (one-time payments) + signed webhooks |
| Config | Zod-validated environment schema — the process refuses to boot on a bad env |

---

## Architecture

```mermaid
flowchart LR
    FE[React client] -->|HttpOnly cookies| API

    subgraph API[Express 5 API]
        AUTH["/auth"]
        PROJ["/api/projects"]
        STOR["/api/storage"]
        AI["/api/ai"]
        PAY["/api/payments"]
        HOOK["/stripe/webhook"]
    end

    AUTH --> G[[Google tokeninfo]]
    API --> DB[(PostgreSQL<br/>Prisma)]
    STOR -.presigned PUT.-> S3[(AWS S3)]
    FE -.uploads bytes directly.-> S3
    AI --> REP[[Replicate]]
    PAY --> ST[[Stripe Checkout]]
    ST -.signed event.-> HOOK
```

Two flows deliberately bypass the API body: **image bytes** go browser → S3 with a presigned URL, and **payment confirmation** arrives as a Stripe webhook rather than a client callback, so neither the upload size nor a closed browser tab can break the system.

---

## API reference

All responses share one envelope:

```json
{ "success": true,  "message": "...", "data": { } }
{ "success": false, "message": "...", "statusCode": 400 }
```

Prisma's camelCase fields are serialized to snake_case on the way out.

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | `{ service, status }` |

### Auth — `/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/google` | Exchange a Google ID token; creates the user and a 50-token starter balance on first sign-in |
| POST | `/auth/refresh` | Issue a new access token from the refresh cookie |
| POST | `/auth/logout` | Clear both auth cookies |

### Projects — `/api/projects` · auth required

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/create` | Create a project |
| GET | `/api/projects/:projectId` | Fetch one project (ownership verified) |
| GET | `/api/projects/user/:userId` | List a user's projects |
| PUT | `/api/projects/:projectId` | Full update |
| PATCH | `/api/projects/:projectId` | Partial update — used by the 5-second autosave |
| DELETE | `/api/projects/:projectId` | Delete the row and its S3 object |

### Storage — `/api/storage` · auth required

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/storage/presign` | Presigned S3 PUT URL, 5-minute expiry |

Body `{ fileName, contentType, key? }`. Omit `key` for a new upload; pass an existing `key` to overwrite an object you own (the autosave path — ownership is re-checked against the project row). Returns `{ upload_url, key, public_url }`.

### AI — `/api/ai` · auth required, token-gated

| Method | Endpoint | Cost | Model |
|---|---|---|---|
| POST | `/api/ai/remove-background` | 2 | `851-labs/background-remover` |
| POST | `/api/ai/extend-image` | 5 | `bria/expand-image` |
| POST | `/api/ai/generate-image` | 4 | `flux-schnell`, `sdxl` or `imagen-3` |
| POST | `/api/ai/edit-image` | 4 | `black-forest-labs/flux-kontext-pro` |

Each returns `{ result_url, token_balance }`. `requireTokens` rejects with **402** and `{ required, available }` before any model is invoked; the debit only lands after the model returns, so a failed generation never costs the user anything.

### Payments — `/api/payments` · auth required

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/payments/balance` | Current balance + last 50 transactions |
| GET | `/api/payments/purchases` | Purchase history |
| POST | `/api/payments/checkout` | Create a Stripe Checkout session — body `{ plan: "creator" \| "pro" }` |

### Stripe webhook — `/stripe/webhook`

Public, signature-verified, and mounted with `express.raw()` **before** `express.json()` so the raw body survives for HMAC verification. Handles `checkout.session.completed`: marks the purchase `completed` and credits tokens in one transaction. Idempotent — a replayed event for an already-fulfilled session is acknowledged without double-crediting.

---

## Token economy

New users get **50 tokens** on signup. Packs are one-time purchases; tokens never expire.

| Action | Cost | | Plan | Price | Tokens |
|---|---|---|---|---|---|
| Background removal | 2 | | Creator | $9 | 500 |
| Smart object removal | 3 | | Pro | $29 | 2,000 |
| AI image generation | 4 | | | | |
| AI image edit | 4 | | | | |
| Image extension | 5 | | | | |

Costs and plans are defined in one place, [`src/config/tokens.ts`](src/config/tokens.ts).

Deductions run inside a Postgres transaction that takes a `SELECT ... FOR UPDATE` row lock on the balance, so concurrent requests from the same user can't spend the same tokens twice. Every credit and debit is appended to `token_transactions` with the resulting balance — the ledger, not the balance column, is the audit trail.

---

## Data model

```mermaid
erDiagram
    User ||--o| TokenBalance : has
    User ||--o{ Purchase : makes
    User ||--o{ TokenTransaction : accrues
    User ||--o{ Project : owns
    Purchase ||--o{ TokenTransaction : credits
```

| Model | Notes |
|---|---|
| `User` | Keyed by Google `sub`; email and name unique-indexed |
| `TokenBalance` | One row per user, defaults to the 50-token signup bonus |
| `Purchase` | UUID id, unique `stripe_session_id`, `pending → completed \| failed` |
| `TokenTransaction` | Append-only ledger of `credit` / `debit` with `balance_after` |
| `Project` | UUID id, `file_id` = S3 object key, `canvas_state` = serialized Fabric JSON |

Full schema: [`prisma/schema.prisma`](prisma/schema.prisma).

---

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Accounts: [Google Cloud](https://console.cloud.google.com/apis/credentials) (OAuth client), [AWS](https://aws.amazon.com/s3/) (S3 bucket + IAM user), [Replicate](https://replicate.com/account/api-tokens), [Stripe](https://dashboard.stripe.com/apikeys)

### Install

```bash
git clone https://github.com/OfficialAnujMore/vision-crafter-ai-backend.git
cd vision-crafter-ai-backend
npm install
createdb visioncrafter
```

### Configure

Copy `.env.example` to `.env` and fill it in:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/visioncrafter"

JWT_SECRET_KEY=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

AWS_REGION=us-west-1
AWS_ACCESS_KEY_ID=your-iam-access-key-id
AWS_SECRET_ACCESS_KEY=your-iam-secret-access-key
S3_BUCKET_NAME=vision-crafter-ai-uploads
S3_PUBLIC_BASE_URL=https://vision-crafter-ai-uploads.s3.us-west-1.amazonaws.com

REPLICATE_API_TOKEN=your-replicate-api-token

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

APP_NAME=VisionCrafterAI
PORT=8000
FRONTEND_URL=http://localhost:5173
CORS_ALLOW_ORIGINS=http://localhost:5173
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET_KEY` | yes | — | Signing key for access and refresh tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `15` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | `7` | Refresh token lifetime |
| `GOOGLE_CLIENT_ID` | yes | — | Verified against the `aud` claim of incoming Google tokens |
| `AWS_REGION` | yes | — | S3 bucket region |
| `AWS_ACCESS_KEY_ID` | yes | — | IAM key with `PutObject` / `DeleteObject` on the bucket |
| `AWS_SECRET_ACCESS_KEY` | yes | — | IAM secret |
| `S3_BUCKET_NAME` | yes | — | Upload bucket |
| `S3_PUBLIC_BASE_URL` | yes | — | Public read base URL (swap for a CloudFront domain in production) |
| `REPLICATE_API_TOKEN` | yes | — | Replicate API token for all AI routes |
| `STRIPE_SECRET_KEY` | yes | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | yes | — | Webhook signing secret from the Stripe CLI or dashboard |
| `APP_NAME` | no | `VisionCrafterAI` | Reported by the health endpoint |
| `PORT` | no | `8000` | HTTP port |
| `FRONTEND_URL` | no | `http://localhost:5173` | Base for Stripe success / cancel redirects |
| `CORS_ALLOW_ORIGINS` | no | `http://localhost:5173` | Comma-separated allowed origins |

The schema in [`src/config/env.ts`](src/config/env.ts) is parsed at import time, so a missing required variable fails fast at boot instead of at the first request.

The S3 bucket needs CORS allowing `PUT` from your frontend origin, and public read on the `projects/*` prefix (or a CloudFront distribution in front of it).

### Migrate and run

```bash
npm run db:generate   # generate the Prisma client
npm run db:push       # create tables (use db:migrate for versioned migrations)
npm run dev
```

The API listens on `http://localhost:8000`.

### Testing Stripe locally

```bash
stripe login
stripe listen --forward-to localhost:8000/stripe/webhook
# copy the printed whsec_... into STRIPE_WEBHOOK_SECRET, then restart the server
stripe trigger checkout.session.completed
```

Use card `4242 4242 4242 4242` with any future expiry in Checkout.

> Running both services at once: `./dev.sh` in the parent `Vision-Crafter-AI` directory starts the backend and frontend together with prefixed logs.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:push` | Push the schema without a migration (dev only) |
| `npm run db:studio` | Prisma Studio |

---

## Project structure

```
src/
├── index.ts                  # App setup, middleware order, route mounting
├── config/
│   ├── env.ts                # Zod-validated environment schema
│   ├── db.ts                 # Prisma client on a pg.Pool adapter
│   ├── stripe.ts             # Stripe client
│   └── tokens.ts             # Token costs, plans, signup bonus
├── routes/
│   ├── auth.ts               # Google OAuth, cookie issuance, refresh, logout
│   ├── project.ts            # Project CRUD with ownership checks
│   ├── storage.ts            # Presigned S3 upload URLs
│   ├── ai.ts                 # Replicate-backed AI operations
│   ├── payments.ts           # Balance, purchase history, Checkout sessions
│   └── stripeWebhook.ts      # Signature-verified fulfilment
├── middleware/
│   ├── auth.ts               # requireAuth — cookie JWT verification
│   ├── tokenGate.ts          # requireTokens(action) — 402 before spending
│   └── errorHandler.ts       # Global handler with AppError
├── services/
│   └── tokenService.ts       # Balance init, locked debit, purchase credit
├── utils/
│   ├── security.ts           # JWT create/verify, Google token verification
│   └── s3.ts                 # Key building, presigned PUT, delete
└── generated/prisma/         # Generated client (gitignored)

prisma/
└── schema.prisma
```

---

## Authentication flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant G as Google
    participant D as PostgreSQL

    C->>A: POST /auth/google { token }
    A->>G: GET tokeninfo?id_token=...
    G-->>A: { sub, email, name, picture, aud }
    A->>A: assert aud === GOOGLE_CLIENT_ID
    A->>D: upsert user (+ 50-token balance if new)
    A-->>C: Set-Cookie access_token (15m) + refresh_token (7d)
    C->>A: protected request (cookies auto-sent)
    A-->>C: 401 when access token expires
    C->>A: POST /auth/refresh
    A-->>C: Set-Cookie new access_token
```

Both cookies are `HttpOnly`, `Secure`, `SameSite=none`, so they are unreadable from JavaScript and survive a cross-origin frontend deployment. `verifyTokenType` also checks the `type` claim, so a refresh token can never be replayed as an access token.

---

## Notable decisions

**Fail-fast config.** Every environment variable passes through Zod at import time. A typo in `S3_BUCKET_NAME` crashes the process on startup rather than surfacing as a confusing 500 an hour later.

**Webhook before the JSON parser.** Stripe signature verification needs the exact raw bytes, so `/stripe/webhook` is mounted with `express.raw()` above `express.json()` in [`src/index.ts`](src/index.ts). Getting this order wrong is the classic silent Stripe integration bug.

**Row-locked debits.** `deductTokens` opens a transaction, takes `SELECT ... FOR UPDATE` on the balance row, checks the cost, writes the new balance and appends a ledger entry — all atomically. Two simultaneous generate requests can't both pass the balance check.

**Gate first, charge last.** `requireTokens` returns 402 before the model call; the debit happens after a successful response. A Replicate timeout costs the user nothing.

**Ownership on every route.** Project reads, updates, deletes, and presign-overwrites all verify `project.userId` against the JWT subject. Knowing an object key is not authorization to write to it.

**Immutable object keys.** `buildObjectKey` mints `projects/<userId>/<uuid>.<ext>` once and never changes it. Autosave overwrites in place, so stored URLs stay valid and renames never orphan storage.

---

## Related

- [Frontend repository](https://github.com/OfficialAnujMore/vision-crafter-ai-frontend) — React 19, Vite, Fabric.js
