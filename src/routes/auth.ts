import { Router, Request, Response } from "express";
import { prisma } from "../config/db.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyGoogleToken,
  verifyTokenType,
} from "../utils/security.js";

const router = Router();

// Cookie options shared across auth routes
const cookieBase = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/",
};

// POST /auth/google
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Token is required",
        statusCode: 400,
      });
      return;
    }

    const googleUserInfo = await verifyGoogleToken(token);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { googleId: googleUserInfo.google_id },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });
    } else {
      user = await prisma.user.create({
        data: {
          googleId: googleUserInfo.google_id,
          email: googleUserInfo.email,
          name: googleUserInfo.name,
          picture: googleUserInfo.picture || null,
          isActive: true,
        },
      });
    }

    const accessToken = createAccessToken(user.id, 15);
    const refreshToken = createRefreshToken(user.id, 7);

    const responseData = {
      success: true,
      message: "Authentication successful",
      data: {
        access_token: accessToken,
        token_type: "bearer",
        user: {
          id: user.id,
          google_id: user.googleId,
          email: user.email,
          name: user.name,
          picture: user.picture,
          is_active: user.isActive,
          created_at: user.createdAt.toISOString(),
        },
      },
    };

    res
      .cookie("access_token", accessToken, { ...cookieBase, maxAge: 900_000 }) // 15 min
      .cookie("refresh_token", refreshToken, {
        ...cookieBase,
        maxAge: 604_800_000,
      }) // 7 days
      .status(200)
      .json(responseData);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    res.status(401).json({
      success: false,
      message: `Invalid Google token: ${message}`,
      statusCode: 401,
    });
  }
});

// POST /auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    console.log("[AUTH] Refresh token requested");

    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      console.log("[AUTH] No refresh token found in cookies");
      res.status(401).json({
        success: false,
        message: "Refresh token not found",
        statusCode: 401,
      });
      return;
    }

    const payload = verifyTokenType(refreshToken, "refresh");
    const userId = parseInt(payload.sub as string);

    console.log(`[AUTH] Refresh token valid for user_id: ${userId}`);

    const newAccessToken = createAccessToken(userId, 15);

    console.log(`[AUTH] New access token created for user_id: ${userId}`);

    res
      .cookie("access_token", newAccessToken, {
        ...cookieBase,
        maxAge: 900_000,
      })
      .status(200)
      .json({
        success: true,
        message: "Token refreshed successfully",
        data: { access_token: newAccessToken },
      });
  } catch {
    console.log("[AUTH] Error during token refresh");
    res.status(401).json({
      success: false,
      message: "Token refresh failed: Invalid or expired refresh token",
      statusCode: 401,
    });
  }
});

// POST /auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res
    .clearCookie("access_token", cookieBase)
    .clearCookie("refresh_token", cookieBase)
    .status(200)
    .json({
      success: true,
      message: "Logged out successfully",
    });

  console.log("[AUTH] User logged out - both cookies cleared");
});

export default router;
