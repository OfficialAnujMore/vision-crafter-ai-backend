# VisionCrafterAI — Node.js Backend

## Tech Stack

- **Node.js** with **TypeScript**
- **Express 5** web framework
- **Prisma 7** ORM with PostgreSQL driver adapter (`@prisma/adapter-pg`)
- **Local PostgreSQL** database
- **jsonwebtoken** for JWT auth
- **@imagekit/nodejs** for ImageKit upload auth
- **Zod** for environment validation

## Commands

```bash
npm run dev        # Start dev server with hot reload (tsx watch)
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled JS from dist/
npm run db:generate  # Generate Prisma client after schema changes
npm run db:migrate   # Create and apply database migration
npm run db:push      # Push schema to DB without migration (dev only)
npm run db:studio    # Open Prisma Studio (DB GUI)
```

## Directory Structure

```
src/
├── index.ts              # Express app setup, middleware, route mounting
├── config/
│   ├── env.ts            # Zod-validated environment variables
│   └── db.ts             # Prisma client with pg adapter
├── routes/
│   ├── auth.ts           # Google OAuth, JWT cookies, refresh, logout
│   ├── project.ts        # Project CRUD with ownership checks
│   └── imagekit.ts       # ImageKit upload auth endpoint
├── middleware/
│   ├── auth.ts           # requireAuth middleware (cookie-based JWT)
│   └── errorHandler.ts   # Global error handler
├── utils/
│   ├── security.ts       # JWT create/verify, Google token verification
│   └── imagekit.ts       # ImageKit API (file details, rename, delete)
└── generated/prisma/     # Auto-generated Prisma client (gitignored)

prisma/
└── schema.prisma         # Database schema (User + Project models)
```

## API Endpoints

Same contract as the FastAPI backend — frontend needs zero changes.

### Auth (`/auth`)
- `POST /auth/google` — Google OAuth login, sets JWT cookies
- `POST /auth/refresh` — Refresh access token from refresh cookie
- `POST /auth/logout` — Clear auth cookies

### Projects (`/api/projects`)
- `POST /api/projects/create` — Create project
- `GET /api/projects/:projectId` — Get project (ownership verified)
- `GET /api/projects/user/:userId` — List user's projects
- `PUT /api/projects/:projectId` — Full update
- `PATCH /api/projects/:projectId` — Partial update
- `DELETE /api/projects/:fileId` — Delete project + ImageKit file

### ImageKit (`/api/imagekit`)
- `GET /api/imagekit/auth` — Upload auth params (token, signature, expire)

### Health
- `GET /` — `{ service, status }`

## Response Format

```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "message": "...", "statusCode": 400 }
```

## Database Setup

1. Install PostgreSQL locally
2. Create database: `createdb visioncrafter`
3. Copy `.env.example` to `.env` and update `DATABASE_URL`
4. Run `npm run db:push` to create tables (or `npm run db:migrate` for migrations)

## Key Patterns

- **Cookie auth** — access + refresh tokens in HttpOnly, Secure, SameSite=none cookies
- **Ownership checks** — every project endpoint verifies the requesting user owns the resource
- **Prisma driver adapter** — uses `@prisma/adapter-pg` with a `pg.Pool` for local PostgreSQL
- **Response serialization** — Prisma camelCase fields mapped to snake_case in JSON responses to match the FastAPI contract
