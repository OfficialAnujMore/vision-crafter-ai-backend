import "dotenv/config";
import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET_KEY: z.string(),
  ALGORITHM: z.string().default("HS256"),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_EXPIRE_DAYS: z.coerce.number().default(7),
  GOOGLE_CLIENT_ID: z.string(),
  APP_NAME: z.string().default("VisionCrafterAI"),
  DEBUG: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  PORT: z.coerce.number().default(8000),
  CORS_ALLOW_ORIGINS: z.string().default("http://localhost:5173"),
  IMAGEKIT_PRIVATE_KEY: z.string(),
  IMAGEKIT_PUBLIC_KEY: z.string(),
  IMAGEKIT_URL_ENDPOINT: z.string(),
  REPLICATE_API_TOKEN: z.string(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ALLOW_ORIGINS.split(",").map((o) =>
  o.trim()
);
