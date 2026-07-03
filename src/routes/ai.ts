import { Router, Request, Response } from "express";
import Replicate from "replicate";
import { requireAuth } from "../middleware/auth.js";
import { requireTokens } from "../middleware/tokenGate.js";
import { deductTokens } from "../services/tokenService.js";
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

const GENERATION_MODELS = ["flux-schnell", "sdxl", "imagen-3"] as const;
type GenerationModel = typeof GENERATION_MODELS[number];

const isValidModel = (v: unknown): v is GenerationModel =>
  typeof v === "string" && (GENERATION_MODELS as readonly string[]).includes(v);

const SDXL_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "2:3": { width: 832, height: 1216 },
  "3:2": { width: 1216, height: 832 },
  "3:4": { width: 896, height: 1152 },
  "4:3": { width: 1152, height: 896 },
  "4:5": { width: 912, height: 1144 },
  "5:4": { width: 1144, height: 912 },
  "9:16": { width: 768, height: 1344 },
  "16:9": { width: 1344, height: 768 },
};

// Normalize Replicate output (string | string[] | FileOutput) to a URL string.
const toUrlString = (output: unknown): string => {
  const value = Array.isArray(output) ? output[0] : output;
  if (typeof value === "string") return value;
  // Replicate's client may return FileOutput objects with a url() method.
  if (value && typeof (value as { url?: unknown }).url === "function") {
    return String((value as { url: () => unknown }).url());
  }
  return String(value);
};

router.post(
  "/remove-background",
  requireTokens("background_removal"),
  async (req: Request, res: Response) => {
    const userId = parseInt(req.user!.sub as string);
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
      const output = await replicate.run(
        "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc",
        {
          input: {
            image: image_url,
          },
        }
      );

      const resultUrl = typeof output === "string" ? output : String(output);

      const { newBalance } = await deductTokens(userId, "background_removal");

      res.json({
        success: true,
        message: "Background removed successfully",
        data: {
          result_url: resultUrl,
          token_balance: newBalance,
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
  }
);

router.post(
  "/extend-image",
  requireTokens("image_extension"),
  async (req: Request, res: Response) => {
    const userId = parseInt(req.user!.sub as string);
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

      const { newBalance } = await deductTokens(userId, "image_extension");

      res.json({
        success: true,
        message: "Image extended successfully",
        data: {
          result_url: resultUrl,
          token_balance: newBalance,
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
  }
);

router.post(
  "/generate-image",
  requireTokens("ai_image_generation"),
  async (req: Request, res: Response) => {
    const userId = parseInt(req.user!.sub as string);
    const { prompt, model, aspect_ratio } = req.body ?? {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({
        success: false,
        message: "prompt is required",
        statusCode: 400,
      });
      return;
    }

    if (!isValidModel(model)) {
      res.status(400).json({
        success: false,
        message: `model must be one of: ${GENERATION_MODELS.join(", ")}`,
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
      let modelId: `${string}/${string}` | `${string}/${string}:${string}`;
      let input: Record<string, unknown>;

      switch (model) {
        case "flux-schnell":
          modelId = "black-forest-labs/flux-schnell";
          input = {
            prompt: prompt.trim(),
            aspect_ratio,
            output_format: "png",
            num_outputs: 1,
          };
          break;
        case "sdxl": {
          const { width, height } = SDXL_DIMENSIONS[aspect_ratio];
          modelId =
            "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc";
          input = {
            prompt: prompt.trim(),
            width,
            height,
            num_outputs: 1,
          };
          break;
        }
        case "imagen-3":
          modelId = "google/imagen-3";
          input = {
            prompt: prompt.trim(),
            aspect_ratio,
          };
          break;
      }

      const output = await replicate.run(modelId, { input });
      const resultUrl = toUrlString(output);

      const { newBalance } = await deductTokens(userId, "ai_image_generation");

      res.json({
        success: true,
        message: "Image generated successfully",
        data: {
          result_url: resultUrl,
          token_balance: newBalance,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Image generation failed:", message);
      res.status(500).json({
        success: false,
        message: `Image generation failed: ${message}`,
        statusCode: 500,
      });
    }
  }
);

router.post(
  "/edit-image",
  requireTokens("ai_image_edit"),
  async (req: Request, res: Response) => {
    const userId = parseInt(req.user!.sub as string);
    const { image_url, prompt } = req.body ?? {};

    if (!image_url || typeof image_url !== "string") {
      res.status(400).json({
        success: false,
        message: "image_url is required",
        statusCode: 400,
      });
      return;
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({
        success: false,
        message: "prompt is required",
        statusCode: 400,
      });
      return;
    }

    try {
      const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
        input: {
          prompt: prompt.trim(),
          input_image: image_url,
          aspect_ratio: "match_input_image",
          output_format: "png",
        },
      });

      const resultUrl = toUrlString(output);

      const { newBalance } = await deductTokens(userId, "ai_image_edit");

      res.json({
        success: true,
        message: "Image edited successfully",
        data: {
          result_url: resultUrl,
          token_balance: newBalance,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Image edit failed:", message);
      res.status(500).json({
        success: false,
        message: `Image edit failed: ${message}`,
        statusCode: 500,
      });
    }
  }
);

export default router;
