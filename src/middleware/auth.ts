import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/security.js";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: jwt.JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const accessToken = req.cookies?.access_token;

  if (!accessToken) {
    res.status(401).json({
      success: false,
      message: "Access token not found in cookies",
      statusCode: 401,
    });
    return;
  }

  const payload = verifyToken(accessToken);

  if (!payload) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
      statusCode: 401,
    });
    return;
  }

  const tokenType = (payload as Record<string, unknown>).type ?? "access";
  if (tokenType !== "access") {
    res.status(401).json({
      success: false,
      message: "Invalid token type. Expected access token.",
      statusCode: 401,
    });
    return;
  }

  req.user = payload;
  next();
}
