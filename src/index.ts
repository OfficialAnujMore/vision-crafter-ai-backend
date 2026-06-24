import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, corsOrigins } from "./config/env.js";
import { prisma } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import projectRouter from "./routes/project.js";
import imagekitRouter from "./routes/imagekit.js";
import aiRouter from "./routes/ai.js";
import paymentsRouter from "./routes/payments.js";
import stripeWebhookRouter from "./routes/stripeWebhook.js";

const app = express();

// Stripe webhook must receive raw body — mount before express.json()
app.use(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRouter
);

// Middleware
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// Routes
app.use("/auth", authRouter);
app.use("/api/projects", projectRouter);
app.use("/api/imagekit", imagekitRouter);
app.use("/api/ai", aiRouter);
app.use("/api/payments", paymentsRouter);

// Health check
app.get("/", (_req, res) => {
  res.json({ service: env.APP_NAME, status: "ok" });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function main() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    console.log(`${env.APP_NAME} backend running on http://localhost:${env.PORT}`);
  });
}

main();
