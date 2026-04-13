import { Router, Request, Response } from "express";
import Replicate from "replicate";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

const router = Router();

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
});

router.use(requireAuth);

const ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
] as const;
type AspectRatio = typeof ASPECT_RATIOS[number];

const isValidAspectRatio = (v: unknown): v is AspectRatio =>
  typeof v === "string" && (ASPECT_RATIOS as readonly string[]).includes(v);

// POST /api/ai/remove-background
router.post("/remove-background", async (req: Request, res: Response) => {
  const { image_url } = req.body;

  if (!image_url || typeof image_url !== "string") {
    res.status(400).json({
      success: false,
      message: "image_url is required",
      statusCode: 400,
    });
    return;
  }

  try {
    const output = await replicate.run("851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc", {
      input: {
        image: image_url,
      },
    });

    // output is a URL string or a FileOutput object with a url() method
    const resultUrl = typeof output === "string" ? output : String(output);

    res.json({
      success: true,
      message: "Background removed successfully",
      data: {
        result_url: resultUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Background removal failed:", message);
    res.status(500).json({
      success: false,
      message: `Background removal failed: ${message}`,
      statusCode: 500,
    });
  }
});

// POST /api/ai/extend-image
router.post("/extend-image", async (req: Request, res: Response) => {
  const { image_url, aspect_ratio } = req.body ?? {};

  if (!image_url || typeof image_url !== "string") {
    res.status(400).json({
      success: false,
      message: "image_url is required",
      statusCode: 400,
    });
    return;
  }

  if (!isValidAspectRatio(aspect_ratio)) {
    res.status(400).json({
      success: false,
      message: `aspect_ratio must be one of: ${ASPECT_RATIOS.join(", ")}`,
      statusCode: 400,
    });
    return;
  }


  try {
    const output = await replicate.run("bria/expand-image", {
      input: {
        image_url,
        aspect_ratio,
        preserve_alpha: true,
        sync: true,
      },
    });

    const resultUrl = typeof output === "string" ? output : String(output);

    res.json({
      success: true,
      message: "Image extended successfully",
      data: {
        result_url: resultUrl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Image extension failed:", message);
    res.status(500).json({
      success: false,
      message: `Image extension failed: ${message}`,
      statusCode: 500,
    });
  }
});

export default router;
