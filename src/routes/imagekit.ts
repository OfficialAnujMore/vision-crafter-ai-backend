import { Router, Request, Response } from "express";
import ImageKit from "@imagekit/nodejs";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

const router = Router();

const imagekit = new ImageKit({
  privateKey: env.IMAGEKIT_PRIVATE_KEY,
});

// GET /api/imagekit/auth
router.get("/auth", requireAuth, (_req: Request, res: Response) => {
  try {
    const authParams = imagekit.helper.getAuthenticationParameters();

    res.json({
      success: true,
      data: {
        token: authParams.token,
        expire: authParams.expire,
        signature: authParams.signature,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      success: false,
      message,
      statusCode: 500,
    });
  }
});

export default router;
