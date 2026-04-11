import jwt from "jsonwebtoken";
import axios from "axios";
import { env } from "../config/env.js";

export function createAccessToken(
  userId: number,
  expiresInMinutes?: number
): string {
  const minutes = expiresInMinutes ?? env.ACCESS_TOKEN_EXPIRE_MINUTES;
  return jwt.sign({ sub: String(userId), type: "access" }, env.JWT_SECRET_KEY, {
    expiresIn: minutes * 60,
  });
}

export function createRefreshToken(
  userId: number,
  expiresInDays?: number
): string {
  const days = expiresInDays ?? env.REFRESH_TOKEN_EXPIRE_DAYS;
  return jwt.sign(
    { sub: String(userId), type: "refresh" },
    env.JWT_SECRET_KEY,
    { expiresIn: days * 24 * 60 * 60 }
  );
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET_KEY);
    if (typeof payload === "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyTokenType(
  token: string,
  expectedType: "access" | "refresh"
): jwt.JwtPayload {
  const payload = verifyToken(token);

  if (!payload) {
    throw new Error(`Invalid or expired ${expectedType} token`);
  }

  const tokenType = (payload as Record<string, unknown>).type ?? "access";
  if (tokenType !== expectedType) {
    throw new Error(
      `Invalid token type. Expected ${expectedType}, got ${String(tokenType)}`
    );
  }

  return payload;
}

export async function verifyGoogleToken(
  token: string
): Promise<{
  google_id: string;
  email: string;
  name: string;
  picture: string;
}> {
  const response = await axios.get(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`
  );

  if (response.status !== 200) {
    throw new Error("Invalid token");
  }

  const tokenInfo = response.data;

  if (tokenInfo.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error("Token is for a different application");
  }

  return {
    google_id: tokenInfo.sub,
    email: tokenInfo.email,
    name: tokenInfo.name ?? "",
    picture: tokenInfo.picture ?? "",
  };
}
