import { Router, Request, Response } from "express";
import Replicate from "replicate";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";

const router = Router();

const replicate = new Replicate({
  auth: env.REPLICATE_API_TOKEN,
});

router.use(requireAuth);

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

export default router;
