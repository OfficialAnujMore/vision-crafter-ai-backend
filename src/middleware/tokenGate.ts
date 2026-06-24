import { Request, Response, NextFunction } from "express";
import { TOKEN_COSTS, type AiAction } from "../config/tokens.js";
import { getBalance } from "../services/tokenService.js";

export function requireTokens(action: AiAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = parseInt(req.user!.sub as string);
    const cost = TOKEN_COSTS[action];

    try {
      const balance = await getBalance(userId);
      if (balance < cost) {
        res.status(402).json({
          success: false,
          message: `Insufficient tokens. This action costs ${cost} tokens, you have ${balance}.`,
          statusCode: 402,
          data: { required: cost, available: balance },
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
