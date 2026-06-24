import { Router, Request, Response } from "express";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  buildObjectKey,
  buildPublicUrl,
  getPresignedUploadUrl,
} from "../utils/s3.js";

const router = Router();

router.post("/presign", requireAuth, async (req: Request, res: Response) => {
  const userId = parseInt(req.user!.sub as string);
  const { fileName, contentType, key: existingKey } = req.body ?? {};

  if (!contentType || typeof contentType !== "string") {
    res.status(400).json({
      success: false,
      message: "contentType is required",
      statusCode: 400,
    });
    return;
  }

  try {
    let key: string;

    if (existingKey) {
      // Overwrite path: confirm the requester owns this object's project.
      const project = await prisma.project.findFirst({
        where: { fileId: existingKey },
      });

      if (!project) {
        res.status(404).json({
          success: false,
          message: "No project found for the provided key",
          statusCode: 404,
        });
        return;
      }

      if (project.userId !== userId) {
        res.status(403).json({
          success: false,
          message: "You are not authorized to overwrite this object",
          statusCode: 403,
        });
        return;
      }

      key = existingKey;
    } else {
      key = buildObjectKey(userId, typeof fileName === "string" ? fileName : "");
    }

    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    res.json({
      success: true,
      data: {
        upload_url: uploadUrl,
        key,
        public_url: buildPublicUrl(key),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      success: false,
      message: `Failed to create presigned URL: ${message}`,
      statusCode: 500,
    });
  }
});

export default router;
