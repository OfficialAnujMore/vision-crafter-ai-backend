import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

// Presigned upload URLs expire after this window (seconds).
const PRESIGN_EXPIRY_SECONDS = 300;

function sanitizeExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return "";
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? `.${ext}` : "";
}

/**
 * Build a stable, immutable object key for a project's image.
 * One project maps to one key for its entire lifetime — title changes never
 * touch storage, and autosave overwrites this same key in place.
 */
export function buildObjectKey(userId: number | string, fileName: string): string {
  return `projects/${userId}/${randomUUID()}${sanitizeExtension(fileName)}`;
}

/** Public URL for serving an object. Swap S3_PUBLIC_BASE_URL for a CloudFront domain later. */
export function buildPublicUrl(key: string): string {
  const base = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${key}`;
}

/** Generate a presigned PUT URL so the browser can upload bytes directly to S3. */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

/** Delete an object. Treats a missing object as success (idempotent). */
export async function deleteObject(key: string): Promise<void> {
  if (!key) throw new Error("key is required");
  await s3.send(
    new DeleteObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: key })
  );
}
