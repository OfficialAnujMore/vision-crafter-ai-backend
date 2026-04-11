# Vision Crafter AI - Backend

REST API backend for Vision Crafter AI, providing authentication, project management, and image hosting integration. Built with Express 5 and TypeScript, using PostgreSQL for persistence and ImageKit for media storage.

## Tech Stack

- **Runtime:** Node.js with TypeScript 6
- **Framework:** Express 5
- **Database:** PostgreSQL
- **ORM:** Prisma 7
- **Authentication:** JWT (access + refresh tokens) with Google OAuth
- **Image Storage:** ImageKit
- **Validation:** Zod

## API Endpoints

### Authentication (`/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/google` | Google OAuth login/signup |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Clear auth cookies |

### Projects (`/api/projects`) — Requires authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/create` | Create a new project |
| GET | `/api/projects/:projectId` | Get project by ID |
| GET | `/api/projects/user/:userId` | List user's projects |
| PUT | `/api/projects/:projectId` | Full project update |
| PATCH | `/api/projects/:projectId` | Partial project update |
| DELETE | `/api/projects/:fileId` | Delete project and ImageKit file |

### ImageKit (`/api/imagekit`) — Requires authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/imagekit/auth` | Get upload authentication params |

## Prerequisites

- Node.js (v18+)
- PostgreSQL

## Setup

1. Clone the repository:

```bash
git clone https://github.com/OfficialAnujMore/vision-crafter-ai-backend.git
cd vision-crafter-ai-backend
```

2. Install dependencies:

```bash
npm install
```

3. Create a PostgreSQL database:

```bash
createdb visioncrafter
```

4. Create a `.env` file in the root directory (refer to `.env.example`):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/visioncrafter"

JWT_SECRET_KEY=your-jwt-secret
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

IMAGEKIT_PRIVATE_KEY=your-imagekit-private-key
IMAGEKIT_PUBLIC_KEY=your-imagekit-public-key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-endpoint

# CORS: comma-separated list of allowed frontend origins
CORS_ALLOW_ORIGINS=http://localhost:5173

PORT=8000
```

5. Generate Prisma client and push schema to the database:

```bash
npm run db:generate
npm run db:push
```

6. Start the development server:

```bash
npm run dev
```

The server will be running at `http://localhost:8000`.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create and apply a database migration |
| `npm run db:push` | Push schema to DB without migration |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

## Project Structure

```
src/
├── index.ts             # Express app setup, middleware, route mounting
├── config/
│   ├── env.ts           # Zod-validated environment schema
│   └── db.ts            # Prisma client with PostgreSQL connection pool
├── routes/
│   ├── auth.ts          # Google OAuth, JWT token management
│   ├── project.ts       # Project CRUD with ownership checks
│   └── imagekit.ts      # ImageKit upload authentication
├── middleware/
│   ├── auth.ts          # JWT cookie verification middleware
│   └── errorHandler.ts  # Global error handler with AppError class
└── utils/
    ├── security.ts      # JWT creation/verification, Google token validation
    └── imagekit.ts      # ImageKit API (fetch, rename, delete)

prisma/
└── schema.prisma        # Database schema (User & Project models)
```

## Authentication Flow

1. Frontend sends Google ID token to `POST /auth/google`
2. Backend verifies the token with Google
3. User is created or updated in the database
4. Access token (15 min) and refresh token (7 days) are set as HttpOnly cookies
5. Protected routes verify the access token via the `requireAuth` middleware
6. When the access token expires, `POST /auth/refresh` issues a new one

## Related

- [Frontend Repository](https://github.com/OfficialAnujMore/vision-crafter-ai-frontend)
